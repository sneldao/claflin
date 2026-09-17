import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JESSE_WATCHES_KEY,
  createJesseController,
  loadJesseWatches,
  type JesseController,
  type JesseControllerPorts,
} from '../lib/solana/controller.ts';
import { loadJessePresentation } from '../lib/solana/presentation.ts';
import { loadJesseDraft, loadJessePaperRecords } from '../lib/solana/paper.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import { fixtureMint } from '../lib/solana/fixtures.ts';
import type { PaperStorage } from '../lib/trading/paper-records.ts';
import type {
  DeskRevision,
  JesseIntent,
  MarketComparison,
  SolanaInstrument,
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

const instrument: SolanaInstrument = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const otherInstrument: SolanaInstrument = SOLANA_INSTRUMENTS.find(i => i.symbol === 'NVDAx')!;

const T0 = 1_900_000_000_000;
let currentTime = T0;

const BUY_INTENT: JesseIntent = { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' };

function makeQuote(overrides: Partial<SolanaPaperEstimate> = {}): SolanaPaperEstimate {
  return {
    version: 2,
    id: 'q-ctrl-1',
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
    providerRequestId: 'req-ctrl-1',
    quotedAt: T0,
    expiresAt: T0 + 30_000,
    assumptions: 'Paper estimate.',
    ...overrides,
  };
}

function makeComparison(overrides: Partial<MarketComparison> = {}): MarketComparison {
  const obs = {
    feedId: null,
    symbol: 'Equity.US.AAPL/USD',
    source: 'pyth-pro' as const,
    unit: 'usd-per-share' as const,
    price: '255.5',
    confidence: '0.13',
    generatedAt: T0 - 1000,
    receivedAt: T0 - 500,
    session: 'regular' as const,
    status: 'fresh' as const,
  };
  return {
    version: 1,
    id: 'cmp-ctrl-1',
    instrumentId: instrument.id,
    observedAt: T0 - 500,
    token: { ...obs, symbol: 'Crypto.AAPLX/USD', unit: 'usd-per-scaled-token' as const },
    equity: obs,
    multiplier: '1.003270125',
    status: 'comparable',
    referenceDifferenceBps: '12',
    reasonCodes: [],
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(portOverrides: Partial<JesseControllerPorts> = {}) {
  currentTime = T0;
  const storage = memoryStorage();
  const ports: JesseControllerPorts = {
    quote: async () => makeQuote(),
    compare: async () => null,
    ...portOverrides,
  };
  const controller = createJesseController({
    storage,
    ports,
    now: () => currentTime,
    randomId: () => 'test-id',
  });
  return { storage, ports, controller };
}

function expected(controller: JesseController): DeskRevision {
  const s = controller.getState();
  return { deskId: 'jesse', revision: s.revision, sessionGeneration: s.sessionGeneration };
}

describe('jesse controller — revision/session guard', () => {
  it('stale expected revision returns stale and mutates nothing', async () => {
    const { storage, controller } = setup();
    const stale = await controller.applyJesseCommand(
      { type: 'describe' },
      { deskId: 'jesse', revision: 99, sessionGeneration: 1 },
    );
    assert.equal(stale.status, 'stale');
    assert.equal(stale.revision, 0);
    assert.equal(stale.quoteId, null);
    assert.equal(stale.evidenceId, null);
    assert.match(stale.spokenText, /out of date/i);
    const s = controller.getState();
    assert.equal(s.revision, 0);
    assert.equal(s.stage, 'draft');
    assert.deepEqual(s.draft, { instrumentId: null, side: null, unit: null, amount: null });
    assert.equal(storage.length, 0);
  });

  it('stale session generation and wrong desk id are rejected the same way', async () => {
    const { controller } = setup();
    const wrongGen = await controller.applyJesseCommand(
      { type: 'cancel' },
      { deskId: 'jesse', revision: 0, sessionGeneration: 7 },
    );
    assert.equal(wrongGen.status, 'stale');
    const wrongDesk = await controller.applyJesseCommand(
      { type: 'cancel' },
      { deskId: 'hetty' as 'jesse', revision: 0, sessionGeneration: 1 },
    );
    assert.equal(wrongDesk.status, 'stale');
    assert.equal(controller.getState().revision, 0);
  });
});

describe('jesse controller — draft and quote', () => {
  it('draft without quote replaces the draft and persists a checkpoint', async () => {
    const { storage, controller } = setup();
    const res = await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: false }, expected(controller));
    assert.equal(res.status, 'applied');
    assert.equal(res.revision, 1);
    assert.deepEqual(controller.getState().draft, { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' });
    assert.deepEqual(loadJesseDraft(storage), controller.getState().draft);
    assert.equal(controller.getState().stage, 'draft');
  });

  it('rejects an intent whose instrument is outside the catalog before calling the port', async () => {
    let called = 0;
    const { controller } = setup({
      quote: async () => { called += 1; return makeQuote(); },
    });
    const foreign: JesseIntent = { instrumentId: `sol:${fixtureMint('not-in-catalog')}`, side: 'buy', unit: 'USDC', amount: '10' };
    const res = await controller.applyJesseCommand({ type: 'draft', intent: foreign, quote: true }, expected(controller));
    assert.equal(res.status, 'rejected');
    assert.equal(called, 0);
    assert.equal(controller.getState().revision, 0);
  });

  it('draft + quote happy path presents the estimate for review', async () => {
    const quote = makeQuote();
    const { controller } = setup({ quote: async () => quote });
    const res = await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(res.status, 'applied');
    assert.equal(res.quoteId, quote.id);
    assert.equal(res.revision, 2); // draft bump + quote-acceptance bump
    assert.match(res.spokenText, /AAPLx/);
    const s = controller.getState();
    assert.equal(s.stage, 'review');
    assert.deepEqual(s.quote, quote); // stored quote is the validated estimate
    assert.equal(s.presentedInstrument?.id, instrument.id);
    assert.equal(s.presentedInstrument?.mint, instrument.mint);
  });

  it('a failing quote port leaves an honest rejection and no quote', async () => {
    const { controller } = setup({
      quote: async () => { throw new Error('jupiter 429'); },
    });
    const res = await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(res.status, 'rejected');
    assert.match(res.spokenText, /jupiter 429/);
    assert.doesNotMatch(res.spokenText, /0\.3/); // no fabricated terms
    const s = controller.getState();
    assert.equal(s.stage, 'draft');
    assert.equal(s.quote, null);
    assert.equal(s.revision, 2); // failed turn is a state change
  });

  it('a quote answering a different instruction is refused, never presented', async () => {
    const wrong = makeQuote({ intent: { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '55' } });
    const { controller } = setup({ quote: async () => wrong });
    const res = await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(res.status, 'rejected');
    assert.equal(controller.getState().quote, null);
    assert.equal(controller.getState().stage, 'draft');
  });
});

describe('jesse controller — in-flight invalidation', () => {
  it('a clarify before the port resolves drops the late quote response', async () => {
    const gate = deferred<SolanaPaperEstimate>();
    const { storage, controller } = setup({ quote: () => gate.promise });
    const pending = controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(controller.getState().stage, 'quoting');
    assert.equal(controller.getState().revision, 1);

    const clarify = await controller.applyJesseCommand(
      { type: 'clarify', draft: { instrumentId: instrument.id, side: null, unit: null, amount: '10' }, field: 'side', question: 'Buy or sell?' },
      expected(controller),
    );
    assert.equal(clarify.status, 'clarify');
    assert.equal(clarify.revision, 2);

    gate.resolve(makeQuote());
    const late = await pending;
    assert.equal(late.status, 'stale'); // silently dropped — the clarify already spoke
    const s = controller.getState();
    assert.equal(s.stage, 'draft');
    assert.equal(s.quote, null);
    assert.equal(s.draft.side, null); // no coercion to buy
    assert.equal(s.draft.amount, '10');
    assert.deepEqual(loadJesseDraft(storage), s.draft);
  });

  it('cancel during quoting drops the late response', async () => {
    const gate = deferred<SolanaPaperEstimate>();
    const { controller } = setup({ quote: () => gate.promise });
    const pending = controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    const cancel = await controller.applyJesseCommand({ type: 'cancel' }, expected(controller));
    assert.equal(cancel.status, 'applied');
    gate.resolve(makeQuote());
    const late = await pending;
    assert.equal(late.status, 'stale');
    const s = controller.getState();
    assert.equal(s.stage, 'draft');
    assert.equal(s.quote, null);
  });

  it('endSession during quoting drops the late response', async () => {
    const gate = deferred<SolanaPaperEstimate>();
    const { controller } = setup({ quote: () => gate.promise });
    const pending = controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    controller.endSession();
    assert.equal(controller.getState().sessionGeneration, 2);
    assert.equal(controller.getState().stage, 'draft');
    gate.resolve(makeQuote());
    const late = await pending;
    assert.equal(late.status, 'stale');
    assert.equal(controller.getState().quote, null);
  });
});

describe('jesse controller — clarify', () => {
  it('stores a partial draft with null side, clears quote authority, checkpoints', async () => {
    const { storage, controller } = setup();
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(controller.getState().stage, 'review');
    const res = await controller.applyJesseCommand(
      { type: 'clarify', draft: { instrumentId: instrument.id, side: null, unit: null, amount: null }, field: 'side', question: 'Buy or sell?' },
      expected(controller),
    );
    assert.equal(res.status, 'clarify');
    assert.equal(res.spokenText, 'Buy or sell?');
    const s = controller.getState();
    assert.equal(s.stage, 'draft');
    assert.equal(s.quote, null);
    assert.equal(s.presentedInstrument, null);
    assert.equal(s.draft.side, null);
    assert.equal(s.draft.unit, null);
    assert.deepEqual(loadJesseDraft(storage), { instrumentId: instrument.id, side: null, unit: null, amount: null });
  });

  it('refuses an incoherent side/unit pairing without mutating', async () => {
    const { storage, controller } = setup();
    const res = await controller.applyJesseCommand(
      { type: 'clarify', draft: { instrumentId: instrument.id, side: 'buy', unit: 'scaled-token', amount: '1' }, field: 'units', question: 'Which units?' },
      expected(controller),
    );
    assert.equal(res.status, 'rejected');
    assert.equal(controller.getState().revision, 0);
    assert.deepEqual(loadJesseDraft(storage), { instrumentId: null, side: null, unit: null, amount: null });
    assert.equal(storage.length, 0);
  });
});

describe('jesse controller — compare', () => {
  it('never silently replaces a different selected instrument — it asks', async () => {
    let called = 0;
    const { controller } = setup({
      compare: async () => { called += 1; return makeComparison(); },
    });
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: false }, expected(controller));
    const res = await controller.applyJesseCommand({ type: 'compare', instrumentId: otherInstrument.id }, expected(controller));
    assert.equal(res.status, 'clarify');
    assert.match(res.spokenText, /AAPLx/);
    assert.equal(called, 0);
    assert.equal(controller.getState().comparison, null);
    assert.equal(controller.getState().revision, 1); // no mutation
  });

  it('stores presented evidence on success', async () => {
    const comparison = makeComparison();
    const { controller } = setup({ compare: async () => comparison });
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: false }, expected(controller));
    const res = await controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    assert.equal(res.status, 'applied');
    assert.equal(res.evidenceId, comparison.id);
    assert.equal(res.revision, 2);
    assert.equal(controller.getState().comparison, comparison);
  });

  it('a failing port is an honest rejection with no fabricated evidence', async () => {
    const { controller } = setup({
      compare: async () => { throw new Error('redis down'); },
    });
    const res = await controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    assert.equal(res.status, 'rejected');
    assert.match(res.spokenText, /unavailable/i);
    assert.equal(controller.getState().comparison, null);
    assert.equal(controller.getState().revision, 0);
  });
});

