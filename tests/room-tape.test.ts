import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomTape } from '../components/desk/RoomTape';
import type { DeskMark } from '../lib/trading/marks-shared';
import type { MarketClock } from '../lib/market-clock';

const xMark: DeskMark = {
  instrumentId: 'sol:aapl',
  symbol: 'AAPLx',
  name: 'Apple xStock',
  reference: { status: 'observed', source: 'jupiter-price-v3', priceUsdPerToken: '227.41', updatedAt: 1, session: 'unknown', pauseStatus: 'unchecked' },
  stockReference: { priceUsd: '227.1', source: 'backed', differenceBps: '13.6' },
};

const noRefMark: DeskMark = {
  instrumentId: 'sol:tsla',
  symbol: 'TSLAx',
  name: 'Tesla xStock',
  reference: { status: 'observed', source: 'jupiter-price-v3', priceUsdPerToken: '399.9', updatedAt: 1, session: 'unknown', pauseStatus: 'unchecked' },
};

const staleMark: DeskMark = {
  ...xMark,
  instrumentId: 'sol:nvda',
  symbol: 'NVDAx',
  reference: { ...xMark.reference, status: 'stale' },
};

const closedClock = { exchange: 'closed' } as MarketClock;
const openClock = { exchange: 'open' } as MarketClock;

const noop = () => {};
const jesseTape = {
  brokerName: 'Jesse',
  priceLabel: 'on Solana',
  missingSecondLeg: 'no comparable reference',
};

describe('room tape', () => {
  it('writes one row per observed mark with the venue-vs-reference gap', () => {
    const html = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark, noRefMark, staleMark],
      clock: openClock,
      take: 'Both tapes are running.',
      onSelect: noop,
    }));
    assert.match(html, /The tape/);
    assert.match(html, /AAPLx/);
    assert.match(html, /\$227\.41 on Solana/);
    assert.match(html, /\$227\.1 stock ref/);
    assert.match(html, /\+13\.6 bps/);
    assert.match(html, /no comparable reference/);
    /* Stale readings are not observed — no row for them. */
    assert.doesNotMatch(html, /NVDAx/);
    assert.match(html, /Jesse’s take · a way of looking, not advice/);
  });

  it('renders nothing when the tape failed or nothing was observed', () => {
    assert.equal(renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape, marks: [xMark], failed: true, clock: openClock, onSelect: noop,
    })), '');
    assert.equal(renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape, marks: [staleMark], clock: openClock, onSelect: noop,
    })), '');
    assert.equal(renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape, marks: [], clock: openClock, onSelect: noop,
    })), '');
  });

  it('leads with basis points while keeping full legs in the accessible name', () => {
    const html = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark],
      clock: openClock,
      onSelect: noop,
    }));
    /* Visible row uses the same basis points as the broker's take. */
    assert.match(html, /\+13\.6 bps vs stock/);
    /* Full venue-vs-reference legs survive in aria-label + title for details. */
    assert.match(html, /aria-label="AAPLx \$227\.41 on Solana/);
    assert.match(html, /stock ref/);
  });

  it('prints a fresh marker per reading and crossfades the take', () => {
    const html = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark],
      clock: openClock,
      take: 'Both tapes are running.',
      asOf: 123456789,
      onSelect: noop,
    }));
    assert.match(html, /roomTapeFresh/);
    assert.match(html, /Both tapes are running\./);
  });

  it('says a stale reading in the tape and keeps the lamp note off the first read', () => {
    const staleHtml = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark],
      clock: openClock,
      stale: true,
      asOf: Date.now() - 90_000,
      onSelect: noop,
    }));
    assert.match(staleHtml, /last reading/);
    assert.doesNotMatch(staleHtml, /About this light/);
    const freshHtml = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark],
      clock: openClock,
      asOf: Date.now(),
      onSelect: noop,
    }));
    assert.doesNotMatch(freshHtml, /About this light/);
  });

  it('says Tonight’s tape after the close and labels a stale reading', () => {
    const html = renderToStaticMarkup(createElement(RoomTape, {
      ...jesseTape,
      marks: [xMark],
      clock: closedClock,
      stale: true,
      asOf: Date.now() - 90_000,
      onSelect: noop,
    }));
    assert.match(html, /Tonight’s tape/);
    assert.match(html, /last reading/);
  });
});
