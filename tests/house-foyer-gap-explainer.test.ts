import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { resetContainer, getRootElement } from './jsdom-setup';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';

const apple = DESK_INSTRUMENTS.find(stock => stock.symbol === 'AAPLc')!;
const xApple = SOLANA_INSTRUMENTS.find(stock => stock.symbol === 'AAPLx')!;
const now = Date.now();

function hettyMarks() {
  return {
    asOf: now,
    marks: [{
      instrumentId: apple.id,
      symbol: 'AAPLc',
      name: 'Apple',
      reference: { status: 'observed', source: 'chainlink', priceUsdPerToken: '227.10', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' },
      stockReference: { priceUsd: '225.00', source: 'backed', differenceBps: '93.3' },
    }],
  };
}

function jesseMarks() {
  return {
    asOf: now,
    marks: [{
      instrumentId: xApple.id,
      symbol: 'AAPLx',
      name: 'Apple',
      reference: { status: 'observed', source: 'jupiter-price-v3', priceUsdPerToken: '227.41', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' },
      stockReference: { priceUsd: '227.10', source: 'backed', differenceBps: '13.6' },
    }],
  };
}

const originalFetch = globalThis.fetch;
const originalSendBeacon = (globalThis.navigator as any).sendBeacon;
const sentFunnels: unknown[] = [];

function installFetch() {
  (globalThis as any).fetch = (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('/api/desk/hetty/marks')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(hettyMarks()) });
    }
    if (u.includes('/api/desk/jesse/marks')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(jesseMarks()) });
    }
    if (u.includes('/api/desk/tennie/marks')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ asOf: now, marks: [] }) });
    }
    if (u === '/api/funnel') {
      sentFunnels.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }));
  };
  /* jsdom may not implement sendBeacon; force the fetch path so the beacon is capturable. */
  (globalThis.navigator as any).sendBeacon = () => false;
}

function uninstallFetch() {
  (globalThis as any).fetch = originalFetch;
  (globalThis.navigator as any).sendBeacon = originalSendBeacon;
}

/* Flush the funnel client's queue the same way a page hide does. */
function forceFlush() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
  document.dispatchEvent(new (window as any).Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
}

function gapTriggers() {
  return Array.from(getRootElement().querySelectorAll('[data-gap-trigger]'));
}

function click(el: Element) {
  el.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

describe('house foyer — gap explainer', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
    window.sessionStorage.clear();
    sentFunnels.length = 0;
    installFetch();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    /* Drain the funnel client's singleton queue so a test that opens the
       explainer never bleeds its queued event into the next test's beacon. */
    forceFlush();
    uninstallFetch();
  });

  it('renders a wire gap as an accessible trigger that opens the explainer dialog', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const triggers = gapTriggers();
    assert.ok(triggers.length > 0, 'a wire gap trigger renders');
    const hetty = triggers.find(t => t.textContent?.includes('+93.3'));
    assert.ok(hetty, 'the Hetty gap trigger renders');
    assert.equal(hetty!.tagName, 'BUTTON', 'the gap trigger is a real button, not nested markup');
    assert.match(hetty!.getAttribute('aria-label')!, /gap/);
    /* The trigger must not live inside the mark's own button. */
    assert.equal(hetty!.closest('button.wireItem'), null, 'the gap trigger is not nested in the mark button');

    await act(async () => click(hetty!));
    assert.ok(getRootElement().querySelector('dialog'), 'the gap explainer dialog opens');
    assert.match(getRootElement().textContent!, /What the gap on the wire means/);
  });

  it('emits gap_explainer_opened for the mark\u2019s desk exactly once per visit', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const triggers = gapTriggers();
    const jesse = triggers.find(t => t.textContent?.includes('+13.6'));
    assert.ok(jesse, 'the Jesse gap trigger renders');

    await act(async () => click(jesse!));
    forceFlush();

    assert.equal(sentFunnels.length, 1, 'one beacon flushed');
    const batch = sentFunnels[0] as { events: unknown[] };
    const gapEvents = (batch.events as { event: string; desk: string }[]).filter(e => e.event === 'gap_explainer_opened');
    assert.equal(gapEvents.length, 1, 'one gap_explainer_opened');
    assert.equal(gapEvents[0]!.desk, 'jesse', 'attributed to Jesse\u2019s desk');

    // Closing the explainer and opening another desk's gap must not
    // re-emit — but the dialog itself reopens: only the event is once
    // per visit, not the reading.
    const close = getRootElement().querySelector('.gapClose') as HTMLElement | null;
    assert.ok(close, 'a close button renders');
    await act(async () => click(close!));
    assert.equal(getRootElement().querySelectorAll('dialog').length, 0, 'the dialog closes');

    const hetty2 = triggers.find(t => t.textContent?.includes('+93.3'));
    assert.ok(hetty2, 'the Hetty gap trigger renders');
    await act(async () => click(hetty2!));
    assert.ok(getRootElement().querySelector('dialog'), 'the explainer reopens for a second gap');
    forceFlush();
    assert.equal(sentFunnels.length, 1, 'no second beacon on a second gap open');
    const allGapEvents = (sentFunnels[0] as { events: unknown[] }).events as { event: string; desk: string }[];
    assert.equal(allGapEvents.filter(e => e.event === 'gap_explainer_opened').length, 1, 'still exactly one gap_explainer_opened');
  });

  it('opens the explainer from the keyboard (Enter)', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const hetty = gapTriggers().find(t => t.textContent?.includes('+93.3'));
    assert.ok(hetty, 'the Hetty gap trigger renders');
    /* A native button is keyboard-operable by the browser itself: Enter and
       Space activate it, and it is in the tab order. */
    assert.equal(hetty!.tagName, 'BUTTON', 'the trigger is a native button, so Enter activates it');
    assert.equal(hetty!.getAttribute('tabindex'), null, 'the native button keeps its own focus order');

    await act(async () => click(hetty!));
    assert.ok(getRootElement().querySelector('dialog'), 'the dialog opens on activation');
  });

  it('closes the explainer dialog via its close button', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const hetty = gapTriggers().find(t => t.textContent?.includes('+93.3'));
    assert.ok(hetty, 'the Hetty gap trigger renders');
    await act(async () => click(hetty!));
    assert.ok(getRootElement().querySelector('dialog'), 'the dialog opens');

    const close = getRootElement().querySelector('.gapClose') as HTMLElement | null;
    assert.ok(close, 'a close button renders');
    await act(async () => click(close!));
    assert.equal(getRootElement().querySelectorAll('dialog').length, 0, 'the dialog closes');
  });
});
