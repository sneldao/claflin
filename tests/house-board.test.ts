import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardRow, explorerFor, formatGap, observedAtMs, PRODUCT_FACTS, shortAddress } from '../lib/desk/board';
import { offeringForInstrument } from '../lib/desk/offerings';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import type { DeskMark } from '../lib/trading/marks-shared';
import { HouseOfferings } from '../components/desk/HouseOfferings';
import { resetContainer, getRootElement } from './jsdom-setup';

const aaplc = offeringForInstrument(DESK_INSTRUMENTS.find(s => s.symbol === 'AAPLc')!.id)!;
const aaplx = offeringForInstrument(SOLANA_INSTRUMENTS.find(s => s.symbol === 'AAPLx')!.id)!;
const NOW = Date.UTC(2026, 8, 24, 15, 21, 4);

const baseMark = (status: 'observed' | 'stale' = 'observed'): DeskMark => ({
  instrumentId: aaplc.instrumentId, symbol: 'AAPLc', name: 'Apple Inc.',
  reference: { status, source: 'chainlink', priceUsdPerToken: '336.21', updatedAt: NOW, session: 'unknown', pauseStatus: 'unchecked' },
});
const solMark = (status: 'observed' | 'stale' = 'observed', differenceBps: string | null = '9.4'): DeskMark => ({
  instrumentId: aaplx.instrumentId, symbol: 'AAPLx', name: 'Apple xStock',
  reference: { status, source: 'jupiter-price-v3', priceUsdPerToken: '336.52', updatedAt: NOW, session: 'unknown', pauseStatus: 'unchecked' },
  stockReference: { priceUsd: '336.2100', source: 'backed', differenceBps },
});

describe('board rows (pure)', () => {
  it('shows a gap only where the desk observed a stock reference', () => {
    const row = boardRow(aaplx, solMark(), true);
    assert.equal(row.tokenMark, '336.52');
    assert.equal(row.stockRef, '336.21');
    assert.equal(row.gapBps, 9.4);
    assert.equal(row.markSource, 'Jupiter Price');
    assert.equal(row.stockRefSource, 'Backed');
  });

  it('never invents a Base gap: no stock reference on that rail', () => {
    const row = boardRow(aaplc, baseMark(), true);
    assert.equal(row.tokenMark, '336.21');
    assert.equal(row.stockRef, null);
    assert.equal(row.gapBps, null);
    assert.equal(row.gapNote, 'No stock reference on this rail yet');
  });

  it('drops the gap when the mark is stale or the readings were not comparable', () => {
    assert.equal(boardRow(aaplx, solMark('stale'), true).gapBps, null);
    assert.equal(boardRow(aaplx, solMark('stale'), true).gapNote, 'Mark is not fresh, so no gap is shown');
    assert.equal(boardRow(aaplx, solMark('observed', null), true).gapBps, null);
  });

  it('reads Chainlink seconds and Jupiter milliseconds as the same moment', () => {
    assert.equal(observedAtMs(NOW / 1000), NOW);
    assert.equal(observedAtMs(NOW), NOW);
    assert.equal(observedAtMs(undefined), null);
    const baseSeconds = { ...baseMark(), reference: { ...baseMark().reference, updatedAt: NOW / 1000 } };
    assert.equal(boardRow(aaplc, baseSeconds, true).markAt, NOW);
  });

  it('distinguishes still-reading from unavailable', () => {
    assert.equal(boardRow(aaplc, undefined, false).markState, 'pending');
    assert.equal(boardRow(aaplc, undefined, true).markState, 'unavailable');
  });

  it('links each token to a public explorer for its own rail', () => {
    assert.match(explorerFor(aaplc).url, /^https:\/\/basescan\.org\/token\/0x[0-9a-f]{40}$/i);
    assert.equal(explorerFor(aaplx).url, `https://solscan.io/token/${SOLANA_INSTRUMENTS[0].mint}`);
    assert.equal(shortAddress('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp'), 'XsbEhL…JzJp');
  });

  it('states what each product family is, and who it is for, with a source', () => {
    for (const facts of [PRODUCT_FACTS['coinbase-tokenized-stocks']!, PRODUCT_FACTS['backed-xstocks']!]) {
      assert.match(facts.eligibility, /US/);
      assert.match(facts.sourceUrl, /^https:\/\//);
    }
    assert.match(PRODUCT_FACTS['backed-xstocks']!.rights, /no shareholder voting rights/);
  });

  it('formats the gap with a true minus sign', () => {
    assert.equal(formatGap(13.6), '+13.6 bps');
    assert.equal(formatGap(-4), '−4.0 bps');
    assert.equal(formatGap(0), '0.0 bps');
  });
});

describe('house board (component)', () => {
  let root: Root | null = null;
  beforeEach(() => resetContainer());
  afterEach(async () => { if (root) { await act(async () => root!.unmount()); root = null; } });

  it('SSR paints one table row per offering, with the shared facts said once', () => {
    const html = renderToStaticMarkup(createElement(HouseOfferings, { onEnter: () => {} }));
    assert.match(html, /<table/);
    assert.match(html, /<caption[^>]*>Quoted in USDC\./);
    assert.equal((html.match(/Quoted in USDC/g) ?? []).length, 1, 'the quote asset is said once, not per row');
    assert.match(html, /Token mark/);
    assert.match(html, /Stock ref/);
    assert.match(html, />Gap</);
    assert.match(html, /Reading…/, 'no marks yet reads as reading, not as zero');
  });

  it('a row opens to the contract, what it is, and who it is for', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseOfferings, {
      onEnter: () => {},
      instruction: 'AAPLx',
      marks: { jesse: { result: { asOf: NOW, marks: [solMark()] }, failed: false } },
    })));
    const toggle = getRootElement().querySelector('button[aria-controls="board-AAPLx"]') as HTMLButtonElement;
    const details = getRootElement().querySelector('#board-AAPLx') as HTMLElement;
    assert.equal(details.hidden, true);
    await act(async () => { toggle.click(); });
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(details.hidden, false);
    const text = details.textContent ?? '';
    assert.match(text, /tracker certificate/);
    assert.match(text, /Not offered in the United States or to US persons/);
    assert.ok(details.querySelector(`a[href="https://solscan.io/token/${SOLANA_INSTRUMENTS[0].mint}"]`), 'mint links to the explorer');
    assert.match(getRootElement().textContent ?? '', /\+9\.4 bps/);
  });
});
