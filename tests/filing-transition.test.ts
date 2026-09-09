import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTradingDesk } from '../lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { resetContainer, getRootElement, setViewport } from './jsdom-setup';
import type { PaperRecord } from '../lib/trading/paper-records';

const require = createRequire(import.meta.url);
const { TradeTicket } = require('../components/desk/TradeTicket') as typeof import('../components/desk/TradeTicket');
const { PaperLedger } = require('../components/desk/PaperLedger') as typeof import('../components/desk/PaperLedger');
const styles = require('../components/desk/WorkingDesk.module.css') as Record<string, string>;

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

function makeQuote(intent: TradeIntent, now: number, id = 'filing-quote'): QuoteEstimate {
  return {
    id, kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
    chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
    instrumentAddress: stock.contractAddress, instrumentName: stock.name,
    inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
    inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals, multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
    reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' },
    blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
  };
}

function makeRecord(id: string, createdAt: number, quote: QuoteEstimate): PaperRecord {
  return { version: 1, mode: 'paper', deskId: 'hetty', id, createdAt, quote: { ...quote, id } };
}

function injectWorkingDeskCss() {
  const css = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

describe('mobile filing transition through actual buttons', () => {
  let root: Root | null = null;
  let desk: ReturnType<typeof useTradingDesk> | null = null;

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    desk = null;
    setViewport(375, 812);
    injectWorkingDeskCss();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  async function flush() {
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  function MobileHarness() {
    const d = useTradingDesk();
    desk = d;
    return createElement('main', {
      className: styles.grid,
      'data-foreground': d.foreground.kind,
      'data-ledger': d.records.length > 0 || d.storageError ? 'true' : 'false',
    },
      createElement('div', { className: styles.deskSurface, 'aria-hidden': 'true' }),
      createElement(TradeTicket, { desk: d }),
      createElement(PaperLedger, { desk: d }),
      createElement('aside', { className: styles.support, 'aria-label': 'support' }, 'support'),
    );
  }

  async function renderAndLoad() {
    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(MobileHarness)));
    await flush();
  }

  function getButton(text: RegExp) {
    const container = getRootElement();
    return Array.from(container.querySelectorAll('button')).find(b => text.test(b.textContent ?? ''));
  }

  it('files a paper record through the ticket buttons and places the compact ledger above the receipt on mobile', async () => {
    const now = Date.now();
    const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };

    (globalThis as any).fetch = async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/stocks/quote')) return Response.json(makeQuote(intent, now), { status: 200 });
      return new Response('not found', { status: 404 });
    };

    await renderAndLoad();
    const container = getRootElement();
    assert.equal(desk!.foreground.kind, 'draft');

    const radio = container.querySelector(`input[type="radio"][value="${stock.id}"]`) as HTMLInputElement | null;
    assert.ok(radio, 'instrument radio should exist');
    await act(async () => { radio!.click(); });
    await flush();

    const tenChip = getButton(/^\$10$/);
    assert.ok(tenChip, '$10 quick-amount chip should exist');
    await act(async () => { tenChip!.click(); });
    await flush();

    const review = getButton(/Review estimate/);
    assert.ok(review, 'Review estimate button should exist');
    await act(async () => { review!.click(); });
    await flush();
    assert.equal(desk!.state.stage, 'review', 'clicking Review estimate should reach review');

    const record = getButton(/Record paper trade/);
    assert.ok(record, 'Record paper trade button should exist');
    await act(async () => { record!.click(); });
    await flush();

    assert.equal(desk!.state.stage, 'saved', 'Record paper trade should file the record');
    assert.equal(desk!.records.length, 1, 'a record should be saved to local history');
    const ledger = container.querySelector('#paper-ledger');
    assert.ok(ledger, 'PaperLedger should appear after filing');
    assert.ok(ledger!.querySelector('[data-just-filed="true"]'), 'the just-filed line should be highlighted');
    assert.ok(container.textContent?.includes('Filed to your paper ledger'), 'receipt copy should be visible');

    // Mobile layout is driven by the wrapper's data attributes: receipt state plus a ledger.
    const main = container.querySelector('main') as HTMLElement | null;
    assert.equal(main?.getAttribute('data-foreground'), 'receipt', 'the grid should be in receipt foreground');
    assert.equal(main?.getAttribute('data-ledger'), 'true', 'the grid should know a ledger is present');
    assert.ok(container.querySelector('[data-ticket-view="receipt"]'), 'the receipt should be rendered');
    assert.ok(container.querySelector('#paper-ledger'), 'the compact ledger should be rendered alongside the receipt');
  });
});

describe('paper ledger edge cases', () => {
  let root: Root | null = null;

  beforeEach(() => { resetContainer(); });
  afterEach(async () => { if (root) { await act(async () => root!.unmount()); root = null; } });

  async function renderLedger(desk: Partial<ReturnType<typeof useTradingDesk>> & Pick<ReturnType<typeof useTradingDesk>, 'records' | 'focusedRecordId' | 'foreground'>) {
    root = createRoot(getRootElement());
    const noop = () => {};
    const fullDesk = {
      records: desk.records, historyReady: true, storageError: null, loadHistory: noop,
      focusedRecordId: desk.focusedRecordId ?? null, openRecord: noop,
      foreground: desk.foreground ?? { kind: 'draft', quoteId: null, recordId: null, instrumentId: null, actionable: true, readonly: false },
    } as any;
    await act(async () => root.render(createElement(PaperLedger, { desk: fullDesk })));
    await act(async () => {});
    await new Promise(r => setTimeout(r, 10));
  }

  it('returns nothing for an empty history', async () => {
    await renderLedger({
      records: [],
      focusedRecordId: null,
      foreground: { kind: 'draft', quoteId: null, recordId: null, instrumentId: null, actionable: true, readonly: false },
    });
    assert.equal(getRootElement().innerHTML, '', 'PaperLedger should render nothing when history is empty');
  });

  it('scrolls the focused older record into the compact preview', async () => {
    const now = Date.now();
    const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
    const quote = makeQuote(intent, now);
    const records: PaperRecord[] = [];
    for (let i = 0; i < 8; i++) {
      records.push(makeRecord(`day-${i}`, now - i * 86_400_000, quote));
    }
    await renderLedger({
      records,
      focusedRecordId: 'day-7',
      foreground: { kind: 'archive', quoteId: 'day-7', recordId: 'day-7', instrumentId: stock.id, actionable: false, readonly: true },
    });
    const container = getRootElement();
    const lines = container.querySelectorAll('li');
    assert.equal(lines.length, 5, 'compact preview should be limited to 5 entries');
    const last = lines[lines.length - 1];
    assert.equal(last.getAttribute('data-current'), 'true', 'the focused record should be the last visible line');
    assert.equal(last.getAttribute('data-just-filed'), 'false', 'an older focused record should not be marked just-filed');
    assert.ok(container.textContent?.includes('3 older in the archive'), 'older count should be surfaced');
  });
});
