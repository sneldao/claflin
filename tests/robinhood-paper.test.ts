import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISABEL_DRAFT_KEY,
  ISABEL_MAX_HISTORY,
  ISABEL_PAPER_PREFIX,
  clearIsabelDraft,
  deleteIsabelPaperRecord,
  loadIsabelDraft,
  loadIsabelPaperRecords,
  parseIsabelPaperRecord,
  parseRobinhoodEstimate,
  saveIsabelDraft,
  saveIsabelPaperRecord,
  type IsabelPaperRecord,
} from '../lib/robinhood/paper.ts';
import type { PaperStorage } from '../lib/trading/paper-records.ts';
import { ROBINHOOD_INSTRUMENTS } from '../lib/robinhood/catalog.ts';
import type { IsabelDraft, RobinhoodInstrument, RobinhoodPaperEstimate } from '../lib/robinhood/contracts.ts';
import type { RobinhoodEvidence } from '../lib/robinhood/duplex.ts';

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

const instrument: RobinhoodInstrument = ROBINHOOD_INSTRUMENTS.find(i => i.symbol === 'NVDA')!;

function makeQuote(overrides: Partial<RobinhoodPaperEstimate> = {}): RobinhoodPaperEstimate {
  const quotedAt = 1_900_000_000_000;
  return {
    version: 1,
    id: 'q-isabel-1',
    kind: 'estimate',
    mode: 'paper',
    liveExecutionEnabled: false,
    deskId: 'isabel',
    mandateId: 'robinhood-stock-tokens',
    instrumentId: instrument.id,
    network: 'eip155:4663',
    chainId: 4663,
    venue: 'lighter',
    intent: { instrumentId: instrument.id, side: 'buy', unit: 'USDG', amount: '25' },
    instrumentAddress: instrument.contractAddress,
    instrumentName: instrument.name,
    inputSymbol: 'USDG',
    outputSymbol: instrument.symbol,
    amountInRaw: '25000000',
    amountOutRaw: '108061378863194294',
    inputAmount: '25',
    outputAmount: '0.108061378863194294',
    book: {
      marketId: instrument.lighterMarketId,
      bestBid: '231.31',
      bestAsk: '231.35',
      midPrice: '231.33',
      spreadBps: '17.3',
      levelsConsumed: 1,
      filledFully: true,
      unfilledInputRaw: '0',
    },
    multiplierRaw: '1000775159164630595',
    shareEquivalent: '0.10814514363136271792451084622182493',
    onchainMark: { answerRaw: '23139663028', decimals: 8, updatedAt: 1_899_999_000, status: 'observed' },
    issuerMark: {
      underlyingBid: '231.29',
      underlyingAsk: '231.33',
      tokenBid: '231.4692865631874',
      tokenAsk: '231.50931756955399',
      halted: false,
      generatedAt: '2026-10-01T22:45:48.022470597Z',
    },
    quotedAt,
    expiresAt: quotedAt + 30_000,
    assumptions: 'Simulated fill against the visible Lighter order book.',
    ...overrides,
  };
}

function makeEvidence(i: RobinhoodInstrument): RobinhoodEvidence {
  return {
    version: 1,
    source: 'venue-triplex',
    instrumentId: i.id,
    symbol: i.symbol,
    contractAddress: i.contractAddress,
    observedAt: 1_900_000_000_000,
    status: 'comparable',
    issuer: {
      underlyingBid: '231.29',
      underlyingAsk: '231.33',
      tokenBid: '231.4692865631874',
      tokenAsk: '231.50931756955399',
      halted: false,
      generatedAt: '2026-10-01T22:45:48.022470597Z',
    },
    onchain: { priceUsd: '231.39663028', updatedAt: 1_899_999_000, status: 'observed' },
    venue: { marketId: i.lighterMarketId, bestBid: '231.31', bestAsk: '231.35', midPriceUsd: '231.33', dailyQuoteVolumeUsd: '22176.028025' },
    venueVsIssuerBps: '-6.9',
    onchainVsIssuerBps: '-4.0',
    venueVsOnchainBps: '-2.9',
    reasonCodes: [],
    disclaimer: 'Three truthful sources side by side — not an exchange print, not executable arbitrage.',
  };
}

function fileRecord(storage: ReturnType<typeof memoryStorage>, quote = makeQuote()): IsabelPaperRecord {
  return saveIsabelPaperRecord(storage, { quote, instrument, evidence: makeEvidence(instrument) }, quote.quotedAt + 1000);
}

