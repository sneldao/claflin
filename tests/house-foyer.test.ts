import './jsdom-setup';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { HouseAnswers } from '../components/desk/HouseAnswers';
import { QuoteColumn, type WireMark } from '../components/foyer/QuoteColumn';
import { HouseSheet } from '../components/foyer/HouseSheet';
import { deskNoteOfTheDay, houseSheetDesk } from '../lib/desk-notes';
import type { HouseDeskId } from '../lib/house';
import { WorkingDesk } from '../components/desk/WorkingDesk';
import { offeringForInstrument } from '../lib/desk/offerings';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { resetContainer, getRootElement } from './jsdom-setup';

const originalFetch = globalThis.fetch;
const originalScrollTo = window.scrollTo;
const originalMatchMedia = window.matchMedia;
const originalSetItem = window.Storage.prototype.setItem;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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

/** The unfolded board under a given env — the table only paints under an instruction. */
function renderOfferingsInEnv(env: Record<string, string>, instruction: string) {
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/tests/');
    require.extensions['.css'] = (m) => { m.exports = new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : String(k) }); };
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const mod = await import('./components/desk/HouseOfferings.tsx');
    const HouseOfferings = mod.HouseOfferings;
    process.stdout.write(renderToStaticMarkup(createElement(HouseOfferings, { onEnter: () => {}, instruction: ${JSON.stringify(instruction)} })));
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
    assert.doesNotMatch(html, /Browse the house book/);
    assert.match(html, /Paper by default\. Only you can sign\./);
    assert.match(html, /Talk with Hetty/);
    assert.match(html, /Talk with Jesse/);
    /* Character comes after comprehension (docs/FOYER_LINE.md §4.7): the
       first screen carries no epithet or quote; "Meet the brokers" below may. */
    const hero = html.slice(html.indexOf('aria-labelledby="foyer-title"'), html.indexOf('id="house-offerings"'));
    assert.ok(hero.length > 0, 'hero section found');
    assert.doesNotMatch(hero, /The Witch of Wall Street/);
    assert.doesNotMatch(hero, /The Boy Plunger/);
    assert.doesNotMatch(hero, /I buy when things are low/);
    assert.doesNotMatch(hero, /There is only one side to the stock market/);
    assert.ok(html.indexOf('id="house-desks"') > html.indexOf('id="house-offerings"'), 'the desks come after the board');
    assert.match(html, /LIVE REFERENCE MARKS/);
    assert.match(html, /id="house-offerings"/);
    assert.match(html, /Every verified offering\./);
    /* The book stays folded on first paint — the family index is the landing,
       not forty rows of marks. */
    assert.doesNotMatch(html, /AAPLc/, 'no token rows before the visitor asks');
    assert.doesNotMatch(html, /AAPLx/);
    assert.match(html, /Coinbase Tokenized Stocks/);
    assert.match(html, /Backed xStocks/);
    assert.match(html, /Robinhood Stock Tokens/);
    assert.match(html, /Name a company or ticker/);
    assert.match(html, /id="house-method"/);
    assert.match(html, /How the line works\./);
    assert.match(html, /THE TAPE RUNS ALL NIGHT\. EVERY SLIP ON THE RECORD\./);
    assert.doesNotMatch(html, /THE HOUSE KEEPS THE RECORD/);
    assert.match(html, /Trade tokenized US stocks by voice — any hour\./, 'plain lede under the headline');
    assert.match(html, /Base · AI broker/);
    assert.match(html, /Solana · AI broker/);
    /* Tennie is LINE 3 — a voice line like the others: lamp, ring, and a
       typed fallback. */
    assert.match(html, /LINE 3/);
    assert.match(html, /Robinhood Chain · AI broker/);
    assert.doesNotMatch(html, /Robinhood Chain · AI broker · typed only/);
    assert.match(html, /Talk with Tennie/);
    assert.match(html, /Type instead/);
    /* …and a card in "Meet the brokers" below. */
    assert.match(html, /AI broker · Stock Tokens · Robinhood Chain/);
    assert.match(html, /Visit Tennie’s desk/);
    assert.match(html, /Three tapes — issuer, chain, venue — read side by side, never blended\./);
    assert.match(html, /“The Lady Broker”/);
    assert.match(html, /A live estimate when you ask\./);
    assert.doesNotMatch(html, /A real price when you ask/);
    assert.match(html, /Not yet seated — /);
    assert.doesNotMatch(html, /Later — /);
    assert.doesNotMatch(html, /ILLUSTRATIVE EXAMPLE/);
    assert.doesNotMatch(html, /0\.490 Apple units/);
    assert.doesNotMatch(html, /0\.245 Apple units/);
    /* The brass register — one anchored stop per room, in document order. */
    assert.match(html, /aria-label="The rooms"/);
    assert.match(html, /id="the-line"/);
    assert.match(html, /id="the-tape"/);
    for (const stop of ['the-line', 'the-tape', 'house-offerings', 'house-method', 'house-desks', 'house-answers']) {
      assert.match(html, new RegExp(`href="#${stop}"`), `register stop for ${stop}`);
    }
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

  it('hangs the house furniture: posted rules, the clerk’s stamp, a colophon', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    /* the posted notice restates real boundaries in plain type */
    assert.match(html, /aria-label="Posted house rules"/);
    assert.match(html, /Only you can sign\./);
    assert.match(html, /Voice never moves funds\./);
    /* the empty call page wears the clerk's stamp — decorative duplicate */
    assert.match(html, /Awaiting the wire/);
    /* the house sheet hangs in the example room's field — masthead only on
       first paint (the date fills in client-side, never fabricated) */
    assert.match(html, /The House Sheet/);
    /* the quotation column stays empty until real marks land — SSR carries none */
    assert.doesNotMatch(html, /Reference marks/);
    /* the colophon closes the page; planned desks are not yet seated */
    assert.match(html, /SET IN FRAUNCES/);
    assert.match(html, /Not yet seated —/);
    assert.doesNotMatch(html, /Coming soon/);
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

    const ringHetty = findButton('Talk with Hetty');
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

    /* The book unfolds once the visitor names something. */
    const input = getRootElement().querySelector('.instructionSearch input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'buy Apple');
      input.dispatchEvent(new (window as any).Event('input', { bubbles: true }));
    });

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

  it('the brass register marks the first room on arrival', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const rail = getRootElement().querySelector('nav[aria-label="The rooms"]');
    assert.ok(rail, 'the register renders');
    const stops = rail!.querySelectorAll('a');
    const sections = getRootElement().querySelectorAll('#main-content > section');
    assert.equal(stops.length, 7, 'one stop per room');
    assert.equal(sections.length, stops.length, 'the register and direct sections stay aligned');
    assert.deepEqual(
      [...stops].map(stop => stop.getAttribute('href')),
      [...sections].map(section => `#${section.id}`),
    );
    assert.equal(getRootElement().querySelectorAll('#house-example').length, 1);
    assert.equal(stops[0].getAttribute('aria-current'), 'true', 'the line is current on arrival');
    assert.equal(stops[1].getAttribute('aria-current'), null, 'no second current stop');
  });

  it('carries Jesse’s Solana marks on the wire with the stock-reference gap', async () => {
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
    /* The gap sits beside the mark as its own control, not inside it. */
    const gap = solItem!.closest('.wireCell')?.querySelector('.wireGap');
    assert.match(text(gap!), /\+13\.6 bps vs stock/, 'the gap names what it is measured against');
    const page = text(getRootElement());
    assert.doesNotMatch(page, /Jesse’s take/);
    assert.doesNotMatch(page, /Hetty’s take/);
  });

  it('keeps Jesse offerings out of the house book when Jesse is gated, even with the live flag on', () => {
    const html = renderFoyerInEnv({
      NEXT_PUBLIC_JESSE_PAPER_ENABLED: 'false',
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true',
    });
    /* A gated desk leaves the book entirely — no family row, no desk link. */
    assert.match(html, /Coinbase Tokenized Stocks/);
    assert.doesNotMatch(html, /Backed xStocks/);
    assert.doesNotMatch(html, /desk=jesse/);
    assert.doesNotMatch(html, /Open Jesse’s desk/);
    assert.doesNotMatch(html, /live settle available/, 'a gated desk must not advertise live settlement');
  });

  it('advertises live settlement only where the selected desk supports it', () => {
    const html = renderOfferingsInEnv({ NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true' }, 'Apple');
    assert.match(html, /href="\/\?desk=jesse&amp;offering=/);
    assert.match(html, /live settle available/);
  });

  it('paints the launch plate apart — ink, not a fifth card — with the explainer folded', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /THE LAUNCH DESK/);
    assert.match(html, /Bring Halley a launch/);
    assert.match(html, /Not another line on the same book/);
    /* The plate is not a card in the brokers grid, and the explainer never
       paints unasked — first reach opens it. */
    assert.doesNotMatch(html, /Enter the launch desk/);
    assert.doesNotMatch(html, /id="launch-explainer-halley"/);
    /* No direct door before the gate — "Bring" is a button, not a link.
       (The turret's launch slip also links ?desk=halley, so slice on the
       plate's own note, not the kicker.) */
    const plate = html.slice(html.indexOf('Not another line on the same book'), html.indexOf('id="house-method"'));
    assert.doesNotMatch(plate, /href="\/\?desk=halley/);
  });

  it('gates the first reach — the explainer opens, then entry marks it seen', async () => {
    window.localStorage.removeItem('claflin.launchdesk.v1.seen');
    let entered: string | null = null;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: id => { entered = id; } })));

    /* The turret's ring shares the verb — the gate lives on the plate. */
    const plateEl = getRootElement().querySelector('.launchPlate')!;
    const bring = Array.from(plateEl.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Bring Halley a launch'));
    assert.ok(bring, 'the plate’s way in renders as a button while unseen');
    await act(async () => click(bring!));

    const explainer = getRootElement().querySelector('#launch-explainer-halley');
    assert.ok(explainer, 'the explainer opens to the plate’s left');
    assert.match(text(explainer), /makes instruments; it does not trade them/);
    assert.match(text(explainer), /the tape desks are above/);
    assert.equal(entered, null, 'the gate holds — no navigation yet');
    assert.equal(window.localStorage.getItem('claflin.launchdesk.v1.seen'), null, 'peeking does not mark the gate');

    const enterLink = Array.from(explainer!.querySelectorAll('a'))
      .find(a => a.textContent?.includes('Enter the launch desk'));
    assert.ok(enterLink, 'the door lives inside the explainer');
    await act(async () => click(enterLink!));
    assert.equal(entered, 'halley');
    assert.equal(window.localStorage.getItem('claflin.launchdesk.v1.seen'), '1', 'entry marks the gate seen');
  });

  it('the plate reads its own moves — the desk explains itself without the explainer', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    /* The move vocabulary is unique to the plate's foot strip. */
    for (const move of ['Name a tracker token', 'Anchor the opening to a live mark', 'Set the curve and the graduation line', 'paper or wallet']) {
      assert.match(html, new RegExp(move), `plate carries the move "${move}"`);
    }
  });

  it('a seen caller gets the door directly — the gate never re-asks', async () => {
    window.localStorage.setItem('claflin.launchdesk.v1.seen', '1');
    let entered: string | null = null;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: id => { entered = id; } })));

    const enterLink = Array.from(getRootElement().querySelectorAll('a'))
      .find(a => a.textContent?.includes('Bring Halley a launch'));
    assert.ok(enterLink, 'the CTA is the door itself once seen');
    assert.equal(enterLink!.getAttribute('href'), '/?desk=halley');
    await act(async () => click(enterLink!));
    assert.equal(entered, 'halley');
  });

  it('the scroll walk glides but never repositions the reader — no snap', () => {
    /* Proximity snap on a page whose rooms keep changing height (live
       marks, lazy portraits, the deal animation) moved its claim zones
       under the reader and yanked the scroll back to boundaries. The
       foyer keeps the lenis glide but loads no snap module and places no
       snap stops, so a pause mid-room always rests where the reader left
       it. */
    const foyer = source('components/desk/HouseFoyer.tsx');
    assert.doesNotMatch(foyer, /lenis\/snap/);
    assert.doesNotMatch(foyer, /distanceThreshold|addElements|snapInstance/);
    assert.match(foyer, /import\('lenis'\)/);
    assert.doesNotMatch(foyer, /data-snap-stop/);
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.doesNotMatch(html, /data-snap-stop/);
  });

  it('room grounds stay scrimmed — the house scene is never painted out', () => {
    /* Grounds are air, objects are paper: sections below the hero carry
       the shared scrim tokens so the fixed scene stays present, and no
       room ground goes opaque again. */
    const css = source('components/desk/HouseFoyer.module.css');
    const ground = (name: string) =>
      [...css.matchAll(new RegExp(`\\.${name}\\b[^}]*}`, 'g'))].map((m) => m[0]).join('\n');
    for (const [room, token] of [
      ['wire', '--scrim-dense'], ['method', '--scrim-read'], ['exampleCall', '--scrim-read'],
      ['desks', '--scrim-open'], ['answers', '--scrim-open'], ['footer', '--scrim-return'],
    ] as const) {
      assert.match(ground(room), new RegExp(`var\\(${token}\\)`), `${room} ground uses ${token}`);
      assert.doesNotMatch(ground(room), /background:\s*var\(--night\)|background:\s*#0d1218\b/, `${room} ground is never opaque night`);
    }
    /* The tokens are defined once, in the shared craft file. */
    const tokens = source('styles/desk-craft.css');
    for (const t of ['--scrim-dense', '--scrim-read', '--scrim-open', '--scrim-return', '--scrim-focus']) {
      assert.match(tokens, new RegExp(`${t}:`), `${t} defined in desk-craft`);
    }
  });
});

