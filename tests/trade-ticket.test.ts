import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk, type DeskState } from '../lib/trading/workflow';
import { foregroundDocument } from '../lib/trading/desk-documents';
import type { useTradingDesk } from '../lib/trading/useTradingDesk';

const require = createRequire(import.meta.url);
const originalCssLoader = require.extensions['.css'];
require.extensions['.css'] = module => {
  module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
};
const { TradeTicket } = require('../components/desk/TradeTicket') as typeof import('../components/desk/TradeTicket');
if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
else delete require.extensions['.css'];

const now = 1788916260000;
const stock = DESK_INSTRUMENTS.find(item => item.symbol === 'GOOGLc')!;
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
const quote: QuoteEstimate = {
  id: 'ticket-review-test', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
  inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals, multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};
const reviewed = (): DeskState => ({ ...initialDesk(intent), stage: 'review', quote });
function render(state: DeskState, options: { time?: number; historyReady?: boolean; error?: string; records?: ReturnType<typeof useTradingDesk>['records']; viewedRecordId?: string | null; focusedRecordId?: string | null } = {}) {
  const clock = mock.method(Date, 'now', () => options.time ?? now);
  const noop = () => {};
  const desk: ReturnType<typeof useTradingDesk> = {
    state, historyReady: options.historyReady ?? true, error: options.error ?? null, storageError: null,
    records: options.records ?? [], watched: [], edit: noop, requestQuote: async () => {}, save: noop, cancel: noop,
    loadHistory: noop, removeRecord: noop, watch: noop, unwatch: noop,
    viewedRecordId: options.viewedRecordId ?? null, focusedRecordId: options.focusedRecordId ?? null,
    openRecord: noop, dismissRecord: noop,
    deskId: 'hetty', activeDesk: { id: 'hetty', name: 'Hetty', market: 'Base', approach: '', status: 'paper' },
    open: true, switchDesk: noop, foreground: foregroundDocument(state, options.viewedRecordId ?? null, options.records),
  };
  try { return renderToStaticMarkup(createElement(TradeTicket, { desk })); }
  finally { clock.mock.restore(); }
}
const visible = (html: string) => html
  .replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '')
  .replace(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/g, '');

