import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JESSE_DRAFT_KEY,
  JESSE_MAX_HISTORY,
  JESSE_PAPER_PREFIX,
  clearJesseDraft,
  deleteJessePaperRecord,
  loadJesseDraft,
  loadJessePaperRecords,
  parseJesseEstimate,
  parseJessePaperRecord,
  saveJesseDraft,
  saveJessePaperRecord,
  type JessePaperRecord,
} from '../lib/solana/paper.ts';
import { loadPaperRecords, type PaperStorage } from '../lib/trading/paper-records.ts';
import { supportsAccountSync } from '../lib/house.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import type { JesseDraft, MarketComparison, SolanaInstrument, SolanaPaperEstimate } from '../lib/solana/contracts.ts';

function memoryStorage(): PaperStorage & { removeItem(key: string): void } {
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

function makeQuote(overrides: Partial<SolanaPaperEstimate> = {}): SolanaPaperEstimate {
  const quotedAt = 1_900_000_000_000;
  return {
    version: 2,
    id: 'q-test-1',
    kind: 'estimate',
    mode: 'paper',
    liveExecutionEnabled: false,
    deskId: 'jesse',
    network: 'solana:mainnet',
    venue: 'jupiter',
    intent: { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' },
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
      observedAt: quotedAt - 1000,
      nextEffectiveAt: null,
    },
    router: 'metis',
    priceImpactPercent: '0',
    feeBps: 2,
    feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    slippageBps: 50,
    minOutputRaw: '29850',
    providerRequestId: 'req-abc',
    quotedAt,
    expiresAt: quotedAt + 30_000,
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
    generatedAt: 1_899_999_999_000,
    receivedAt: 1_899_999_999_500,
    session: 'regular' as const,
    status: 'fresh' as const,
  };
  return {
    version: 1,
    id: 'cmp-test-1',
    instrumentId: instrument.id,
    observedAt: 1_899_999_999_500,
    token: { ...obs, symbol: 'Crypto.AAPLX/USD', unit: 'usd-per-scaled-token' as const },
    equity: obs,
    multiplier: '1.003270125',
    status: 'comparable',
    referenceDifferenceBps: '12',
    reasonCodes: [],
    ...overrides,
  };
}

describe('jesse v2 paper records', () => {
  it('saves and reads back a record round trip, newest first', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    const saved = saveJessePaperRecord(storage, { quote, instrument, comparison: makeComparison() }, quote.quotedAt + 5000);
    assert.equal(saved.version, 2);
    assert.equal(saved.deskId, 'jesse');
    assert.equal(saved.owner, 'anonymous');
    assert.equal(storage.getItem(JESSE_PAPER_PREFIX + quote.id) !== null, true);

    const later = makeQuote({ id: 'q-test-2', quotedAt: quote.quotedAt + 60_000, expiresAt: quote.quotedAt + 90_000 });
    saveJessePaperRecord(storage, { quote: later, instrument, comparison: null }, later.quotedAt + 5000);
    const records = loadJessePaperRecords(storage);
    assert.equal(records.length, 2);
    assert.equal(records[0].id, 'q-test-2');
    assert.equal(records[1].id, 'q-test-1');
    assert.equal(records[1].comparison?.status, 'comparable');
    assert.equal(records[1].instrumentSnapshot.mint, instrument.mint);
  });

  it('filing is idempotent for the same quote', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    const first = saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 1000);
    const second = saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 2000, 'did:privy:abc');
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(loadJessePaperRecords(storage).length, 1);
  });

  it('rejects a conflicting re-file under the same id', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 1000);
    assert.throws(
      () => saveJessePaperRecord(storage, { quote: { ...quote, amountOutRaw: '31000' }, instrument, comparison: null }, quote.quotedAt + 2000),
      /identity conflict/,
    );
  });

  it('refuses an expired or not-yet-quoted estimate at filing time', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    assert.throws(() => saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.expiresAt), /fresh estimate/);
    assert.throws(() => saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt - 1), /fresh estimate/);
  });

  it('rejects an instrument snapshot that disagrees with the quote', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    const wrong = SOLANA_INSTRUMENTS.find(i => i.symbol === 'TSLAx')!;
    assert.throws(
      () => saveJessePaperRecord(storage, { quote, instrument: wrong, comparison: null }, quote.quotedAt + 1000),
      /identity conflict/,
    );
  });

  it('rejects a comparison for a different instrument', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    const comparison = makeComparison({ instrumentId: SOLANA_INSTRUMENTS.find(i => i.symbol === 'NVDAx')!.id });
    assert.throws(
      () => saveJessePaperRecord(storage, { quote, instrument, comparison }, quote.quotedAt + 1000),
      /identity conflict/,
    );
  });

  it('deletes records by id', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 1000);
    deleteJessePaperRecord(storage, quote.id);
    assert.equal(loadJessePaperRecords(storage).length, 0);
  });
});

