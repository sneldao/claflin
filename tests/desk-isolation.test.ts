import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk } from '../lib/trading/workflow';
import { loadPaperRecords, savePaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { canFileOnDesk, canReviewOnDesk, emptyDraft, enterDesk, quoteDeskId, switchDeskSession } from '../lib/trading/desk-mandate';
import { liveEvidence, paperEvidence, paperOutcomeCopy } from '../lib/trading/outcomes';

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
    assert.match(copy.acknowledgement, /Filed in your paper record/);
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
});
