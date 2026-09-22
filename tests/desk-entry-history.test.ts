import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTradingDesk } from '../lib/trading/useTradingDesk';
import { useRecordUrl } from '../lib/desk/use-record-url';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { resetContainer, getRootElement } from './jsdom-setup';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

function makeQuote(intent: TradeIntent, now: number, id: string): QuoteEstimate {
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

function seedRecord(id: string, deskId: string, now = Date.now()) {
  const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
  window.localStorage.setItem(`claflin.paper.v1.${id}`, JSON.stringify({
    version: 1, mode: 'paper', deskId, owner: 'anonymous', id, createdAt: now,
    quote: makeQuote(intent, now, id),
  }));
}

describe('desk entry and history behavior', () => {
  let root: Root | null = null;
  let desk: ReturnType<typeof useTradingDesk> | null = null;
  let pushes = 0;
  let replaces = 0;
  const realPush = window.history.pushState;
  const realReplace = window.history.replaceState;

  function Harness() {
    const d = useTradingDesk();
    desk = d;
    useRecordUrl(d.viewedRecordId);
    return null;
  }

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    desk = null;
    pushes = 0;
    replaces = 0;
    window.history.pushState = function (...args: Parameters<typeof realPush>) { pushes += 1; return realPush.apply(this, args); };
    window.history.replaceState = function (...args: Parameters<typeof realReplace>) { replaces += 1; return realReplace.apply(this, args); };
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    window.history.pushState = realPush;
    window.history.replaceState = realReplace;
    window.history.replaceState({}, '', '/');
  });

  async function render() {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Harness)));
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  async function popTo(url: string) {
    await act(async () => {
      realPush.call(window.history, {}, '', url);
      window.dispatchEvent(new (window as any).Event('popstate'));
    });
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  it('enters a desk with a pushed history entry and leaves with all desk params stripped', async () => {
    await render();
    assert.equal(desk!.entryPhase, 'foyer');
    const before = pushes;

    await act(async () => desk!.enterDesk('hetty', null, { side: 'buy', amount: '25' }));
    assert.equal(pushes, before + 1, 'entering a desk should push a history entry');
    assert.match(window.location.search, /desk=hetty/);
    assert.match(window.location.search, /side=buy/);
    assert.match(window.location.search, /amount=25/);

    await act(async () => desk!.leaveDesk());
    assert.equal(desk!.entryPhase, 'foyer');
    for (const key of ['desk', 'offering', 'view', 'side', 'amount', 'record']) {
      assert.equal(new URLSearchParams(window.location.search).get(key), null, `${key} should be stripped`);
    }
  });

  it('hydrates a record deep link into the archive foreground', async () => {
    seedRecord('deep-1', 'hetty');
    window.history.replaceState({}, '', '/?desk=hetty&record=deep-1');
    await render();

    assert.equal(desk!.entryPhase, 'desk');
    assert.equal(desk!.deskId, 'hetty');
    assert.equal(desk!.viewedRecordId, 'deep-1');
    assert.equal(desk!.foreground.kind, 'archive');
    assert.equal(desk!.foreground.recordId, 'deep-1');
    assert.equal(desk!.entryRecordId, 'deep-1');
    assert.ok(desk!.entryGen >= 1, 'the entry generation should mark a URL-provided record');
    /* The link stays in the bar — it names what is on screen. */
    assert.match(window.location.search, /record=deep-1/);
  });

  it('shows the missing-record recovery when the deep link names nothing on file', async () => {
    window.history.replaceState({}, '', '/?desk=hetty&record=ghost-9');
    await render();

    assert.equal(desk!.viewedRecordId, 'ghost-9');
    assert.equal(desk!.foreground.kind, 'missing');
    assert.equal(desk!.foreground.readonly, true);
  });

  it('opens a record into the URL, then Back dismisses it through popstate', async () => {
    seedRecord('deep-2', 'hetty');
    window.history.replaceState({}, '', '/?desk=hetty');
    await render();
    const genOnEntry = desk!.entryGen;

    await act(async () => desk!.openRecord('deep-2'));
    await act(async () => {});
    assert.equal(desk!.viewedRecordId, 'deep-2');
    assert.equal(desk!.foreground.kind, 'archive');
    assert.match(window.location.search, /record=deep-2/, 'opening a record should write ?record=');
    assert.match(window.location.search, /desk=hetty/, 'desk context should be preserved');

    await popTo('/?desk=hetty');
    assert.equal(desk!.viewedRecordId, null, 'Back past the open should dismiss the record');
    assert.equal(desk!.foreground.kind, 'draft');
    assert.ok(desk!.entryGen > genOnEntry, 'each URL entry bumps the generation once');
  });

  it('lands on the foyer when Back reaches a URL without ?desk= — no preference restore', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty'));
    assert.equal(window.localStorage.getItem('claflin.desk.v1.last'), 'hetty');

    await popTo('/');
    assert.equal(desk!.entryPhase, 'foyer', 'popstate must not restore the remembered desk');
    assert.equal(desk!.entryRecordId, null);
  });

  it('re-hydrates the record when Forward returns to the deep link', async () => {
    seedRecord('deep-3', 'hetty');
    window.history.replaceState({}, '', '/?desk=hetty');
    await render();

    await popTo('/?desk=hetty&record=deep-3');
    assert.equal(desk!.viewedRecordId, 'deep-3');
    assert.equal(desk!.foreground.kind, 'archive');

    await popTo('/?desk=hetty');
    assert.equal(desk!.viewedRecordId, null);

    await popTo('/?desk=hetty&record=deep-3');
    assert.equal(desk!.viewedRecordId, 'deep-3', 'the deep link should hydrate every time it is navigated to');
  });

  it('dismissRecord strips only ?record= and leaves desk context alone', async () => {
    seedRecord('deep-4', 'hetty');
    window.history.replaceState({}, '', '/?desk=hetty&record=deep-4&side=buy&amount=50');
    await render();
    assert.equal(desk!.viewedRecordId, 'deep-4');

    await act(async () => desk!.dismissRecord());
    await act(async () => {});
    const params = new URLSearchParams(window.location.search);
    assert.equal(params.get('record'), null);
    assert.equal(params.get('desk'), 'hetty');
    assert.equal(params.get('side'), 'buy', 'unrelated params must survive a record dismissal');
    assert.equal(params.get('amount'), '50');
  });

  it('switchDesk replaces rather than pushes and clears the record context', async () => {
    seedRecord('deep-5', 'hetty');
    window.history.replaceState({}, '', '/?desk=hetty');
    await render();
    await act(async () => desk!.openRecord('deep-5'));
    await act(async () => {});
    assert.match(window.location.search, /record=deep-5/);

    const pushesBeforeSwitch = pushes;
    await act(async () => desk!.switchDesk('jesse'));
    await act(async () => {});

    assert.equal(desk!.deskId, 'jesse');
    assert.equal(pushes, pushesBeforeSwitch, 'a desk switch is a replacement, not a new entry');
    assert.equal(desk!.entryRecordId, null, 'stale record context must not follow the switch');
    assert.equal(desk!.viewedRecordId, null);
    const params = new URLSearchParams(window.location.search);
    assert.equal(params.get('desk'), 'jesse');
    assert.equal(params.get('record'), null, '?record= must not leak onto another desk');
  });
});