function quoteRow(over: Partial<{ symbol: string; status: string; price: string | null; updatedAt: number }> = {}, index = 0): WireMark {
  const updatedAt = over.updatedAt ?? Date.parse('2026-10-11T15:30:00Z');
  return {
    key: `base:inst-${index}`,
    rail: 'BASE',
    asOf: updatedAt - 1000,
    mark: {
      instrumentId: `inst-${index}`,
      symbol: over.symbol ?? `TST${index}`,
      name: 'Test instrument',
      reference: {
        status: (over.status ?? 'observed') as 'observed' | 'stale' | 'unavailable',
        source: 'chainlink',
        priceUsdPerToken: over.price === null ? undefined : (over.price ?? '227.10'),
        updatedAt,
        session: 'unknown',
        pauseStatus: 'unchecked',
      },
    },
  };
}

describe('the quotation column', () => {
  it('prints real priced rows only, with rail, stale label, and a UTC observation', () => {
    const marks = [
      quoteRow({ symbol: 'AAPLc', price: '227.10' }, 0),
      quoteRow({ symbol: 'TSLAc', status: 'stale' }, 1),
      quoteRow({ symbol: 'MSFTc', price: null }, 2),
    ];
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks }));
    assert.match(html, /Reference marks/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /AAPLc/);
    assert.match(html, /\$227\.10/);
    assert.match(html, /BASE/);
    assert.match(html, /STALE/, 'stale marks carry the wire’s stale label');
    assert.match(html, /Observed Oct 11, 2026 · 15:30 UTC/, 'explicit UTC observation from reference.updatedAt');
    assert.doesNotMatch(html, /MSFTc/, 'unpriced marks never print a row');
  });

  it('stamps each row with its own UTC time, not one aggregate reading', () => {
    const marks = [
      quoteRow({ symbol: 'AAAc', updatedAt: Date.parse('2026-10-11T15:30:00Z') }, 0),
      quoteRow({ symbol: 'BBBc', updatedAt: Date.parse('2026-10-10T09:05:00Z') }, 1),
    ];
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks }));
    assert.match(html, /AAAc[\s\S]*?Observed Oct 11, 2026 · 15:30 UTC/);
    assert.match(html, /BBBc[\s\S]*?Observed Oct 10, 2026 · 09:05 UTC/);
    assert.equal(html.match(/Observed /g)?.length, 2, 'each row carries its own observation');
  });

  it('labels a fetch snapshot as Snapshot, never as an observation', () => {
    const row = quoteRow({ symbol: 'AAPLc' }, 0);
    (row.mark.reference as { updatedAt?: number }).updatedAt = undefined;
    row.asOf = Date.parse('2026-10-11T18:05:00Z');
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks: [row] }));
    assert.match(html, /Snapshot Oct 11, 2026 · 18:05 UTC/);
    assert.doesNotMatch(html, /Observed/);
  });

  it('renders seconds-scale upstream timestamps at their real instant', () => {
    const row = quoteRow({ symbol: 'NVDAc', updatedAt: Math.floor(Date.parse('2026-10-09T14:37:53Z') / 1000) }, 0);
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks: [row] }));
    assert.match(html, /Observed Oct 9, 2026 · 14:37 UTC/);
    assert.doesNotMatch(html, /1970/);
  });

  it('falls back to the snapshot when updatedAt is out of Date’s range', () => {
    const row = quoteRow({ symbol: 'AAPLc' }, 0);
    (row.mark.reference as { updatedAt?: number }).updatedAt = 9e20;
    row.asOf = Date.parse('2026-10-11T18:05:00Z');
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks: [row] }));
    assert.match(html, /Snapshot Oct 11, 2026 · 18:05 UTC/);
    assert.doesNotMatch(html, /Observed/);
  });

  it('says Time unavailable when even the snapshot is out of range', () => {
    const row = quoteRow({ symbol: 'AAPLc' }, 0);
    (row.mark.reference as { updatedAt?: number }).updatedAt = 9e20;
    row.asOf = -9e20;
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks: [row] }));
    assert.match(html, /Time unavailable/);
    assert.doesNotMatch(html, /Observed|Snapshot/);
  });

  it('says Time unavailable when a row has no valid timestamp at all', () => {
    const row = quoteRow({ symbol: 'AAPLc' }, 0);
    (row.mark.reference as { updatedAt?: number }).updatedAt = undefined;
    row.asOf = undefined;
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks: [row] }));
    assert.match(html, /Time unavailable/);
    assert.doesNotMatch(html, /Observed|Snapshot/);
  });

  it('excludes unavailable marks even when a residual price exists', () => {
    const marks = [quoteRow({ symbol: 'GONEc', status: 'unavailable' })];
    assert.equal(renderToStaticMarkup(createElement(QuoteColumn, { marks })), '');
  });

  it('prints nothing at all when no real priced marks exist', () => {
    assert.equal(renderToStaticMarkup(createElement(QuoteColumn, { marks: [] })), '');
    assert.equal(
      renderToStaticMarkup(createElement(QuoteColumn, { marks: [quoteRow({ price: null })] })),
      '',
      'a rail with only unpriced marks leaves no column',
    );
  });

  it('caps the column deterministically at seven rows', () => {
    const marks = Array.from({ length: 12 }, (_, i) => quoteRow({}, i));
    const html = renderToStaticMarkup(createElement(QuoteColumn, { marks }));
    assert.equal(html.match(/class="quoteRow"/g)?.length, 7);
    assert.match(html, /TST6/);
    assert.doesNotMatch(html, /TST7/, 'rows past the cap never print');
  });

  it('hangs in the answers room only when real marks feed it — no new fetches', () => {
    assert.doesNotMatch(
      renderToStaticMarkup(createElement(HouseAnswers)),
      /Reference marks/,
      'no marks, no column',
    );
    const html = renderToStaticMarkup(createElement(HouseAnswers, { marks: [quoteRow({ symbol: 'AAPLc' })] }));
    assert.match(html, /id="house-answers"/);
    assert.match(html, /Reference marks/);
    assert.match(html, /class="answersBody"/);
    assert.match(html, /class="quoteColumn"/);
  });
});

