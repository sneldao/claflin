import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJesseDeskSession } from '../lib/solana/useJesseDesk.ts';
import { jesseForeground } from '../lib/solana/desk-documents.ts';
import { loadJesseDraft, loadJessePaperRecords } from '../lib/solana/paper.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import { COMPARISON_UNAVAILABLE_FIXTURE } from '../lib/solana/fixtures.ts';
import type { PaperStorage } from '../lib/trading/paper-records.ts';
import type {
  JesseIntent,
  MarketComparison,
  SolanaPaperEstimate,
} from '../lib/solana/contracts.ts';

type MemoryStorage = PaperStorage & { removeItem(key: string): void };

function memoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

const instrument = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const T0 = 1_900_000_000_000;
const BUY_INTENT: JesseIntent = { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' };

function makeQuote(overrides: Partial<SolanaPaperEstimate> = {}): SolanaPaperEstimate {
  return {
    version: 2,
    id: 'q-desk-1',
    kind: 'estimate',
    mode: 'paper',
    liveExecutionEnabled: false,
    deskId: 'jesse',
    network: 'solana:mainnet',
    venue: 'jupiter',
    intent: BUY_INTENT,
    instrumentAddress: instrument.mint,
    instrumentName: instrument.name,
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    outputMint: instrument.mint,
    inputSymbol: 'USDC',
    outputSymbol: instrument.symbol,
    amountInRaw: '100000000',
    amountOutRaw: '30000',
    inputAmount: '100',
    outputAmount: '0.3',
    requestedScaledAmount: null,
    effectiveScaledAmount: '0.3009810375',
    scaling: {
      multiplier: '1.003270125',
      observedSlot: 447810700,
      observedAt: T0 - 1000,
      nextEffectiveAt: null,
    },
    router: 'metis',
    priceImpactPercent: '0',
    feeBps: 2,
    feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    slippageBps: 50,
    minOutputRaw: '29850',
    providerRequestId: 'req-desk-1',
    quotedAt: T0,
    expiresAt: T0 + 30_000,
    assumptions: 'Paper assumptions for tests.',
    ...overrides,
  };
}

describe('jesse desk session', () => {
  it('drafts, quotes, reviews, and files a paper record', async () => {
    const storage = memoryStorage();
    let now = T0;
    const session = createJesseDeskSession({
      storage,
      now: () => now,
      ports: {
        quote: async () => makeQuote({ quotedAt: now, expiresAt: now + 30_000 }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });

    await session.edit({ instrumentId: instrument.id }, 'instrument');
    await session.edit({ side: 'buy', unit: 'USDC' }, 'side');
    await session.edit({ amount: '100' }, 'amount');
    assert.equal(session.getSnapshot().state.draft.amount, '100');
    assert.ok(loadJesseDraft(storage)?.amount === '100');

    const quoted = await session.quote();
    assert.equal(quoted.status, 'applied');
    assert.equal(session.getSnapshot().state.stage, 'review');
    assert.equal(jesseForeground(session.getSnapshot().state, null, []).kind, 'quotation');

    const filed = await session.file();
    assert.equal(filed.status, 'applied');
    assert.equal(session.getSnapshot().state.stage, 'saved');
    assert.equal(loadJessePaperRecords(storage).length, 1);
    assert.equal(session.getSnapshot().viewedRecordId, 'q-desk-1');
    session.dispose();
  });

  it('refuses filing after the estimate expires', async () => {
    const storage = memoryStorage();
    let now = T0;
    const session = createJesseDeskSession({
      storage,
      now: () => now,
      ports: {
        quote: async () => makeQuote({ quotedAt: T0, expiresAt: T0 + 30_000 }),
        compare: async () => null,
      },
    });
    await session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    now = T0 + 31_000;
    const filed = await session.file();
    assert.equal(filed.status, 'rejected');
    assert.equal(loadJessePaperRecords(storage).length, 0);
    session.dispose();
  });

  it('drops a late quote after cancel', async () => {
    const storage = memoryStorage();
    let release!: (q: SolanaPaperEstimate) => void;
    const pending = new Promise<SolanaPaperEstimate>(resolve => { release = resolve; });
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: {
        quote: () => pending,
        compare: async () => null,
      },
    });
    const quotePromise = session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    await Promise.resolve();
    assert.equal(session.getSnapshot().inFlight, 'quote');
    const cancelled = await session.cancel();
    assert.equal(cancelled.status, 'applied');
    assert.equal(session.getSnapshot().inFlight, null, 'cancel clears the obsolete request at once');
    release(makeQuote());
    const result = await quotePromise;
    assert.equal(result.status, 'stale');
    assert.notEqual(session.getSnapshot().state.stage, 'review');
    assert.equal(session.getSnapshot().lastResult, cancelled, 'a late quote must not overwrite the cancel result');
    assert.equal(session.getSnapshot().inFlight, null);
    session.dispose();
  });

  it('keeps the reviewed quote untouched when a malformed correction is rejected', async () => {
    const storage = memoryStorage();
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: { quote: async () => makeQuote(), compare: async () => null },
    });
    await session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    assert.equal(session.getSnapshot().state.stage, 'review');
    const quoteId = session.getSnapshot().state.quote?.id;

    const rejected = await session.run({
      type: 'clarify',
      draft: { instrumentId: instrument.id, side: 'sell', unit: null, amount: '50' },
      field: 'units',
      question: 'USDC buys and scaled-unit sells are different instructions — say which you meant.',
    });
    assert.equal(rejected.status, 'rejected');
    assert.equal(session.getSnapshot().state.stage, 'review');
    assert.equal(session.getSnapshot().state.quote?.id, quoteId);
    assert.equal(session.getSnapshot().state.draft.side, 'buy');
    session.dispose();
  });

  it('ends the session on dispose and reloads the draft on a new session', async () => {
    const storage = memoryStorage();
    const ports = {
      quote: async () => makeQuote(),
      compare: async () => null,
    };
    const first = createJesseDeskSession({ storage, now: () => T0, ports });
    await first.edit({ instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '25' }, 'amount');
    first.dispose();

    const second = createJesseDeskSession({ storage, now: () => T0, ports });
    assert.equal(second.getSnapshot().state.draft.amount, '25');
    assert.equal(second.getSnapshot().state.draft.instrumentId, instrument.id);
    second.dispose();
  });
  it('applies a newer instruction while an older quote is pending and ignores the late result', async () => {
    const storage = memoryStorage();
    const gates: Array<{ promise: Promise<SolanaPaperEstimate>; resolve: (q: SolanaPaperEstimate) => void }> = [];
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: {
        quote: () => {
          let resolve!: (q: SolanaPaperEstimate) => void;
          const promise = new Promise<SolanaPaperEstimate>(r => { resolve = r; });
          gates.push({ promise, resolve });
          return promise;
        },
        compare: async () => null,
      },
    });

    const first = session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    assert.equal(gates.length, 1);
    assert.equal(session.getSnapshot().inFlight, 'quote');

    await session.edit({ amount: '50' }, 'amount');
    assert.equal(session.getSnapshot().state.draft.amount, '50');
    assert.equal(session.getSnapshot().inFlight, null, 'a committed edit clears the obsolete request at once');
    const second = session.quote();
    assert.equal(gates.length, 2);
    assert.equal(session.getSnapshot().inFlight, 'quote');

    gates[0].resolve(makeQuote({ intent: BUY_INTENT }));
    const firstResult = await first;
    assert.equal(firstResult.status, 'stale');
    await new Promise(r => setTimeout(r, 0));
    assert.equal(session.getSnapshot().inFlight, 'quote');
    assert.equal(session.getSnapshot().state.quote, null);
    assert.equal(session.getSnapshot().state.draft.amount, '50');

    const secondQuote = makeQuote({
      id: 'q-desk-2',
      intent: { ...BUY_INTENT, amount: '50' },
      amountInRaw: '50000000',
      amountOutRaw: '15000',
      inputAmount: '50',
      outputAmount: '0.15',
      effectiveScaledAmount: '0.15049051875',
      minOutputRaw: '14925',
    });
    gates[1].resolve(secondQuote);
    const secondResult = await second;
    assert.equal(secondResult.status, 'applied');
    assert.equal(session.getSnapshot().state.stage, 'review');
    assert.equal(session.getSnapshot().state.quote?.id, 'q-desk-2');
    assert.equal(session.getSnapshot().inFlight, null);
    session.dispose();
  });

  it('lets view and describe proceed without cancelling an in-flight quote', async () => {
    const storage = memoryStorage();
    let release!: (q: SolanaPaperEstimate) => void;
    const gate = new Promise<SolanaPaperEstimate>(r => { release = r; });
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: { quote: () => gate, compare: async () => null },
    });
    void session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    assert.equal(session.getSnapshot().inFlight, 'quote');

    session.openRecord('no-such-record');
    const described = await session.run({ type: 'describe' });
    assert.notEqual(described.status, 'stale');
    assert.equal(session.getSnapshot().inFlight, 'quote');

    release(makeQuote());
    await new Promise(r => setTimeout(r, 0));
    assert.equal(session.getSnapshot().state.stage, 'review');
    session.dispose();
  });

  it('never calls the quote provider while the draft is incomplete', async () => {
    const storage = memoryStorage();
    let calls = 0;
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: {
        quote: async () => { calls += 1; return makeQuote(); },
        compare: async () => null,
      },
    });
    const res = await session.quote();
    assert.equal(res.status, 'clarify');
    assert.equal(calls, 0);

    await session.edit({ instrumentId: instrument.id, side: null, unit: null, amount: null }, 'instrument');
    await session.quote();
    assert.equal(calls, 0);
    session.dispose();
  });

  it('ignores a run after dispose and never marks it in-flight', async () => {
    const storage = memoryStorage();
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: { quote: async () => makeQuote(), compare: async () => null },
    });
    session.dispose();
    const res = await session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    assert.equal(res.status, 'rejected');
    assert.equal(session.getSnapshot().inFlight, null);
  });
});

describe('jesse foreground', () => {
  it('reports missing when a viewed record is gone', () => {
    const state = {
      revision: 1,
      sessionGeneration: 1,
      draft: emptyish(),
      stage: 'draft' as const,
      quote: null,
      presentedInstrument: null,
      comparison: null,
      presentation: { mode: 'compact' as const, focus: 'desk' as const, objectId: null },
      watches: [],
    };
    assert.deepEqual(jesseForeground(state, 'gone', []), {
      kind: 'missing', quoteId: 'gone', recordId: 'gone', instrumentId: null, actionable: false, readonly: true,
    });
  });
});

function emptyish() {
  return { instrumentId: null, side: null, unit: null, amount: null };
}
