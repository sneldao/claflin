import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk } from '../lib/trading/workflow';
import { savePaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { buildLedgerExport, ledgerCsv, ledgerFilename, ledgerJson } from '../lib/trading/ledger-export';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-export', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
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
function record() {
  return savePaperRecord(storage(), reviewed(), now + 1);
}

describe('ledger export', () => {
  it('names the file like a desk copy, one per day and format', () => {
    assert.equal(ledgerFilename(new Date(now), 'csv'), `claflin-paper-ledger-${new Date(now).toISOString().slice(0, 10)}.csv`);
    assert.equal(ledgerFilename(new Date(now), 'json').endsWith('.json'), true);
  });

  it('emits a CSV with a header, one honest row per record', () => {
    const csv = ledgerCsv([record()]);
    const lines = csv.split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'recorded,symbol,action,spend,received,record,pool');
    assert.match(lines[1], /"paper buy"/);
    assert.match(lines[1], /"100 USDC"/);
    assert.match(lines[1], /"0\.43369593 NVDAc"/);
    assert.match(lines[1], new RegExp(stock.venuePairs[0].poolAddress));
  });

  it('escapes CSV fields so quotes inside values cannot break the row', () => {
    const named = { ...quote, instrumentName: 'The "Original" Stock' };
    const state = deskReducer(deskReducer(initialDesk(intent), { type: 'request', requestId: 'r1' }), { type: 'quoted', requestId: 'r1', quote: named });
    const store = storage();
    const rec = savePaperRecord(store, state, now + 1);
    const row = ledgerCsv([rec]).split('\n')[1];
    assert.equal(row?.split('","').length, 7, 'a quoted field must not add columns');
  });

  it('the JSON copy states what it is — simulations, not fills', () => {
    const payload = JSON.parse(ledgerJson([record()]));
    assert.equal(payload.kind, 'claflin-paper-ledger');
    assert.equal(payload.mode, 'paper');
    assert.match(payload.note, /not fills/i);
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].side, 'buy');
    assert.equal(payload.records[0].symbol, stock.symbol);
    assert.equal(payload.records[0].shareEquivalent, '0.43369593');
  });

  it('builds the export with the right content type per format', () => {
    const rec = record();
    const csv = buildLedgerExport([rec], 'csv', new Date(now));
    const json = buildLedgerExport([rec], 'json', new Date(now));
    assert.equal(csv.type, 'text/csv');
    assert.equal(json.type, 'application/json');
    assert.equal(csv.filename.endsWith('.csv'), true);
  });
});