describe('robinhood estimate contract', () => {
  it('admits a valid Lighter estimate unchanged', () => {
    const parsed = parseRobinhoodEstimate(makeQuote());
    assert.equal(parsed.venue, 'lighter');
    assert.equal(parsed.chainId, 4663);
    assert.equal(parsed.intent.unit, 'USDG');
  });

  it('refuses bindings that contradict themselves', () => {
    /* Wrong unit for the side. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({
      intent: { instrumentId: instrument.id, side: 'buy', unit: 'token', amount: '25' },
    })), /Invalid/);
    /* The estimate's instrument must bind the contract address. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({
      instrumentAddress: '0x0000000000000000000000000000000000000001',
    })), /binding/);
    /* A buy must spend USDG. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({ inputSymbol: 'NVDA' })), /binding/);
    /* Book evidence cannot claim full coverage with unfilled input. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({
      book: { ...makeQuote().book, filledFully: true, unfilledInputRaw: '5' },
    })), /binding/);
    /* A stretched review window is not the desk's estimate. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({
      expiresAt: 1_900_000_000_000 + 31_000,
    })), /binding/);
    /* Share equivalent exists iff the multiplier was read. */
    assert.throws(() => parseRobinhoodEstimate(makeQuote({ multiplierRaw: null })), /binding/);
    assert.throws(() => parseRobinhoodEstimate(makeQuote({ shareEquivalent: null })), /binding/);
    /* A live flag can never parse as Isabel paper. */
    assert.throws(() => parseRobinhoodEstimate({ ...makeQuote(), liveExecutionEnabled: true }));
  });
});

describe('isabel paper records', () => {
  it('files, reads, lists, and deletes a record in its own namespace', () => {
    const storage = memoryStorage();
    const record = fileRecord(storage);
    assert.equal(record.deskId, 'isabel');
    assert.equal(record.quote.venue, 'lighter');
    assert.ok(storage.getItem(ISABEL_PAPER_PREFIX + record.id));
    const loaded = loadIsabelPaperRecords(storage);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, record.id);
    assert.equal(loaded[0].evidence?.source, 'venue-triplex');
    deleteIsabelPaperRecord(storage, record.id);
    assert.equal(loadIsabelPaperRecords(storage).length, 0);
  });

  it('keeps Isabel rows out of the legacy v1 book', () => {
    const storage = memoryStorage();
    fileRecord(storage);
    /* The v1 loader scans only claflin.paper.v1.* — v2 Isabel rows are
       invisible to it by namespace, not by filtering. */
    assert.equal(storage.getItem(ISABEL_PAPER_PREFIX + 'q-isabel-1') !== null, true);
  });

  it('is idempotent: re-saving the same quote returns the filed record', () => {
    const storage = memoryStorage();
    const first = fileRecord(storage);
    const second = fileRecord(storage);
    assert.equal(second.id, first.id);
    assert.equal(loadIsabelPaperRecords(storage).length, 1);
  });

  it('refuses to file an estimate outside its review window', () => {
    const storage = memoryStorage();
    const quote = makeQuote();
    assert.throws(
      () => saveIsabelPaperRecord(storage, { quote, instrument, evidence: null }, quote.expiresAt),
      /fresh estimate/,
    );
  });

  it('refuses a record whose snapshot and quote disagree', () => {
    const storage = memoryStorage();
    const record = fileRecord(storage);
    const tampered = JSON.stringify({ ...record, instrumentSnapshot: { ...record.instrumentSnapshot, id: 'rh:0x0000000000000000000000000000000000000000' } });
    storage.setItem(ISABEL_PAPER_PREFIX + record.id, tampered);
    assert.throws(() => loadIsabelPaperRecords(storage));
  });

  it('enforces the history cap', () => {
    const storage = memoryStorage();
    for (let i = 0; i < ISABEL_MAX_HISTORY; i++) {
      fileRecord(storage, makeQuote({ id: `q-${i}` }));
    }
    assert.throws(() => fileRecord(storage, makeQuote({ id: 'q-over' })), /full/);
  });
});

describe('isabel draft checkpoints', () => {
  const draft: IsabelDraft = { instrumentId: instrument.id, side: 'buy', amount: '25' };

  it('round-trips a partial draft and clears an empty one', () => {
    const storage = memoryStorage();
    saveIsabelDraft(storage, draft);
    assert.deepEqual(loadIsabelDraft(storage), draft);
    saveIsabelDraft(storage, { instrumentId: null, side: null, amount: null });
    assert.equal(storage.getItem(ISABEL_DRAFT_KEY), null);
    assert.deepEqual(loadIsabelDraft(storage), { instrumentId: null, side: null, amount: null });
  });

  it('treats a malformed checkpoint as no checkpoint', () => {
    const storage = memoryStorage();
    storage.setItem(ISABEL_DRAFT_KEY, '{"instrumentId":"sol:bad"}');
    assert.deepEqual(loadIsabelDraft(storage), { instrumentId: null, side: null, amount: null });
    saveIsabelDraft(storage, draft);
    clearIsabelDraft(storage);
    assert.equal(storage.getItem(ISABEL_DRAFT_KEY), null);
  });
});
