import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SessionEpilogue } from '../components/desk/SessionEpilogue';
import { resetContainer, getRootElement } from './jsdom-setup';
import type { HouseFiling } from '../lib/trading/house-filing';

const now = Date.now();
const filings: HouseFiling[] = [
  { deskId: 'halley', recordId: 'halley-2', createdAt: now, sentence: 'Launch NVTX · AAPLX quote · flat' },
  { deskId: 'jesse', recordId: 'jesse-1', createdAt: now - 60_000, sentence: 'Buy 100 USDC of AAPLx' },
];

function click(el: Element) {
  el.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

describe('the session epilogue', () => {
  let root: Root | null = null;
  let clipboard: { writeText: (t: string) => Promise<void>; last: string | null };

  beforeEach(() => {
    resetContainer();
    clipboard = { last: null, writeText(t: string) { this.last = t; return Promise.resolve(); } };
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: clipboard });
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    delete (window.navigator as any).clipboard;
  });

  it('narrates the book — count, desks, and every line newest first', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SessionEpilogue, { filings, onOpen: () => {} })));

    const html = getRootElement().textContent ?? '';
    assert.match(html, /2 filings across 2 desks/);
    assert.match(html, /Paper only — nothing was signed or settled\./);
    const lines = getRootElement().querySelectorAll('ol li .sentence');
    assert.equal(lines.length, 2);
    assert.match(lines[0].textContent ?? '', /Launch NVTX/);
    assert.match(lines[1].textContent ?? '', /Buy 100 USDC of AAPLx/);
    const desks = getRootElement().querySelectorAll('ol li .desk');
    assert.equal(desks[0].textContent, 'Halley');
    assert.equal(desks[1].textContent, 'Jesse');
  });

  it('opens the record its line names', async () => {
    let opened: string | null = null;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SessionEpilogue, { filings, onOpen: f => { opened = f.recordId; } })));

    const line = getRootElement().querySelectorAll('ol li button')[1];
    await act(async () => click(line));
    assert.equal(opened, 'jesse-1');
  });

  it('copies the story so it can travel past the house', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SessionEpilogue, { filings, onOpen: () => {} })));

    const copy = Array.from(getRootElement().querySelectorAll('button')).find(b => /Copy the story/.test(b.textContent ?? ''));
    assert.ok(copy, 'copy button rendered');
    await act(async () => click(copy!));
    await act(async () => Promise.resolve());

    assert.match(clipboard.last ?? '', /The book so far — 2 filings across 2 desks \(Claflin\)/);
    assert.match(clipboard.last ?? '', /Halley — Launch NVTX/);
    assert.match(clipboard.last ?? '', /Paper only — nothing was signed or settled\./);
    assert.match(copy!.textContent ?? '', /Copied/);
  });

  it('folds a long book at five lines with an honest remainder', async () => {
    const many: HouseFiling[] = Array.from({ length: 7 }, (_, i) => ({
      deskId: 'hetty', recordId: `hetty-${i}`, createdAt: now - i * 1000, sentence: `Buy ${i} USDC of AAPLc`,
    }));
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SessionEpilogue, { filings: many, onOpen: () => {} })));

    assert.equal(getRootElement().querySelectorAll('ol li').length, 5);
    assert.match(getRootElement().textContent ?? '', /and 2 more on file/);
  });

  it('says nothing when the book is empty', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SessionEpilogue, { filings: [], onOpen: () => {} })));
    assert.equal(getRootElement().textContent, '');
  });
});
