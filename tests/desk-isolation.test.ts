import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk } from '../lib/trading/workflow';
import { loadPaperRecords, savePaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { canFileOnDesk, canReviewOnDesk, emptyDraft, enterDesk, parkDeskWork, quoteDeskId, switchDeskSession } from '../lib/trading/desk-mandate';
import { liveEvidence, paperEvidence, paperOutcomeCopy } from '../lib/trading/outcomes';
import { canFileForeground, foregroundDocument, groupRecordsByDay, ledgerPreview, recordedDayLabel, speakForeground } from '../lib/trading/desk-documents';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-isolation', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
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

describe('paper evidence is not a live outcome', () => {
  it('describes a filed paper record as filed, never filled, submitted, or a position', () => {
    const record = savePaperRecord(storage(), reviewed(), now + 1);
    const evidence = paperEvidence(record);
    assert.equal(evidence.kind, 'paper-record');
    assert.equal(evidence.status, 'filed');
    assert.equal(evidence.mode, 'paper');
    assert.equal(evidence.isFill, false);
    assert.equal(evidence.isSubmission, false);
    assert.equal(evidence.isPosition, false);
    const copy = paperOutcomeCopy();
    assert.match(copy.acknowledgement, /Filed to your paper ledger/);
    assert.match(copy.boundary, /not a fill, a submission, or a position/);
    assert.doesNotMatch(copy.heading, /fill|submit/i);
    const filled = liveEvidence('filled');
    assert.equal(filled.kind, 'live-execution');
    assert.equal(filled.isFill, true);
    assert.notEqual(evidence.kind, filled.kind);
  });
});

describe('a desk switch cannot carry an approval', () => {
  it('binds a Base paper estimate only to Hetty', () => {
    assert.equal(quoteDeskId(quote), 'hetty');
    assert.equal(canReviewOnDesk(quote, 'hetty'), true);
    assert.equal(canReviewOnDesk(quote, 'jesse'), false);
    assert.equal(canFileOnDesk(reviewed(), 'jesse'), false);
    assert.equal(canFileOnDesk(reviewed(), 'hetty'), true);
  });
  it('clears review on the destination and refuses to file a Hetty quotation there', () => {
    const { parked, entered } = switchDeskSession(
      { deskId: 'hetty', state: reviewed(), viewedRecordId: null, error: null },
      'jesse',
      {},
      intent,
    );
    assert.equal(entered.deskId, 'jesse');
    assert.equal(entered.state.quote, null);
    assert.equal(entered.state.stage, 'draft');
    assert.notEqual(entered.state.draft.instrumentId, intent.instrumentId);
    assert.throws(() => savePaperRecord(storage(), reviewed(), now + 1, 'jesse'));
    const store = storage();
    const hetty = savePaperRecord(store, reviewed(), now + 1, 'hetty');
    assert.equal(hetty.deskId, 'hetty');
    assert.deepEqual(loadPaperRecords(store, 'jesse'), []);
    assert.equal(loadPaperRecords(store, 'hetty')[0].id, hetty.id);
    const back = enterDesk('hetty', parked, intent);
    assert.equal(back.state.quote?.id, quote.id);
  });
  it('does not apply another desk’s persisted draft to a closed room', () => {
    const closed = enterDesk('jesse', {}, intent);
    assert.deepEqual(closed.state.draft, emptyDraft());
    assert.equal(closed.state.quote, null);
  });
  it('parks an in-flight estimate as a recoverable draft, not a resumable request', () => {
    const loading = deskReducer(initialDesk(intent), { type: 'request', requestId: 'inflight' });
    const parked = parkDeskWork({ deskId: 'hetty', state: loading, viewedRecordId: null, error: null });
    assert.equal(parked.state.stage, 'draft');
    assert.equal(parked.state.requestId, null);
    assert.equal(parked.state.quote, null);
    assert.deepEqual(parked.state.draft, intent);
    assert.match(parked.state.message ?? '', /interrupted/);
    const late = deskReducer(parked.state, { type: 'quoted', requestId: 'inflight', quote });
    assert.equal(late.stage, 'draft');
    assert.equal(late.quote, null);
    const { parked: sessions } = switchDeskSession(
      { deskId: 'hetty', state: loading, viewedRecordId: null, error: null },
      'jesse',
      {},
      intent,
    );
    assert.equal(sessions.hetty?.state.stage, 'draft');
    assert.equal(enterDesk('hetty', sessions, intent).state.stage, 'draft');
  });
});

describe('one foreground document', () => {
  it('will not file a hidden quotation while a filed record is in the foreground', () => {
    const review = reviewed();
    const filedId = 'filed-elsewhere';
    const foreground = foregroundDocument(review, filedId);
    assert.equal(foreground.kind, 'archive');
    assert.equal(foreground.readonly, true);
    assert.equal(canFileForeground(review, filedId), false);
    assert.equal(canFileForeground(review, null), true);
    const spoken = speakForeground(review, filedId, [{
      version: 1, id: filedId, mode: 'paper', deskId: 'hetty', createdAt: now + 1,
      quote: { ...quote, id: filedId, outputSymbol: 'AAPLc' },
    }]);
    assert.match(spoken, /read-only/);
    assert.match(spoken, /AAPLc/);
    assert.doesNotMatch(spoken, /Estimate under review/);
  });
  it('resolves an implicit watch from the visible record, not the parked draft', () => {
    const aapl = DESK_INSTRUMENTS.find(item => item.symbol === 'AAPLc')!;
    const filedId = 'filed-aapl';
    const filed = {
      version: 1 as const, id: filedId, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1,
      quote: { ...quote, id: filedId, intent: { ...intent, instrumentId: aapl.id }, outputSymbol: 'AAPLc' },
    };
    const foreground = foregroundDocument(reviewed(), filedId, [filed]);
    assert.equal(foreground.kind, 'archive');
    assert.equal(foreground.instrumentId, aapl.id);
    assert.notEqual(foreground.instrumentId, intent.instrumentId);
  });
  it('treats a vanished opened record as unavailable, not as a filed success', () => {
    const foreground = foregroundDocument(reviewed(), 'gone', []);
    assert.equal(foreground.kind, 'missing');
    assert.equal(foreground.instrumentId, null);
    assert.equal(foreground.readonly, true);
    assert.match(speakForeground(reviewed(), 'gone', []), /no longer in this browser/);
  });
  it('keeps the compact ledger to recent records even when history spans many days', () => {
    const days = Array.from({ length: 10 }, (_, index) => ({
      version: 1 as const,
      id: `day-${index}`,
      mode: 'paper' as const,
      deskId: 'hetty' as const,
      createdAt: now - index * 86_400_000,
      quote: { ...quote, id: `day-${index}` },
    }));
    const preview = ledgerPreview(days);
    assert.equal(preview.length, 5);
    assert.deepEqual(preview.map(record => record.id), ['day-0', 'day-1', 'day-2', 'day-3', 'day-4']);
    assert.ok(groupRecordsByDay(preview, now).length >= 2);
    assert.equal(groupRecordsByDay(days, now).length, 10);
    const focused = ledgerPreview(days, 'day-9');
    assert.equal(focused.length, 5);
    assert.equal(focused.at(-1)?.id, 'day-9');
  });
  it('labels recordings by day so yesterday and today do not collapse', () => {
    const today = now;
    const yesterday = now - 86_400_000;
    assert.equal(recordedDayLabel(today, today), 'Today');
    assert.equal(recordedDayLabel(yesterday, today), 'Yesterday');
    assert.notEqual(recordedDayLabel(yesterday, today), recordedDayLabel(today, today));
  });
});