describe('jesse v2 parse hardening', () => {
  it('rejects wrong-network or wrong-desk payloads', () => {
    const quote = makeQuote();
    const record = (): JessePaperRecord => ({
      version: 2, id: quote.id, mode: 'paper', deskId: 'jesse', owner: 'anonymous',
      createdAt: quote.quotedAt + 1000, quote, instrumentSnapshot: instrument, comparison: null,
    });
    assert.throws(() => parseJessePaperRecord(JSON.stringify({ ...record(), deskId: 'hetty' })));
    assert.throws(() => parseJessePaperRecord(JSON.stringify({ ...record(), quote: { ...quote, network: 'solana:devnet' } })));
    assert.throws(() => parseJessePaperRecord(JSON.stringify({ ...record(), quote: { ...quote, venue: 'aerodrome' } })));
    assert.throws(() => parseJessePaperRecord(JSON.stringify({ ...record(), version: 1 })));
  });

  it('rejects a record whose key/id chain disagrees', () => {
    const quote = makeQuote();
    const storage = memoryStorage();
    saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 1000);
    const raw = storage.getItem(JESSE_PAPER_PREFIX + quote.id)!;
    const tampered = JSON.parse(raw) as Record<string, unknown>;
    tampered.id = 'q-other';
    storage.setItem(JESSE_PAPER_PREFIX + quote.id, JSON.stringify(tampered));
    assert.throws(() => loadJessePaperRecords(storage));
  });

  it('rejects oversized payloads', () => {
    assert.throws(() => parseJessePaperRecord('x'.repeat(20_001)), /Invalid paper record/);
  });

  it('rejects quotes with incoherent amounts or expiry', () => {
    const base = makeQuote();
    assert.throws(() => parseJesseEstimate({ ...base, minOutputRaw: '40000' })); // min above quote out
    assert.throws(() => parseJesseEstimate({ ...base, expiresAt: base.quotedAt + 31_000 })); // window stretched
    assert.throws(() => parseJesseEstimate({ ...base, scaling: { ...base.scaling, nextEffectiveAt: base.quotedAt + 10_000 } })); // expiry beyond activation
    assert.throws(() => parseJesseEstimate({ ...base, scaling: { ...base.scaling, multiplier: 'nope' } }));
    // buy with sell-only rounding fields
    assert.throws(() => parseJesseEstimate({ ...base, requestedScaledAmount: '0.3' }));
    // sell with buy-only shape
    const sell = makeQuote({
      intent: { instrumentId: instrument.id, side: 'sell', unit: 'scaled-token', amount: '0.3' },
      inputMint: instrument.mint,
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inputSymbol: instrument.symbol,
      outputSymbol: 'USDC',
      requestedScaledAmount: '0.3',
      effectiveScaledAmount: '0.3009810375',
    });
    assert.equal(parseJesseEstimate(sell).intent.side, 'sell');
    assert.throws(() => parseJesseEstimate({ ...sell, requestedScaledAmount: null }));
  });

  it('never confuses v2 records with the legacy v1 namespace', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    saveJessePaperRecord(storage, { quote, instrument, comparison: null }, quote.quotedAt + 1000);
    // v1 loader must not see v2 rows, and vice versa.
    assert.equal(loadPaperRecords(storage).length, 0);
    assert.equal(loadJessePaperRecords(storage).length, 1);

    // A pre-existing legacy v1 row is untouched by Jesse reads/writes.
    const legacyRow = JSON.stringify({
      version: 1, id: 'legacy-1', mode: 'paper', deskId: 'hetty', owner: 'anonymous', createdAt: 1, quote: {},
    });
    storage.setItem('claflin.paper.v1.legacy-1', legacyRow);
    const records = loadJessePaperRecords(storage);
    assert.equal(records.length, 1);
    assert.equal(storage.getItem('claflin.paper.v1.legacy-1'), legacyRow);
  });

  it('enforces the bounded history cap', () => {
    const storage = memoryStorage();
    const base = makeQuote();
    for (let i = 0; i < JESSE_MAX_HISTORY; i++) {
      const quotedAt = base.quotedAt + i * 60_000;
      saveJessePaperRecord(
        storage,
        { quote: makeQuote({ id: `q-${i}`, quotedAt, expiresAt: quotedAt + 30_000 }), instrument, comparison: null },
        quotedAt + 1,
      );
    }
    assert.equal(loadJessePaperRecords(storage).length, JESSE_MAX_HISTORY);
    const overflowAt = base.quotedAt + JESSE_MAX_HISTORY * 60_000;
    assert.throws(
      () => saveJessePaperRecord(
        storage,
        { quote: makeQuote({ id: 'q-overflow', quotedAt: overflowAt, expiresAt: overflowAt + 30_000 }), instrument, comparison: null },
        overflowAt + 1,
      ),
      /history is full/,
    );
  });
});

