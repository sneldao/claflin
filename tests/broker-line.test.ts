import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrokerLinePlate, LineCaptions } from '../components/desk/BrokerLine';
import { GapStrip } from '../components/desk/JesseTicket';
import type { DeskMark } from '../lib/trading/marks-shared';

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const xMark: DeskMark = {
  instrumentId: 'sol:aapl',
  symbol: 'AAPLx',
  name: 'Apple xStock',
  reference: { status: 'observed', source: 'jupiter-price-v3', priceUsdPerToken: '227.41', updatedAt: 1, session: 'unknown', pauseStatus: 'unchecked' },
  stockReference: { priceUsd: '227.1', source: 'backed', differenceBps: '13.6' },
};

describe('broker line plate', () => {
  it('shows the attributed signature, the lens and the take', () => {
    const html = textOf(renderToStaticMarkup(createElement(BrokerLinePlate, { deskId: 'hetty', take: 'Count what being wrong would cost.' })));
    assert.match(html, /I buy when things are low and no one wants them/);
    assert.match(html, /— Hetty Green/);
    assert.match(html, /Asks what you could lose before what you might make\./);
    assert.match(html, /Hetty’s take/);
    assert.match(html, /Count what being wrong would cost\./);
    assert.match(html, /A way of looking — not advice\./);
  });

  it('hides the take block when there is no take', () => {
    const html = textOf(renderToStaticMarkup(createElement(BrokerLinePlate, { deskId: 'jesse', take: null })));
    assert.match(html, /Jesse Livermore/);
    assert.doesNotMatch(html, /Jesse’s take|not advice/);
  });

  it('renders nothing on the compact plate — the mast already named the broker', () => {
    const raw = renderToStaticMarkup(createElement(BrokerLinePlate, { deskId: 'jesse', take: 'A take.', compact: true }));
    assert.equal(raw, '');
  });
});

describe('line captions', () => {
  const captions = ['one', 'two', 'three', 'four', 'five'].map((text, i) => ({ role: (i % 2 === 0 ? 'user' : 'agent') as 'user' | 'agent', text, at: i }));

  it('keeps a bounded tape: the last three turns in order, newest in full', () => {
    const html = renderToStaticMarkup(createElement(LineCaptions, { captions, brokerName: 'Jesse', applied: 'Applied: AAPLx' }));
    const tape = html.split('<details')[0];
    const lines = tape.match(/<p class="[^"]*captionLine[^"]*"[^>]*>/g) ?? [];
    assert.equal(lines.length, 3, 'a long call never stacks more than three turns on the panel');
    assert.equal(lines.filter(l => l.includes('data-tail="true"')).length, 2, 'all but the newest recede');
    assert.doesNotMatch(lines[2], /data-tail/);
    const out = textOf(tape);
    assert.doesNotMatch(out, /\b(one|two)\b/);
    assert.ok(out.indexOf('three') < out.indexOf('four') && out.indexOf('four') < out.indexOf('five'));
    assert.match(out, /Jesse\. four/);
    assert.match(out, /You\. five/);
    assert.match(out, /Applied: AAPLx/);
    assert.match(html, /data-voice="broker"/);
  });

  it('keeps every turn reachable behind one Whole call fold', () => {
    const out = textOf(renderToStaticMarkup(createElement(LineCaptions, { captions, brokerName: 'Jesse', applied: null })));
    assert.match(out, /Whole call \(5 lines\)/);
    for (const word of ['one', 'two', 'three', 'four', 'five']) assert.match(out, new RegExp(`\\b${word}\\b`));
    const single = textOf(renderToStaticMarkup(createElement(LineCaptions, { captions: captions.slice(0, 1), brokerName: 'Jesse', applied: null })));
    assert.doesNotMatch(single, /Whole call/);
  });

  it('owns the fold in one place — call panels never re-roll their own', () => {
    for (const panel of ['HalleyCall', 'HettyCallSession', 'JesseCall', 'JesseCallAssemblyAI', 'TennieCall']) {
      const source = readFileSync(new URL(`../components/desk/${panel}.tsx`, import.meta.url), 'utf8');
      assert.match(source, /<LineCaptions /, panel);
      assert.doesNotMatch(source, /captionHistory/, `${panel} duplicates the caption fold`);
    }
    const css = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.captionLine\[data-tail="true"\] \{[^}]*line-clamp/s);
    assert.doesNotMatch(css, /\.callCaptions \{ max-width: none/);
  });
});

describe('Jesse gap strip', () => {
  it('heads the slip with the venue price, the stock reference and the signed gap', () => {
    const out = textOf(renderToStaticMarkup(createElement(GapStrip, { mark: xMark })));
    assert.match(out, /ON SOLANA \$227\.41/);
    assert.match(out, /STOCK REF \$227\.1/);
    assert.match(out, /\+13\.6 BPS/);
    assert.match(out, /Jupiter venue vs Backed issuer indicative/);
  });

  it('renders nothing without both observed legs', () => {
    assert.equal(renderToStaticMarkup(createElement(GapStrip, { mark: null })), '');
    assert.equal(renderToStaticMarkup(createElement(GapStrip, { mark: { ...xMark, stockReference: undefined } })), '');
    assert.equal(renderToStaticMarkup(createElement(GapStrip, { mark: { ...xMark, reference: { ...xMark.reference, status: 'stale' } } })), '');
  });
});