describe('jesse controller — presentation-only commands', () => {
  it('explain, describe, and focus never bump the revision or touch work state', async () => {
    const quote = makeQuote();
    const { storage, controller } = setup({ quote: async () => quote });
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    const before = controller.getState();
    const revision = before.revision;

    const explain = await controller.applyJesseCommand({ type: 'explain', topic: 'reference-difference' }, expected(controller));
    assert.equal(explain.status, 'applied');
    assert.match(explain.spokenText, /basis points/);

    const describe = await controller.applyJesseCommand({ type: 'describe' }, expected(controller));
    assert.equal(describe.status, 'applied');
    assert.match(describe.spokenText, /Under review/);

    const focus = await controller.applyJesseCommand({ type: 'focus', target: 'instruction', objectId: quote.id }, expected(controller));
    assert.equal(focus.status, 'applied');

    const after = controller.getState();
    assert.equal(after.revision, revision);
    assert.equal(after.quote, before.quote); // object identities intact
    assert.equal(after.draft, before.draft);
    assert.equal(after.stage, 'review');
    assert.equal(after.presentation.focus, 'instruction');
    assert.equal(loadJessePresentation(storage).focus, 'instruction');
  });

  it('all four explain topics speak deterministic, honest copy', async () => {
    const { controller } = setup();
    for (const topic of ['reference-difference', 'market-hours', 'scaled-units', 'paper-mode'] as const) {
      const res = await controller.applyJesseCommand({ type: 'explain', topic }, expected(controller));
      assert.equal(res.status, 'applied');
      assert.ok(res.spokenText.length > 40);
      assert.equal(res.revision, 0);
    }
  });

  it('focus on an unknown record asks; focus on a filed record is applied and persisted', async () => {
    const quote = makeQuote();
    const { storage, controller } = setup({ quote: async () => quote });
    const unknown = await controller.applyJesseCommand(
      { type: 'focus', target: 'record', objectId: 'q-nope' },
      expected(controller),
    );
    assert.equal(unknown.status, 'clarify');
    assert.equal(controller.getState().presentation.focus, 'desk');

    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    const revision = controller.getState().revision;
    const known = await controller.applyJesseCommand(
      { type: 'focus', target: 'record', objectId: quote.id },
      expected(controller),
    );
    assert.equal(known.status, 'applied');
    assert.equal(controller.getState().revision, revision); // presentation-only
    assert.equal(controller.getState().presentation.focus, 'record');
    assert.equal(controller.getState().presentation.objectId, quote.id);
    assert.deepEqual(loadJessePresentation(storage), { mode: 'night', focus: 'record', objectId: quote.id });
  });

  it('focus on evidence requires the current comparison id', async () => {
    const comparison = makeComparison();
    const { controller } = setup({ compare: async () => comparison });
    const miss = await controller.applyJesseCommand({ type: 'focus', target: 'evidence', objectId: 'cmp-nope' }, expected(controller));
    assert.equal(miss.status, 'clarify');
    await controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    const hit = await controller.applyJesseCommand({ type: 'focus', target: 'evidence', objectId: comparison.id }, expected(controller));
    assert.equal(hit.status, 'applied');
    assert.equal(controller.getState().presentation.focus, 'evidence');
  });
});

