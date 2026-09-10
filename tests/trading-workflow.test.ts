import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk, intentFromSpeech, parseEstimate } from '../lib/trading/workflow';
import { loadPaperRecords, savePaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { compactPaperEntry, isUnfinishedWork, persistableDraft, readDraftCheckpoint, readPersistedDraft, writeDraftCheckpoint, writePersistedDraft } from '../lib/trading/desk-documents';
import { createQuoteHandler, quoteBudget } from '../lib/trading/http';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-test', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: 'NVDAc', amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};
function reviewed() {
  return deskReducer(deskReducer(initialDesk(intent), { type: 'request', requestId: 'r1' }), { type: 'quoted', requestId: 'r1', quote });
}
function storage(): PaperStorage {
  const map = new Map<string, string>();
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}

describe('shared intent and review workflow', () => {
  it('validates the response binding before review', () => {
    assert.deepEqual(parseEstimate(quote), quote);
    for (const bad of [{ ...quote, inputAmount: '101' }, { ...quote, amountOutRaw: '0' }, { ...quote, poolAddress: stock.contractAddress }, { ...quote, tokenDecimals: 18 }, { ...quote, kind: 'executable' }]) assert.throws(() => parseEstimate(bad));
  });
  it('voice and typed instructions resolve to the same canonical intent, never authorize', () => {
    assert.deepEqual(intentFromSpeech('buy NVIDIA for 100 USDC'), intent);
    assert.deepEqual(intentFromSpeech('Sell 0.5 NVDA tokens.'), { ...intent, side: 'sell', unit: 'token', amount: '0.5' });
    assert.throws(() => intentFromSpeech('buy something for 100 USDC'));
    assert.throws(() => intentFromSpeech('yes, buy NVIDIA for 100 USDC and confirm'));
    assert.throws(() => intentFromSpeech('sell 100 NVIDIA dollars'));
    assert.throws(() => intentFromSpeech('buy Tesla for 100 USDC'));
  });
  it('edits invalidate review and old responses cannot overwrite the new draft', () => {
    const edited = deskReducer(reviewed(), { type: 'edit', draft: { ...intent, amount: '101' } });
    assert.equal(edited.quote, null);
    assert.equal(edited.stage, 'draft');
    assert.deepEqual(deskReducer(edited, { type: 'quoted', requestId: 'r1', quote }), edited);
    const pending = deskReducer(edited, { type: 'request', requestId: 'r2' });
    assert.deepEqual(deskReducer(pending, { type: 'quoted', requestId: 'r2', quote }), pending);
  });
  it('cancel clears both the request and quote; expiry cannot complete', () => {
    const cancelled = deskReducer(reviewed(), { type: 'cancel' });
    assert.equal(cancelled.quote, null);
    assert.equal(cancelled.stage, 'cancelled');
    assert.throws(() => savePaperRecord(storage(), cancelled, now + 1));
    assert.equal(deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: quote.expiresAt }).stage, 'review');
  });
});

describe('local paper records', () => {
  it('persists complete assumptions and quote snapshot, survives reload, and is idempotent', () => {
    const store = storage();
    const record = savePaperRecord(store, reviewed(), now + 1);
    assert.equal(store.length, 1);
    assert.deepEqual(savePaperRecord(store, reviewed(), now + 2), record);
    assert.deepEqual(loadPaperRecords(store), [record]);
    assert.equal(record.mode, 'paper');
    assert.equal(record.quote.assumptions, PAPER_ASSUMPTIONS);
  });
  it('refuses expired, edited or unreviewed records', () => {
    assert.throws(() => savePaperRecord(storage(), reviewed(), quote.expiresAt));
    assert.throws(() => savePaperRecord(storage(), initialDesk(intent), now));
    assert.throws(() => savePaperRecord(storage(), { ...reviewed(), draft: { ...intent, amount: '200' } }, now));
  });
  it('does not report success or overwrite corrupt history on storage failure', () => {
    const store = storage();
    store.setItem('claflin.paper.v1.bad', 'not json');
    assert.throws(() => loadPaperRecords(store));
    assert.throws(() => savePaperRecord(store, reviewed(), now + 1));
    assert.equal(store.length, 1);
    const failing = { ...storage(), setItem: () => { throw new Error('quota'); } };
    assert.throws(() => savePaperRecord(failing, reviewed(), now + 1));
    assert.equal(reviewed().stage, 'review');
  });
});

