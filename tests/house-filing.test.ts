import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk } from '../lib/trading/workflow';
import { savePaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { filingWhen, latestHouseFiling } from '../lib/trading/house-filing';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-filing', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function storage(): PaperStorage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('the house remembers the last filing', () => {
  it('returns nothing when both books are empty', () => {
    assert.equal(latestHouseFiling(storage()), null);
  });

  it('leads with the newest Hetty sentence and ignores an unreadable Jesse book', () => {
    const store = storage();
    const reviewed = deskReducer(deskReducer(initialDesk(intent), { type: 'request', requestId: 'r1' }), { type: 'quoted', requestId: 'r1', quote });
    const record = savePaperRecord(store, reviewed, now + 1);
    store.setItem('claflin.paper.v2.jesse.bad', '{');
    const filing = latestHouseFiling(store);
    assert.equal(filing?.deskId, 'hetty');
    assert.equal(filing?.recordId, record.id);
    assert.match(filing?.sentence ?? '', /Buy 100 USDC/);
  });

  it('names today and yesterday from the calendar, not from a visit count', () => {
    assert.equal(filingWhen(now, now), 'Today');
    assert.equal(filingWhen(now - 24 * 60 * 60 * 1000, now), 'Yesterday');
  });
});
