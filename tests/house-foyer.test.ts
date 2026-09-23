import './jsdom-setup';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { WorkingDesk } from '../components/desk/WorkingDesk';
import { offeringForInstrument } from '../lib/desk/offerings';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { resetContainer, getRootElement } from './jsdom-setup';

const originalFetch = globalThis.fetch;
const originalScrollTo = window.scrollTo;
const originalMatchMedia = window.matchMedia;
const originalSetItem = window.Storage.prototype.setItem;

function text(el: Element | null | undefined) {
  return el?.textContent ?? '';
}

function findButton(label: string) {
  return Array.from(getRootElement().querySelectorAll('button'))
    .find(button => button.textContent?.includes(label));
}

function click(el: Element, init: { metaKey?: boolean } = {}) {
  el.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
}

function renderFoyerInEnv(env: Record<string, string>) {
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/tests/');
    require.extensions['.css'] = (m) => { m.exports = new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : String(k) }); };
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const foyer = await import('./components/desk/HouseFoyer.tsx');
    const HouseFoyer = foyer.HouseFoyer ?? foyer.default?.HouseFoyer;
    process.stdout.write(renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} })));
  `;
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--eval', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

describe('house foyer', () => {
  let root: Root | null = null;
  let fetchCalls = 0;
  let micCalls = 0;
  let storageWrites = 0;
  let micDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    resetContainer();
    window.sessionStorage.clear();
    fetchCalls = 0;
    micCalls = 0;
    storageWrites = 0;
    (window as any).scrollTo = () => {};
    (globalThis as any).fetch = () => { fetchCalls += 1; throw new Error('unexpected fetch'); };
    micDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => { micCalls += 1; return Promise.reject(new Error('foyer must not use the mic')); } },
    });
    /* Count writes but keep them real — ring-on-arrival must leave a readable key. */
    mock.method(window.Storage.prototype, 'setItem', function (this: Storage, key: string, value: string) {
      storageWrites += 1;
      return originalSetItem.call(this, key, value);
    });
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    mock.restoreAll();
    (globalThis as any).fetch = originalFetch;
    (window as any).scrollTo = originalScrollTo;
    (window as any).matchMedia = originalMatchMedia;
    window.sessionStorage.clear();
    if (micDescriptor) Object.defineProperty(window.navigator, 'mediaDevices', micDescriptor);
    else delete (window.navigator as any).mediaDevices;
  });

  it('SSR paints the full foyer — market clock, the lines, the wire, the book', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /THE ONCHAIN BOOK NEVER CLOSES/, 'fallback kicker on first paint');
    assert.match(html, /The exchange closes\./);
    assert.match(html, /This book doesn’t\./);
    assert.match(html, /id="foyer-title"/);
    assert.match(html, /href="#house-offerings"/);
    assert.match(html, /Browse the house book/);
    assert.match(html, /Paper by default\. Only you can sign\./);
    assert.match(html, /Ring Hetty/);
    assert.match(html, /Ring Jesse/);
    assert.match(html, /The Witch of Wall Street/);
    assert.match(html, /The Boy Plunger/);
    assert.match(html, /LIVE REFERENCE MARKS/);
    assert.match(html, /id="house-offerings"/);
    assert.match(html, /Every verified offering\./);
    assert.match(html, /AAPLc/);
    assert.match(html, /AAPLx/);
    assert.match(html, /Coinbase Tokenized Stocks/);
    assert.match(html, /Backed xStocks/);
    assert.match(html, /href="\/\?desk=hetty&amp;offering=/);
    assert.match(html, /href="\/\?desk=jesse&amp;offering=/);
    assert.match(html, /Open Jesse’s desk/);
    assert.match(html, /id="house-method"/);
    assert.match(html, /How the line works\./);
    assert.match(html, /THE TAPE RUNS ALL NIGHT\. THE HOUSE KEEPS THE RECORD\./);
    assert.doesNotMatch(html, /ILLUSTRATIVE EXAMPLE/);
    assert.doesNotMatch(html, /0\.490 Apple units/);
    assert.doesNotMatch(html, /0\.245 Apple units/);
  });

  it('SSR of the real entry tree renders the foyer headline first paint', () => {
    const html = renderToStaticMarkup(createElement(WorkingDesk));
    assert.match(html, /id="foyer-title"/);
    assert.match(html, /The exchange closes\./);
    assert.match(html, /id="house-offerings"/);
    assert.doesNotMatch(html, /ILLUSTRATIVE EXAMPLE/);
    assert.doesNotMatch(html, /<canvas/, 'no canvas in the SSR first paint');
  });

  it('shows the paper-only signature line when live settle is off', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /File a paper record only when you choose\. No real funds move\./);
    assert.doesNotMatch(html, /live settlement|Live settle/);
  });

  it('filters the house book from the visitor instruction without choosing a chain first', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));

    const input = getRootElement().querySelector('.instructionSearch input') as HTMLInputElement | null;
    assert.ok(input, 'instruction input rendered');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input!, 'buy Apple for 100 USDC');
      input!.dispatchEvent(new (window as any).Event('input', { bubbles: true }));
    });

    const html = text(getRootElement());
    assert.match(html, /AAPL/);
    assert.match(html, /AAPLc/);
    assert.match(html, /AAPLx/);
    assert.match(html, /Backed xStocks/);
    assert.doesNotMatch(html, /TSLAx/);
  });

  it('Ring Hetty leaves a ring-on-arrival note and enters her desk', async () => {
    let entered: string | null = null;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: id => { entered = id; } })));

    const ringHetty = findButton('Ring Hetty');
    assert.ok(ringHetty, 'Hetty ring button rendered');
    await act(async () => click(ringHetty!));

    assert.equal(entered, 'hetty');
    const raw = window.sessionStorage.getItem('claflin:ring-on-arrival');
    assert.ok(raw, 'ring-on-arrival key written');
    const pending = JSON.parse(raw!) as { deskId?: string; at?: number };
    assert.equal(pending.deskId, 'hetty');
    assert.equal(typeof pending.at, 'number');
  });

  it('an offering link dispatches desk and offering once; meta-click is untouched', async () => {
    let entered: string | null = null;
    let selectedOffering: string | null = null;
    let enterCount = 0;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (id, offeringId) => { entered = id; selectedOffering = offeringId ?? null; enterCount += 1; },
    })));

    const offering = offeringForInstrument(SOLANA_INSTRUMENTS[0].id)!;
    const primary = Array.from(getRootElement().querySelectorAll('a'))
      .find(a => a.textContent?.includes('Open Jesse’s desk') && a.getAttribute('href')?.includes('offering='));
    assert.ok(primary, 'eligible offering desk link rendered');
    assert.equal(primary!.getAttribute('href'), `/?desk=jesse&offering=${encodeURIComponent(offering.offeringId)}`);

    await act(async () => click(primary!));
    assert.equal(entered, 'jesse');
    assert.equal(selectedOffering, offering.offeringId);
    assert.equal(enterCount, 1);

    const modified = new (window as any).MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    let prevented = false;
    const originalPrevent = modified.preventDefault.bind(modified);
    modified.preventDefault = () => { prevented = true; originalPrevent(); };
    await act(async () => { primary!.dispatchEvent(modified); });
    assert.equal(enterCount, 1, 'meta-click is not intercepted');
    assert.equal(prevented, false, 'meta-click keeps its default action');
  });

  it('a wire mark click fills the house-book instruction with the ticker', async () => {
    const apple = DESK_INSTRUMENTS.find(stock => stock.symbol === 'AAPLc')!;
    const marks = {
      asOf: Date.now(),
      marks: [{
        instrumentId: apple.id,
        symbol: apple.symbol,
        name: apple.name,
        reference: { status: 'observed', source: 'chainlink', priceUsdPerToken: '227.10', updatedAt: Date.now(), session: 'unknown', pauseStatus: 'unchecked' },
      }],
    };
    (globalThis as any).fetch = () => {
      fetchCalls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(marks),
      });
    };

    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const wireItem = findButton('AAPLc');
    assert.ok(wireItem, 'wire item rendered from real marks');
    await act(async () => click(wireItem!));

    const input = getRootElement().querySelector('.instructionSearch input') as HTMLInputElement;
    assert.equal(input.value, 'AAPL', 'wire click writes the underlying ticker');
    assert.match(text(getRootElement()), /AAPLc/);
    assert.match(text(getRootElement()), /AAPLx/);
    assert.doesNotMatch(text(getRootElement()), /TSLAx/);
  });

  it('carries Jesse’s Solana marks on the wire with the stock-reference gap, and gives his card a take', async () => {
    const apple = DESK_INSTRUMENTS.find(stock => stock.symbol === 'AAPLc')!;
    const xApple = SOLANA_INSTRUMENTS.find(stock => stock.symbol === 'AAPLx')!;
    const now = Date.now();
    const bodies: Record<string, unknown> = {
      '/api/desk/hetty/marks': { asOf: now, marks: [{ instrumentId: apple.id, symbol: apple.symbol, name: apple.name, reference: { status: 'observed', source: 'chainlink', priceUsdPerToken: '227.10', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' } }] },
      '/api/desk/jesse/marks': { asOf: now, marks: [{ instrumentId: xApple.id, symbol: xApple.symbol, name: xApple.name, reference: { status: 'observed', source: 'jupiter-price-v3', priceUsdPerToken: '227.41', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' }, stockReference: { priceUsd: '227.10', source: 'backed', differenceBps: '13.6' } }] },
    };
    (globalThis as any).fetch = (url: string) => {
      fetchCalls += 1;
      const body = bodies[String(url)];
      if (!body) return Promise.reject(new Error(`unexpected fetch ${url}`));
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });
    };

    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const solItem = Array.from(getRootElement().querySelectorAll('button'))
      .find(button => button.getAttribute('aria-label')?.startsWith('AAPLx'));
    assert.ok(solItem, 'Solana mark on the wire');
    assert.equal(solItem!.getAttribute('aria-label'), 'AAPLx $227.41 on Solana');
    assert.match(text(solItem), /SOL/);
    assert.match(text(solItem), /\+13\.6 bps/);
    const page = text(getRootElement());
    assert.match(page, /Jesse’s take/);
    assert.match(page, /AAPLx is printing 13\.6 bps over its stock reference on Solana/);
    assert.match(page, /Hetty’s take/);
  });

  it('keeps Jesse offerings out of the house book when Jesse is gated, even with the live flag on', () => {
    const html = renderFoyerInEnv({
      NEXT_PUBLIC_JESSE_PAPER_ENABLED: 'false',
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true',
    });
    assert.match(html, /href="\/\?desk=hetty&amp;offering=/);
    assert.match(html, /Open Hetty’s desk/);
    assert.doesNotMatch(html, /Open Jesse’s desk/);
    assert.doesNotMatch(html, /live settle|live settlement|Live settle/, 'a gated desk must not advertise live settlement');
  });

  it('advertises live settlement only where the selected desk supports it', () => {
    const html = renderFoyerInEnv({ NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true' });
    assert.match(html, /href="\/\?desk=jesse&amp;offering=/);
    assert.match(html, /live settle where the desk supports it/);
    assert.match(html, /live settle available/);
  });
});