describe('finished work is not in progress', () => {
  it('treats a recorded instruction as finished even when the ticket still holds its values', () => {
    const live = reviewed();
    assert.equal(isUnfinishedWork(live), true);
    assert.ok(persistableDraft(live));
    const saved = deskReducer(live, { type: 'saved', quoteId: quote.id, now: now + 1 });
    assert.equal(saved.draft.amount, intent.amount);
    assert.equal(isUnfinishedWork(saved), false);
    assert.equal(persistableDraft(saved), null);
    assert.equal(isUnfinishedWork(deskReducer(live, { type: 'cancel' })), false);
  });
  it('persists only unfinished drafts and writes a compact ledger line from the filed record', () => {
    const store = new Map<string, string>();
    const draftStore = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    writePersistedDraft(draftStore, reviewed());
    assert.deepEqual(readPersistedDraft(draftStore), intent);
    writePersistedDraft(draftStore, deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: now + 1 }));
    assert.equal(readPersistedDraft(draftStore), null);
    const record = savePaperRecord(storage(), reviewed(), now + 1);
    const entry = compactPaperEntry(record);
    assert.equal(entry.action, 'Paper buy');
    assert.match(entry.exchange, /100 USDC/);
    assert.equal(entry.recordedAt, now + 1);
  });
  it('retains a partial draft with revision metadata and resumes the unfinished work', () => {
    const store = new Map<string, string>();
    const draftStore = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    const partial = { ...initialDesk(intent), draft: { instrumentId: intent.instrumentId, side: 'buy' as const, amount: '', unit: 'USDC' as const } };
    writeDraftCheckpoint(draftStore, partial, 'hetty', 1000);
    const checkpoint = readDraftCheckpoint(draftStore, 'hetty');
    assert.ok(checkpoint, 'a partial draft is not lost');
    assert.equal(checkpoint!.draft.instrumentId, intent.instrumentId);
    assert.equal(checkpoint!.meta.revision, 1);
    assert.equal(checkpoint!.meta.complete, false);
    assert.equal(checkpoint!.meta.updatedAt, 1000);
  });
  it('increments the revision and honours the newest checkpoint on the desk', () => {
    const store = new Map<string, string>();
    const draftStore = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    writeDraftCheckpoint(draftStore, reviewed(), 'hetty', 1000);
    writeDraftCheckpoint(draftStore, reviewed(), 'hetty', 2000);
    const checkpoint = readDraftCheckpoint(draftStore, 'hetty');
    assert.equal(checkpoint!.meta.revision, 2);
    assert.equal(checkpoint!.meta.updatedAt, 2000);
    // Finished work clears both the draft and its metadata.
    writeDraftCheckpoint(draftStore, deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: now + 1 }), 'hetty', 3000);
    assert.equal(readDraftCheckpoint(draftStore, 'hetty'), null);
  });
});

describe('quote HTTP boundary', () => {
  it('rejects old ambiguous params and duplicate params before calling the reader', async () => {
    const handler = createQuoteHandler(async () => { throw new Error('should not run'); });
    for (const query of ['instrument=NVDAc&sizeUsd=100', 'side=buy&side=sell']) {
      assert.equal((await handler(new Request(`http://localhost/api/stocks/quote?${query}`))).status, 400);
    }
  });
  it('bounds in-flight work and releases capacity after failure', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const handler = createQuoteHandler(async () => { await gate; throw new Error('RPC unavailable'); });
    const first = handler(new Request('http://localhost/api/stocks/quote'));
    const second = handler(new Request('http://localhost/api/stocks/quote'));
    assert.equal((await handler(new Request('http://localhost/api/stocks/quote'))).status, 429);
    finish();
    await Promise.all([first, second]);
    assert.equal((await handler(new Request('http://localhost/api/stocks/quote'))).status, 503);
  });
  it('does not expose provider exception text', async () => {
    const handler = createQuoteHandler(async () => { throw new Error('private provider URL'); });
    const response = await handler(new Request('http://localhost/api/stocks/quote'));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('private provider'));
  });
  it('returns no-store estimates, and limits expensive requests without trusting an IP header', async () => {
    const handler = createQuoteHandler(async () => quote);
    assert.equal((await handler(new Request('http://localhost/api/stocks/quote'))).headers.get('Cache-Control'), 'no-store');
    let time = now;
    const budget = quoteBudget(() => time);
    const limited = createQuoteHandler(async () => quote, budget);
    for (let i = 0; i < 60; i++) assert.equal((await limited(new Request('http://localhost/api/stocks/quote'))).status, 200);
    assert.equal((await limited(new Request('http://localhost/api/stocks/quote'))).status, 429);
    time += 60000;
    assert.equal((await limited(new Request('http://localhost/api/stocks/quote'))).status, 200);
  });
});
