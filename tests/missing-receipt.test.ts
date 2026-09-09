import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTradingDesk } from '../lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { resetContainer, getRootElement } from './jsdom-setup';

const require = createRequire(import.meta.url);
const { TradeTicket } = require('../components/desk/TradeTicket') as typeof import('../components/desk/TradeTicket');

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

function makeQuote(intent: TradeIntent, now: number): QuoteEstimate {
  return {
    id: 'missing-recovery-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
    chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
    instrumentAddress: stock.contractAddress, instrumentName: stock.name,
    inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
    inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals, multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
    reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' },
    blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
  };
}

describe('deleted/missing receipt recovery', () => {
  let root: Root | null = null;
  let desk: ReturnType<typeof useTradingDesk> | null = null;

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    desk = null;
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  async function flush() {
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  function Harness() {
    const d = useTradingDesk();
    desk = d;
    return createElement(TradeTicket, { desk: d });
  }

  async function renderAndLoad() {
    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();
  }

  it('returns to a clean draft after the current receipt is deleted and the user goes back', async () => {
    const now = Date.now();
    const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
    const quote = makeQuote(intent, now);

    (globalThis as any).fetch = async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/desk/') && url.includes('/quote')) return Response.json(quote, { status: 200 });
      return new Response('not found', { status: 404 });
    };

    await renderAndLoad();
    assert.equal(desk!.foreground.kind, 'draft');

    await act(async () => { desk!.edit(intent); });
    await flush();

    await act(async () => { await desk!.requestQuote(); });
    await flush();
    assert.equal(desk!.state.stage, 'review', 'quote should move to review');

    await act(async () => { desk!.save(); });
    await flush();
    assert.equal(desk!.state.stage, 'saved', 'save should file the record');
    assert.equal(desk!.records.length, 1, 'record should be in local history');
    const savedId = desk!.records[0]!.id;
    assert.equal(desk!.viewedRecordId, savedId);

    // Simulate the record being deleted in another tab.
    await act(async () => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith('claflin.paper.v1.')) window.localStorage.removeItem(key);
      }
      window.dispatchEvent(new (window as any).Event('storage'));
    });
    await flush();

    assert.equal(desk!.records.length, 0, 'history should be empty after external deletion');
    assert.equal(desk!.foreground.kind, 'missing', 'ticket should show missing-record recovery');
    const container = getRootElement();
    assert.ok(container.textContent?.includes('no longer here'), 'missing heading should be visible');
    assert.ok(container.textContent?.includes('no longer in this browser'), 'recovery copy should be visible');

    const back = Array.from(container.querySelectorAll('button')).find(b => /Back/i.test(b.textContent ?? ''));
    assert.ok(back, 'there should be a Back action for the missing record');
    await act(async () => { back!.click(); });
    await flush();

    assert.equal(desk!.state.stage, 'draft', 'Back should return to a clean draft');
    assert.equal(desk!.viewedRecordId, null, 'the missing record id must be dropped');
    assert.equal(desk!.foreground.kind, 'draft', 'foreground should be a draft after recovery');
    assert.ok(!container.textContent?.includes('Filed to your paper ledger'), 'stale receipt success must not reappear');
    assert.ok(container.querySelector('form'), 'draft controls should be visible');
    assert.ok(Array.from(container.querySelectorAll('button')).some(b => /Review estimate/i.test(b.textContent ?? '')), 'draft should offer a new quote');
  });
});