describe('the house sheet', () => {
  const sheetDesks: HouseDeskId[] = ['hetty', 'jesse', 'tennie'];

  it('first paint is masthead alone — no fake date, no note, no clock on the server', () => {
    const html = renderToStaticMarkup(createElement(HouseSheet));
    assert.match(html, /The House Sheet/);
    assert.match(html, /aria-label="The house sheet"/);
    assert.doesNotMatch(html, /houseSheetDate/);
    assert.doesNotMatch(html, /desk note|UTC/);
  });

  it('rotates desks on the same UTC day index the notes use', () => {
    const day = new Date('2026-10-11T12:00:00Z');
    const dayIndex = Math.floor(day.getTime() / 86_400_000);
    assert.equal(houseSheetDesk(sheetDesks, day), sheetDesks[dayIndex % sheetDesks.length]);
    const next = new Date(day.getTime() + 86_400_000);
    assert.notEqual(houseSheetDesk(sheetDesks, next), houseSheetDesk(sheetDesks, day));
    assert.equal(houseSheetDesk([], day), null, 'no open desks, no sheet');
  });

  it('prints the chosen desk’s note verbatim with the real date', () => {
    const day = new Date('2026-10-11T12:00:00Z');
    const deskId = houseSheetDesk(sheetDesks, day)!;
    const note = deskNoteOfTheDay(deskId, day);
    const html = renderToStaticMarkup(createElement(HouseSheet, { date: day, desks: sheetDesks }));
    assert.match(html, /October 11, 2026 · UTC/, 'the date line is real and names its zone');
    assert.ok(html.includes(note.text), 'the note prints verbatim');
    assert.match(html, /firm whose Weekly printed what the Street would not/, 'true provenance, no invented issue');
    assert.doesNotMatch(html, /Claflin’s Weekly|No\. \d/i, 'never claims to be the historical paper or an issue number');
  });

  it('sets word days as the boxed word of the trade', () => {
    const base = new Date('2026-10-11T12:00:00Z');
    const wordDay = [0, 1, 2, 3, 4].map(i => new Date(base.getTime() + i * 86_400_000))
      .find(d => deskNoteOfTheDay(houseSheetDesk(sheetDesks, d)!, d).term);
    assert.ok(wordDay, 'a word day exists in range');
    const html = renderToStaticMarkup(createElement(HouseSheet, { date: wordDay, desks: sheetDesks }));
    assert.match(html, /A word of the trade/);
    assert.match(html, /class="houseSheetWordTerm"/);
  });

  it('carries a speaker’s attribution verbatim when the note has one', () => {
    const base = new Date('2026-10-11T12:00:00Z');
    const attributed = Array.from({ length: 40 }, (_, i) => new Date(base.getTime() + i * 86_400_000))
      .map(d => ({ date: d, note: deskNoteOfTheDay(houseSheetDesk(sheetDesks, d)!, d) }))
      .find(({ note }) => note.attribution);
    assert.ok(attributed, 'an attributed note exists in range');
    const html = renderToStaticMarkup(createElement(HouseSheet, { date: attributed!.date, desks: sheetDesks }));
    assert.ok(html.includes(attributed!.note.attribution!), 'the byline is the attribution verbatim');
    assert.doesNotMatch(html, /not a quotation/, 'a real quotation is not disclaimed as a desk note');
  });

  it('labels an unattributed note as a desk note, not a quotation', () => {
    const base = new Date('2026-10-11T12:00:00Z');
    const generic = Array.from({ length: 40 }, (_, i) => new Date(base.getTime() + i * 86_400_000))
      .map(d => ({ date: d, note: deskNoteOfTheDay(houseSheetDesk(sheetDesks, d)!, d) }))
      .find(({ note }) => !note.attribution && !note.term);
    assert.ok(generic, 'a generic note exists in range');
    const html = renderToStaticMarkup(createElement(HouseSheet, { date: generic!.date, desks: sheetDesks }));
    assert.match(html, /a desk note, not a quotation/);
  });

  it('rolls the sheet to the new day at UTC midnight while the page stays open', async () => {
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-11T23:59:58Z') });
    try {
      root = createRoot(getRootElement());
      await act(async () => root!.render(createElement(HouseSheet, { desks: sheetDesks })));
      await act(async () => { mock.timers.tick(1); });
      assert.match(text(getRootElement()), /October 11, 2026 · UTC/);
      await act(async () => { mock.timers.tick(3_000); });
      assert.match(text(getRootElement()), /October 12, 2026 · UTC/);
      assert.doesNotMatch(text(getRootElement()), /October 11, 2026/, 'yesterday does not linger past midnight');
    } finally {
      mock.timers.reset();
    }
  });
});