describe('jesse controller — cancel', () => {
  it('cancel during review clears quote authority and keeps the draft', async () => {
    const { controller } = setup();
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    const res = await controller.applyJesseCommand({ type: 'cancel' }, expected(controller));
    assert.equal(res.status, 'applied');
    const s = controller.getState();
    assert.equal(s.stage, 'cancelled');
    assert.equal(s.quote, null);
    assert.equal(s.draft.instrumentId, instrument.id); // draft kept
  });

  it('a no-op cancel speaks honestly', async () => {
    const { controller } = setup();
    const res = await controller.applyJesseCommand({ type: 'cancel' }, expected(controller));
    assert.equal(res.status, 'rejected');
    assert.equal(res.spokenText, 'Nothing to cancel.');
    assert.equal(res.revision, 1); // per spec, a no-op cancel still bumps
  });
});

describe('jesse controller — watch', () => {
  it('toggles watches, persists them, and survives a reload + restore', async () => {
    const { storage, controller } = setup();
    const on = await controller.applyJesseCommand({ type: 'watch', instrumentId: instrument.id }, expected(controller));
    assert.equal(on.status, 'applied');
    assert.equal(on.spokenText, 'Watching AAPLx.');
    assert.deepEqual(controller.getState().watches, [instrument.id]);
    assert.deepEqual(loadJesseWatches(storage), [instrument.id]);

    const reloaded = createJesseController({
      storage,
      ports: { quote: async () => makeQuote(), compare: async () => null },
      now: () => currentTime,
    });
    assert.deepEqual(reloaded.getState().watches, []);
    reloaded.restore();
    assert.deepEqual(reloaded.getState().watches, [instrument.id]);

    const off = await reloaded.applyJesseCommand({ type: 'watch', instrumentId: instrument.id }, expected(reloaded));
    assert.equal(off.status, 'applied');
    assert.equal(off.spokenText, 'Stopped watching AAPLx.');
    assert.deepEqual(reloaded.getState().watches, []);
    assert.equal(storage.getItem(JESSE_WATCHES_KEY), '[]');
  });

  it('rejects an instrument outside the allowlist', async () => {
    const { controller } = setup();
    const res = await controller.applyJesseCommand(
      { type: 'watch', instrumentId: `sol:${fixtureMint('not-in-catalog')}` },
      expected(controller),
    );
    assert.equal(res.status, 'rejected');
    assert.deepEqual(controller.getState().watches, []);
    assert.equal(controller.getState().revision, 0);
  });
});

