import './jsdom-setup';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { WorkingDesk } from '../components/desk/WorkingDesk';
import { resetContainer, getRootElement } from './jsdom-setup';

const originalFetch = globalThis.fetch;
const originalScrollTo = window.scrollTo;
const originalMatchMedia = window.matchMedia;

type MediaControl = { setReduced(reduced: boolean): void };

function mockMatchMedia(reduced: boolean): MediaControl {
  const listeners = new Set<() => void>();
  (window as any).matchMedia = (query: string) => ({
    get matches() { return query.includes('prefers-reduced-motion') ? reduced : false; },
    media: query,
    onchange: null,
    addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  });
  return {
    setReduced(next: boolean) {
      reduced = next;
      listeners.forEach(cb => cb());
    },
  };
}

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
    fetchCalls = 0;
    micCalls = 0;
    storageWrites = 0;
    (window as any).scrollTo = () => {};
    (globalThis as any).fetch = () => { fetchCalls += 1; throw new Error('foyer demo must not fetch'); };
    micDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => { micCalls += 1; return Promise.reject(new Error('foyer demo must not use the mic')); } },
    });
    mock.method(window.Storage.prototype, 'setItem', () => { storageWrites += 1; });
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    mock.restoreAll();
    (globalThis as any).fetch = originalFetch;
    (window as any).scrollTo = originalScrollTo;
    (window as any).matchMedia = originalMatchMedia;
    if (micDescriptor) Object.defineProperty(window.navigator, 'mediaDevices', micDescriptor);
    else delete (window.navigator as any).mediaDevices;
  });

  it('SSR paints the full foyer with a real primary link and no slip numbers', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /A clearer view\./);
    assert.match(html, /Before you trade\./);
    assert.match(html, /id="foyer-title"/);
    assert.match(html, /href="\/\?desk=jesse"/);
    assert.match(html, /Open Jesse’s desk/);
    assert.match(html, /ILLUSTRATIVE EXAMPLE · NOT A LIVE QUOTE/);
    assert.match(html, /Try an instruction\. Watch the desk write it down\./);
    assert.match(html, /Quote 100 USDC of AAPLx/);
    assert.match(html, /id="house-method"/);
    assert.match(html, /Your instruction\. Your decision\./);
    assert.match(html, /Nothing moves without your approval/);
    assert.doesNotMatch(html, /0\.490 AAPLx/);
    assert.doesNotMatch(html, /0\.245 AAPLx/);
    assert.match(html, /THE PIT IS DOWNSTAIRS/);
  });

  it('SSR of the real entry tree renders the foyer headline first paint', () => {
    const html = renderToStaticMarkup(createElement(WorkingDesk));
    assert.match(html, /id="foyer-title"/);
    assert.match(html, /A clearer view\./);
    assert.match(html, /ILLUSTRATIVE EXAMPLE · NOT A LIVE QUOTE/);
    assert.doesNotMatch(html, /<canvas/, 'no canvas in the SSR first paint');
  });

  it('shows the paper-only decision line when live settle is off', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /File a paper record only when you choose\. No real funds move\./);
    assert.doesNotMatch(html, /live settlement|Live settle/);
  });

  it('runs the example through writing to ready, then revises with a superseded slip', async () => {
    mockMatchMedia(false);
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));

    const action = findButton('Quote 100 USDC of AAPLx');
    assert.ok(action, 'idle example action exists');
    await act(async () => click(action!));

    assert.match(text(getRootElement()), /Writing the estimate…/);
    assert.ok(findButton('Try an example')?.hasAttribute('disabled'), 'demo buttons disabled while writing');

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 520)); });

    const html = text(getRootElement());
    assert.match(html, /100 USDC/);
    assert.match(html, /0\.490 AAPLx/);
    assert.match(html, /STUDY-001/);
    assert.match(html, /NOT A LIVE QUOTE/);
    assert.match(html, /not calculated from the reference prices/);

    const revise = findButton('Make that 50 USDC');
    assert.ok(revise, 'revision action offered on the 100 slip');
    await act(async () => click(revise!));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 520)); });

    const revised = text(getRootElement());
    assert.match(revised, /50 USDC/);
    assert.match(revised, /0\.245 AAPLx/);
    assert.match(revised, /STUDY-002/);
    assert.match(revised, /SUPERSEDED EXAMPLE/);
    const prior = getRootElement().querySelector('.slipPrior s');
    assert.ok(prior, 'superseded line is struck through');
    assert.match(text(prior), /100 USDC → 0\.490 AAPLx/);
  });

  it('demo makes no external calls; primary dispatches entry once and modifiers pass through', async () => {
    let entered: string | null = null;
    let enterCount = 0;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (id) => { entered = id; enterCount += 1; },
    })));

    await act(async () => click(findButton('Quote 100 USDC of AAPLx')!));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 520)); });
    await act(async () => click(findButton('Make that 50 USDC')!));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 520)); });
    await act(async () => click(findButton('Clear example')!));

    assert.equal(fetchCalls, 0, 'demo never fetches');
    assert.equal(micCalls, 0, 'demo never touches the microphone');
    assert.equal(storageWrites, 0, 'demo writes no storage');

    const primary = Array.from(getRootElement().querySelectorAll('a'))
      .find(a => a.textContent?.includes('Open Jesse’s desk'));
    assert.ok(primary, 'primary desk link rendered');
    assert.equal(primary!.getAttribute('href'), '/?desk=jesse');

    await act(async () => click(primary!));
    assert.equal(entered, 'jesse');
    assert.equal(enterCount, 1);
    assert.equal(storageWrites, 0, 'entry dispatch itself writes nothing from the foyer');

    const modified = new (window as any).MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    let prevented = false;
    const originalPrevent = modified.preventDefault.bind(modified);
    modified.preventDefault = () => { prevented = true; originalPrevent(); };
    await act(async () => { primary!.dispatchEvent(modified); });
    assert.equal(enterCount, 1, 'meta-click is not intercepted');
    assert.equal(prevented, false, 'meta-click keeps its default action');
  });

  it('reduced motion lands ready immediately and a mid-write preference flip finishes the slip', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));

    await act(async () => click(findButton('Quote 100 USDC of AAPLx')!));
    assert.match(text(getRootElement()), /0\.490 AAPLx/, 'reduced motion skips the writing delay');

    const control = mockMatchMedia(false);
    await act(async () => click(findButton('Make that 50 USDC')!));
    assert.match(text(getRootElement()), /Writing the estimate…/);
    await act(async () => control.setReduced(true));
    assert.match(text(getRootElement()), /0\.245 AAPLx/, 'preference flip resolves the pending write');
  });

  it('clear example removes the slip and resets state', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => click(findButton('Quote 100 USDC of AAPLx')!));
    assert.match(text(getRootElement()), /0\.490 AAPLx/);

    await act(async () => click(findButton('Clear example')!));
    const html = text(getRootElement());
    assert.doesNotMatch(html, /0\.490 AAPLx/);
    assert.doesNotMatch(html, /SUPERSEDED EXAMPLE/);
    assert.match(html, /Try an instruction\. Watch the desk write it down\./);
  });

  it('unmounting mid-write clears the pending timer', async () => {
    let cleared = 0;
    const realClear = globalThis.clearTimeout;
    mock.method(globalThis, 'clearTimeout', (id: Parameters<typeof clearTimeout>[0]) => {
      cleared += 1;
      return realClear(id);
    });
    mockMatchMedia(false);
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => click(findButton('Quote 100 USDC of AAPLx')!));
    await act(async () => root!.unmount());
    root = null;
    assert.ok(cleared >= 1, 'pending demo timer was cleared on unmount');
  });

  it('entry clears a pending demo timer before dispatching', async () => {
    let cleared = 0;
    const realClear = globalThis.clearTimeout;
    mock.method(globalThis, 'clearTimeout', (id: Parameters<typeof clearTimeout>[0]) => {
      cleared += 1;
      return realClear(id);
    });
    mockMatchMedia(false);
    let enterCount = 0;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => { enterCount += 1; } })));
    await act(async () => click(findButton('Quote 100 USDC of AAPLx')!));

    const primary = Array.from(getRootElement().querySelectorAll('a'))
      .find(a => a.textContent?.includes('Open Jesse’s desk'));
    await act(async () => click(primary!));
    assert.equal(enterCount, 1);
    assert.ok(cleared >= 1, 'pending demo timer was cleared on entry');
    await new Promise(resolve => setTimeout(resolve, 520));
  });

  it('falls back to Hetty as the primary desk when Jesse is gated, even with the live flag on', () => {
    const html = renderFoyerInEnv({
      NEXT_PUBLIC_JESSE_PAPER_ENABLED: 'false',
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true',
    });
    assert.match(html, /href="\/\?desk=hetty"/);
    assert.match(html, /Open Hetty’s desk/);
    assert.doesNotMatch(html, /Open Jesse’s desk/);
    assert.doesNotMatch(html, /live settlement|Live settle/, 'a gated desk must not advertise live settlement');
  });

  it('advertises live settlement only when Jesse is open and the flag is on', () => {
    const html = renderFoyerInEnv({ NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true' });
    assert.match(html, /href="\/\?desk=jesse"/);
    assert.match(html, /choose live settlement on Solana/);
    assert.match(html, /Live settle is available on Jesse’s desk/);
  });
});