describe('jesse draft checkpoints', () => {
  it('round-trips nullable draft fields', () => {
    const storage = memoryStorage();
    assert.deepEqual(loadJesseDraft(storage), { instrumentId: null, side: null, unit: null, amount: null });

    const partial: JesseDraft = { instrumentId: instrument.id, side: null, unit: null, amount: null };
    saveJesseDraft(storage, partial);
    assert.deepEqual(loadJesseDraft(storage), partial);

    const full: JesseDraft = { instrumentId: instrument.id, side: 'sell', unit: 'scaled-token', amount: '0.5' };
    saveJesseDraft(storage, full);
    assert.deepEqual(loadJesseDraft(storage), full);

    clearJesseDraft(storage);
    assert.deepEqual(loadJesseDraft(storage), { instrumentId: null, side: null, unit: null, amount: null });
    assert.equal(storage.getItem(JESSE_DRAFT_KEY), null);
  });

  it('saving an all-null draft clears the checkpoint', () => {
    const storage = memoryStorage();
    saveJesseDraft(storage, { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '10' });
    saveJesseDraft(storage, { instrumentId: null, side: null, unit: null, amount: null });
    assert.equal(storage.getItem(JESSE_DRAFT_KEY), null);
  });

  it('refuses incoherent side/unit pairings', () => {
    const storage = memoryStorage();
    assert.throws(() => saveJesseDraft(storage, { instrumentId: instrument.id, side: 'buy', unit: 'scaled-token', amount: '1' }));
    assert.throws(() => saveJesseDraft(storage, { instrumentId: instrument.id, side: 'sell', unit: null, amount: '1' }));
    // malformed checkpoint reads back as empty, never throws the UI over
    storage.setItem(JESSE_DRAFT_KEY, '{"instrumentId":"sol:not-base58!"}');
    assert.deepEqual(loadJesseDraft(storage), { instrumentId: null, side: null, unit: null, amount: null });
  });
});

describe('supportsAccountSync', () => {
  it('is Hetty-only; Jesse and unknown desks never sync', () => {
    assert.equal(supportsAccountSync('hetty'), true);
    assert.equal(supportsAccountSync('jesse'), false);
    assert.equal(supportsAccountSync('isabel'), false);
    assert.equal(supportsAccountSync('arbitrum'), false);
    assert.equal(supportsAccountSync('no-such-desk'), false);
  });
});