describe('jesse controller — file-paper', () => {
  async function reviewedQuote(controller: JesseController, quote: SolanaPaperEstimate): Promise<void> {
    await controller.applyJesseCommand({ type: 'draft', intent: BUY_INTENT, quote: true }, expected(controller));
    assert.equal(controller.getState().quote?.id, quote.id);
  }

  it('rejects the wrong quote id, an expired quote, and filing without review', async () => {
    const quote = makeQuote();
    const { controller } = setup({ quote: async () => quote });

    const noReview = await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    assert.equal(noReview.status, 'rejected');
    assert.match(noReview.spokenText, /no reviewed estimate/i);

    await reviewedQuote(controller, quote);
    const wrongId = await controller.applyJesseCommand({ type: 'file-paper', quoteId: 'q-other' }, expected(controller));
    assert.equal(wrongId.status, 'rejected');
    assert.match(wrongId.spokenText, /not the estimate under review/i);

    currentTime = quote.expiresAt + 1;
    const expired = await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    assert.equal(expired.status, 'rejected');
    assert.match(expired.spokenText, /expired/i);
    assert.equal(loadJessePaperRecords(memoryStorage()).length, 0);
  });

  it('files a loadable v2 record freezing the instrument snapshot and presented comparison', async () => {
    const quote = makeQuote();
    const comparison = makeComparison();
    const { storage, controller } = setup({ quote: async () => quote, compare: async () => comparison });
    await reviewedQuote(controller, quote);
    await controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));

    currentTime = T0 + 5_000;
    const res = await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    assert.equal(res.status, 'applied');
    assert.equal(res.quoteId, quote.id);
    assert.match(res.spokenText, /Filed paper record/);
    assert.equal(controller.getState().stage, 'saved');

    const records = loadJessePaperRecords(storage);
    assert.equal(records.length, 1);
    assert.equal(records[0].id, quote.id);
    assert.deepEqual(records[0].instrumentSnapshot, instrument);
    assert.deepEqual(records[0].comparison, comparison);
    assert.equal(records[0].deskId, 'jesse');
  });

  it('repeat file-paper with the same quote id is idempotent — one record, no extra bump', async () => {
    const quote = makeQuote();
    const { storage, controller } = setup({ quote: async () => quote });
    await reviewedQuote(controller, quote);
    currentTime = T0 + 5_000;
    const first = await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    assert.equal(first.status, 'applied');
    const revision = controller.getState().revision;

    const repeat = await controller.applyJesseCommand({ type: 'file-paper', quoteId: quote.id }, expected(controller));
    assert.equal(repeat.status, 'applied');
    assert.equal(repeat.quoteId, quote.id);
    assert.equal(controller.getState().revision, revision); // nothing changed
    assert.equal(controller.getState().stage, 'saved');
    assert.equal(loadJessePaperRecords(storage).length, 1);
  });
});