describe('one working document at a time', () => {
  it('shows editable controls only in the draft', () => {
    const html = render(initialDesk(intent));
    assert.match(html, /data-ticket-view="draft"/);
    assert.match(html, /<form/);
    assert.match(html, /id="amount"/);
    assert.match(html, /Review estimate/);
    assert.doesNotMatch(html, /Record paper trade/);
  });
  it('replaces the draft with the quotation rather than appending it', () => {
    const html = render(reviewed());
    assert.match(html, /data-ticket-view="review"/);
    assert.match(html, /data-foreground="quotation"/);
    assert.doesNotMatch(html, /<form|<input|<select/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(html, /0\.02948502/);
    assert.match(html, /GOOGLc/);
    assert.match(visible(html), /Record paper trade/);
    assert.match(visible(html), /Edit instruction/);
    assert.match(visible(html), /No funds move/);
    assert.match(visible(html), /anyone using this browser profile/i);
  });
  it('keeps technical details behind one disclosure, not duplicated in the main slip', () => {
    const html = render(reviewed());
    assert.equal(html.match(/<dialog\b/g)?.length, 1);
    assert.doesNotMatch(visible(html), /corporate-action|Base block|Market session|Product dossier/);
    assert.match(html, /corporate-action/);
    assert.match(html, /No additional slippage, gas or Claflin charges/);
    assert.match(html, /permitted jurisdictions outside the US/);
    assert.match(html, new RegExp(stock.contractAddress, 'i'));
  });
  it('offers refresh instead of a recording action when the estimate expires', () => {
    const html = render(reviewed(), { time: quote.expiresAt });
    assert.match(visible(html), /Refresh estimate/);
    assert.doesNotMatch(visible(html), /Record paper trade/);
    assert.match(html, /expired/i);
  });
  it('disables recording and explains when storage is unavailable', () => {
    const html = render(reviewed(), { historyReady: false });
    assert.match(html, /<button[^>]*disabled=""[^>]*>Record paper trade/);
    assert.match(visible(html), /storage/i);
  });
  it('replaces cleared quotes with a waiting slip during an initial request or refresh', () => {
    for (const state of [initialDesk(intent), reviewed()]) {
      const pending = deskReducer(state, { type: 'request', requestId: 'next-quote' });
      const html = render(pending);
      assert.match(html, /data-ticket-view="pending"/);
      assert.doesNotMatch(html, /<form|<input|0\.02948502|Record paper trade/);
      assert.match(html, /Cancel instruction/);
      assert.match(html, /10/);
      assert.match(html, /GOOGLc/);
    }
  });
  it('restores the existing draft after edits, cancellation, or a failed refresh', () => {
    const states = [
      deskReducer(reviewed(), { type: 'edit', draft: intent }),
      deskReducer(reviewed(), { type: 'cancel' }),
      deskReducer(deskReducer(reviewed(), { type: 'request', requestId: 'refresh' }), { type: 'failed', requestId: 'refresh', message: 'Venue unavailable. Try again.' }),
    ];
    for (const state of states) {
      const html = render(state);
      assert.match(html, /data-ticket-view="draft"/);
      assert.match(html, /id="amount"[^>]*value="10"/);
      assert.doesNotMatch(html, /0\.02948502|Record paper trade/);
    }
    assert.match(render(states[2]), /Venue unavailable/);
  });
  it('shows a compact receipt without reopening the form or asking for approval again', () => {
    const saved = deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: now + 1 });
    const record = { version: 1 as const, id: quote.id, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1, quote };
    const html = render(saved, { records: [record], focusedRecordId: quote.id });
    assert.match(html, /data-ticket-view="receipt"/);
    assert.doesNotMatch(html, /<form|<input|Record paper trade|Refresh estimate/);
    assert.match(visible(html), /Filed to your paper ledger/);
    assert.match(visible(html), /This is not a fill, a submission, or a position/);
    assert.match(visible(html), /Start another instruction/);
    assert.doesNotMatch(visible(html), /This is the same entry as the ledger/);
    assert.doesNotMatch(visible(html), />New instruction</);
    assert.doesNotMatch(visible(html), /Simulated outcome saved on this browser/);
    assert.match(html, /0\.02948502/);
    assert.match(html, /Recorded/);
  });
  it('opens a filed record on the ticket without turning it into a new draft', () => {
    const record = { version: 1 as const, id: quote.id, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1, quote };
    const html = render(initialDesk({ instrumentId: '', side: 'buy', amount: '', unit: 'USDC' }), {
      records: [record], viewedRecordId: quote.id, focusedRecordId: quote.id,
    });
    assert.match(html, /data-ticket-view="receipt"/);
    assert.match(html, /data-foreground="archive"/);
    assert.match(visible(html), /Back to the ticket/);
    assert.doesNotMatch(visible(html), /Start another instruction/);
    assert.doesNotMatch(html, /<form|id="amount"/);
  });
  it('does not offer to record a hidden quotation while a filed record is on the ticket', () => {
    const filed = { ...quote, id: 'filed-nvda' };
    const record = { version: 1 as const, id: filed.id, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1, quote: filed };
    const html = render(reviewed(), { records: [record], viewedRecordId: filed.id, focusedRecordId: filed.id });
    assert.match(html, /data-foreground="archive"/);
    assert.doesNotMatch(visible(html), /Record paper trade/);
    assert.match(visible(html), /Back to your instruction/);
    assert.doesNotMatch(visible(html), /Start another instruction/);
  });
  it('shows an unavailable recovery when the opened record is gone', () => {
    const html = render(reviewed(), { records: [], viewedRecordId: 'deleted-elsewhere', focusedRecordId: 'deleted-elsewhere' });
    assert.match(html, /data-foreground="missing"/);
    assert.match(html, /data-ticket-view="missing"/);
    assert.match(visible(html), /That record is no longer here/);
    assert.match(visible(html), /no longer in this browser/);
    assert.match(visible(html), /Back to your instruction/);
    assert.doesNotMatch(visible(html), /Paper recorded/);
    assert.doesNotMatch(visible(html), /0\.02948502/);
    assert.doesNotMatch(visible(html), /Record paper trade/);
    assert.doesNotMatch(html, /data-acknowledged="true"/);
  });
  it('keeps sell inputs and outputs in their actual units', () => {
    const sell: TradeIntent = { ...intent, side: 'sell', unit: 'token', amount: '0.25' };
    const html = render({ ...reviewed(), draft: sell, quote: { ...quote, intent: sell, inputAmount: '0.25', inputSymbol: stock.symbol, outputAmount: '84.40', outputSymbol: 'USDC', shareEquivalent: '0.25' } });
    assert.match(html, /Sell/);
    assert.match(html, /0\.25/);
    assert.match(html, /84\.40/);
    assert.doesNotMatch(html, /0\.02948502/);
  });
});
