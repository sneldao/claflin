import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});

describe('line captions', () => {
  it('shows the last four lines in order with speaker labels', () => {
    const captions = ['one', 'two', 'three', 'four', 'five'].map((text, i) => ({ role: (i % 2 === 0 ? 'user' : 'agent') as 'user' | 'agent', text, at: i }));
    const html = renderToStaticMarkup(createElement(LineCaptions, { captions, brokerName: 'Jesse', applied: 'Applied: AAPLx', discussion: null }));
    const out = textOf(html);
    assert.doesNotMatch(out, /\bone\b/);
    assert.ok(out.indexOf('two') < out.indexOf('three') && out.indexOf('four') < out.indexOf('five'));
    assert.match(out, /Jesse\. two/);
    assert.match(out, /You\. five/);
    assert.match(out, /Applied: AAPLx/);
    assert.match(html, /data-voice="broker"/);
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