describe('jesse controller — restore', () => {
  it('restores the draft checkpoint, watches, and presentation preference', async () => {
    const { storage, controller } = setup();
    await controller.applyJesseCommand(
      { type: 'clarify', draft: { instrumentId: instrument.id, side: null, unit: null, amount: '10' }, field: 'side', question: 'Buy or sell?' },
      expected(controller),
    );
    await controller.applyJesseCommand({ type: 'watch', instrumentId: instrument.id }, expected(controller));

    const reloaded = createJesseController({
      storage,
      ports: { quote: async () => makeQuote(), compare: async () => null },
      now: () => currentTime,
    });
    reloaded.restore();
    const s = reloaded.getState();
    assert.deepEqual(s.draft, { instrumentId: instrument.id, side: null, unit: null, amount: '10' });
    assert.deepEqual(s.watches, [instrument.id]);
    assert.deepEqual(s.presentation, { mode: 'night', focus: 'desk', objectId: null });
    assert.equal(s.stage, 'draft'); // no work state is invented on restore
    assert.equal(s.quote, null);
  });
});

describe('jesse controller — compare response binding', () => {
  it('a newer command issued while the comparison reader is in flight kills the late response', async () => {
    const gate = deferred<MarketComparison | null>();
    const { controller } = setup({ compare: () => gate.promise });

    const pending = controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    // Newer speech lands before the reader answers.
    const watch = await controller.applyJesseCommand({ type: 'watch', instrumentId: instrument.id }, expected(controller));
    assert.equal(watch.status, 'applied');
    gate.resolve(makeComparison());

    const late = await pending;
    assert.equal(late.status, 'stale');
    const s = controller.getState();
    // The stale evidence never landed; only the watch did.
    assert.equal(s.comparison, null);
    assert.deepEqual(s.watches, [instrument.id]);
    assert.equal(s.revision, 1);
  });

  it('a session end kills an in-flight comparison response', async () => {
    const gate = deferred<MarketComparison | null>();
    const { controller } = setup({ compare: () => gate.promise });

    const pending = controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    controller.endSession();
    gate.resolve(makeComparison());

    const late = await pending;
    assert.equal(late.status, 'stale');
    assert.equal(controller.getState().comparison, null);
  });

  it('a compare accepted without interleaving stores evidence and bumps revision', async () => {
    const { controller } = setup({ compare: async () => makeComparison() });
    const result = await controller.applyJesseCommand({ type: 'compare', instrumentId: instrument.id }, expected(controller));
    assert.equal(result.status, 'applied');
    assert.equal(result.evidenceId, 'cmp-ctrl-1');
    assert.equal(controller.getState().revision, 1);
    assert.equal(controller.getState().comparison?.id, 'cmp-ctrl-1');
  });
});
