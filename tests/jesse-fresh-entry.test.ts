import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTradingDesk } from '../lib/trading/useTradingDesk';
import { JesseDeskSurface } from '../components/desk/JesseDeskSurface';
import { entryIntentWithInstruction } from '../lib/house-entry';
import { JESSE_PAPER_PREFIX, loadJessePaperRecords, saveJessePaperRecord } from '../lib/solana/paper';
import { createJesseDeskSession } from '../lib/solana/useJesseDesk';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { offeringForInstrument } from '../lib/desk/offerings';
import { SOLANA_PAPER_ESTIMATE_FIXTURE } from '../lib/solana/fixtures';
import { resetContainer, getRootElement } from './jsdom-setup';
import type { useTradingDesk as UseTradingDesk } from '../lib/trading/useTradingDesk';
import type { CommandResult, JesseIntent, SolanaPaperEstimate } from '../lib/solana/contracts';

const apple = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const T0 = 1_900_000_000_000;
const BUY_INTENT: JesseIntent = { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' };

function makeQuote(overrides: Partial<SolanaPaperEstimate> = {}): SolanaPaperEstimate {
  return {
    ...SOLANA_PAPER_ESTIMATE_FIXTURE,
    id: 'q-fresh-default',
    intent: BUY_INTENT,
    instrumentAddress: apple.mint,
    instrumentName: apple.name,
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    outputMint: apple.mint,
    inputSymbol: 'USDC',
    outputSymbol: apple.symbol,
    amountInRaw: '100000000',
    amountOutRaw: '30000',
    inputAmount: '100',
    outputAmount: '0.3009810375',
    requestedScaledAmount: null,
    effectiveScaledAmount: '0.3009810375',
    priceImpactPercent: '0',
    feeBps: 2,
    feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    scaling: { multiplier: '1.003270125', observedSlot: 447810700, observedAt: T0 - 1000, nextEffectiveAt: null },
    minOutputRaw: '29850',
    quotedAt: T0,
    expiresAt: T0 + 30_000,
    ...overrides,
  };
}

function seedRecord() {
  const quote = makeQuote({ id: 'q-fresh-seed' });
  const record = saveJessePaperRecord(
    window.localStorage,
    { quote, instrument: apple, comparison: null },
    T0,
  );
  return { record, serialized: window.localStorage.getItem(JESSE_PAPER_PREFIX + record.id)! };
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('jesse fresh foyer entry over saved state', () => {
  let root: Root | null = null;
  let desk: ReturnType<typeof UseTradingDesk> | null = null;
  const realFetch = globalThis.fetch;

  function Harness() {
    const d = useTradingDesk();
    desk = d;
    return createElement(JesseDeskSurface, { desk: d });
  }

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    desk = null;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = url.includes('/marks') ? '{"marks":[]}' : '{}';
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });

  afterEach(async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  it('applies a fresh instruction over an archived record without mutating the record', async () => {
    const { record, serialized } = seedRecord();
    await act(async () => { root = createRoot(getRootElement()); root.render(createElement(Harness)); });
    await flush();
    await act(async () => { desk!.enterDesk('jesse'); });
    await flush();
    assert.equal(desk!.jesse.historyReady, true);

    await act(async () => { desk!.jesse.openRecord(record.id); });
    await flush();
    assert.equal(desk!.jesse.foreground.kind, 'archive');

    const offering = offeringForInstrument(apple.id)!;
    const intent = entryIntentWithInstruction('sell Apple shares', 'typed')!;
    await act(async () => { desk!.enterDesk('jesse', offering.offeringId, intent); });
    await flush();
    await flush();

    const draft = desk!.jesse.state.draft;
    assert.equal(draft.instrumentId, apple.id);
    assert.equal(draft.side, 'sell');
    assert.equal(draft.unit, 'scaled-token');
    assert.equal(draft.amount, null);
    assert.notEqual(desk!.jesse.foreground.kind, 'receipt');
    assert.equal(window.localStorage.getItem(JESSE_PAPER_PREFIX + record.id), serialized);
    assert.match(getRootElement().textContent ?? '', /sell Apple shares/);
  });

  it('accepts a fresh correction over a readonly record view without changing records', async () => {
    const { record, serialized } = seedRecord();
    await act(async () => { root = createRoot(getRootElement()); root.render(createElement(Harness)); });
    await flush();
    await act(async () => { desk!.enterDesk('jesse'); });
    await flush();
    await act(async () => { desk!.jesse.openRecord(record.id); });
    await flush();
    assert.equal(desk!.jesse.foreground.kind, 'archive');

    let result: CommandResult | null = null;
    await act(async () => {
      result = await desk!.jesse.run({ type: 'clarify', draft: { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '10' }, field: 'side', question: '' });
    });
    assert.equal(result!.status, 'clarify');
    assert.equal(desk!.jesse.state.stage, 'draft');
    assert.equal(desk!.jesse.state.draft.amount, '10');
    assert.equal(window.localStorage.getItem(JESSE_PAPER_PREFIX + record.id), serialized);
    assert.equal(loadJessePaperRecords(window.localStorage).length, 1);
  });

  it('keeps an actual record entry read-only', async () => {
    const { record, serialized } = seedRecord();
    await act(async () => { root = createRoot(getRootElement()); root.render(createElement(Harness)); });
    await flush();
    await act(async () => { desk!.enterDesk('jesse', null, null, record.id); });
    await flush();
    assert.equal(desk!.entryRecordId, record.id);
    const kind = desk!.jesse.foreground.kind;
    assert.ok(kind === 'archive' || kind === 'receipt');
    assert.equal(desk!.jesse.state.draft.instrumentId, null);
    assert.equal(desk!.jesse.state.draft.side, null);
    assert.equal(window.localStorage.getItem(JESSE_PAPER_PREFIX + record.id), serialized);
  });
});

describe('jesse saved-stage correction via desk session', () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      get length() { return map.size; },
      key: (index: number) => [...map.keys()][index] ?? null,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    };
  }

  it('accepts a fresh correction after filing without mutating the filed record', async () => {
    const storage = memoryStorage();
    const session = createJesseDeskSession({
      storage,
      now: () => T0,
      ports: {
        quote: async () => makeQuote({ id: 'q-fresh-session' }),
        compare: async () => null,
      },
    });

    const quoted = await session.run({ type: 'draft', intent: BUY_INTENT, quote: true });
    assert.equal(quoted.status, 'applied');
    const filed = await session.file();
    assert.equal(filed.status, 'applied');
    assert.equal(session.getSnapshot().state.stage, 'saved');
    const recordId = session.getSnapshot().viewedRecordId;
    assert.ok(recordId);
    const serialized = storage.getItem(JESSE_PAPER_PREFIX + recordId!);
    assert.ok(serialized);

    const edited = await session.edit({ side: 'sell', unit: 'scaled-token', amount: '2' }, 'side');
    assert.equal(edited.status, 'clarify');
    assert.equal(session.getSnapshot().state.draft.side, 'sell');
    assert.equal(session.getSnapshot().state.draft.amount, '2');
    assert.equal(storage.getItem(JESSE_PAPER_PREFIX + recordId!), serialized);
    assert.equal(loadJessePaperRecords(storage).length, 1);
    session.dispose();
  });
});
