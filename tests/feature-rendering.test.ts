import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotatedExampleCall } from '../components/foyer/AnnotatedExampleCall';
import { ReceiptPortrait } from '../components/desk/ReceiptPortrait';
import { JesseTicket } from '../components/desk/JesseTicket';
import { HouseOfferings } from '../components/desk/HouseOfferings';
import { getHouseDesk } from '../lib/house';
import { CURRENT_EXAMPLE_CALL, isValidExampleCall, type ExampleCall } from '../lib/foyer/example-call';
import { ROBINHOOD_INSTRUMENTS } from '../lib/robinhood/catalog';
import { createRobinhoodMarkAdapter } from '../lib/trading/adapters/robinhood-marks';
import { SOLANA_PAPER_ESTIMATE_FIXTURE, AAPLX_FIXTURE } from '../lib/solana/fixtures';
import type { JesseDesk } from '../lib/solana/useJesseDesk';
import { getRootElement, resetContainer } from './jsdom-setup';

const NOW = Date.parse('2026-10-03T14:00:00Z');
const call: ExampleCall = {
  id: 'reviewed-example', source: 'jesse', recordedAt: NOW, reviewedBy: 'editor',
  intent: { side: 'buy', amount: '100' },
  transcript: [{ speaker: 'caller', text: 'Buy 100 USDC of Apple.' }, { speaker: 'broker', text: 'Filed on paper.' }],
  slip: { symbol: 'AAPLx', quoteAsset: 'USDC', amount: '100', fill: '0.3', venue: 'Jupiter', quotedAt: NOW, expiresAt: NOW + 30_000, mode: 'paper' },
};

describe('feature rendering, not just prop contracts', () => {
  it('changes a pending example to an accepted transcript without changing hook order', async () => {
    resetContainer();
    const root = createRoot(getRootElement());
    try {
      await act(async () => root.render(createElement(AnnotatedExampleCall, { state: CURRENT_EXAMPLE_CALL })));
      assert.equal(getRootElement().querySelectorAll('#house-example').length, 1);
      await act(async () => root.render(createElement(AnnotatedExampleCall, { state: { kind: 'accepted', call } })));
      assert.match(getRootElement().textContent ?? '', /Intent: buy 100 USDC of AAPLx/);
      assert.equal(getRootElement().querySelector('audio'), null);
      assert.doesNotMatch(getRootElement().textContent ?? '', /Play the recording/);
      await act(async () => root.render(createElement(AnnotatedExampleCall, {
        state: { kind: 'accepted', call: { ...call, audioSrc: '/example-call.mp3' } },
      })));
      assert.equal(getRootElement().querySelector('audio')?.getAttribute('src'), '/example-call.mp3');
    } finally {
      await act(async () => root.unmount());
    }
  });
  it('refuses malformed accepted slips and unsafe media sources', () => {
    assert.equal(isValidExampleCall(call), true);
    assert.equal(isValidExampleCall({ ...call, slip: { mode: 'paper' } }), false);
    assert.equal(isValidExampleCall({ ...call, recordedAt: Infinity }), false);
    assert.equal(isValidExampleCall({ ...call, audioSrc: '//external.test/audio' }), false);
    assert.equal(isValidExampleCall({ ...call, intent: null }), false);
  });
  it('renders the portrait from evidence, without inventing a missing date', () => {
    const html = renderToStaticMarkup(createElement(ReceiptPortrait, {
      desk: getHouseDesk('jesse')!, filedAt: null, dateLabel: 'Date unavailable',
    }, 'Filed slip'));
    assert.match(html, /aria-label="Filed receipt"/);
    assert.match(html, /Date unavailable/);
    assert.doesNotMatch(html, /dateLonghand/);
    assert.match(html, /no funds moved/);
    assert.doesNotMatch(html, /solscan.io\/tx/);
  });
  it('mounts the portrait on Jesse’s actual filed ticket', () => {
    const q = SOLANA_PAPER_ESTIMATE_FIXTURE;
    const jesse = {
      state: { draft: q.intent, quote: q, presentedInstrument: AAPLX_FIXTURE },
      foreground: { kind: 'receipt', recordId: q.id }, inFlight: null, lastResult: null,
      records: [{ id: q.id, quote: q, createdAt: NOW, instrumentSnapshot: AAPLX_FIXTURE }],
    } as unknown as JesseDesk;
    const html = renderToStaticMarkup(createElement(JesseTicket, { jesse }));
    assert.match(html, /aria-label="Filed receipt"/);
    assert.match(html, /data-desk="jesse"/);
    assert.match(html, /data-mode="paper"/);
  });
  it('reads Isabel’s real adapter shape through to the visible board', async () => {
    const adapter = createRobinhoodMarkAdapter(
      async feeds => feeds.map(() => ({ answer: 33047000000n, decimals: 8, updatedAt: Math.floor(Date.now() / 1000) })),
      async () => ({ bids: [{ price: '330.28', remainingBase: '1' }], asks: [{ price: '330.30', remainingBase: '1' }] }),
      async () => new Map(ROBINHOOD_INSTRUMENTS.map(instrument => [instrument.lighterMarketId, {
        marketId: instrument.lighterMarketId, lastTradePrice: null, dailyTradesCount: 1,
        dailyQuoteVolume: '380', dailyBaseVolume: null,
      }])),
      async () => new Map(),
    );
    const result = await adapter.read();
    assert.equal(result.marks[0].venueMark?.source, 'lighter');
    assert.ok(result.marks[0].venueMark?.observedAt);
    const html = renderToStaticMarkup(createElement(HouseOfferings, {
      onEnter: () => {}, instruction: result.marks[0].symbol,
      marks: { isabel: { result, failed: false } },
    }));
    assert.match(html, /data-label="Venue mark"/);
    assert.match(html, /\$330\.29/);
    assert.match(html, /24h volume · 380 USDG/);
    assert.match(html, /colSpan="8"|colspan="8"/);
  });
});
