import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JesseTicket } from '../components/desk/JesseTicket';
import type { JesseDesk } from '../lib/solana/useJesseDesk';

const blankDesk = {
  state: {
    draft: { instrumentId: null, side: null, amount: null, unit: null },
    stage: 'draft',
    quote: null,
    comparison: null,
    presentedInstrument: null,
    revision: 0,
  },
  foreground: { kind: 'draft' },
  inFlight: null,
  lastResult: null,
  records: [],
  historyReady: true,
} as unknown as JesseDesk;

describe('jesse blank slip', () => {
  it('shows a pencil ghost naming the tape’s widest gap, with a spoken example', () => {
    const html = renderToStaticMarkup(createElement(JesseTicket, {
      jesse: blankDesk,
      blankSlip: true,
      roomView: true,
      exampleSymbol: 'NVDAx',
    }));
    assert.match(html, /data-ticket-view="blank"/);
    assert.match(html, /Jesse will write what you say\./);
    assert.match(html, /aria-hidden="true">Buy 100 USDC of NVDAx/);
    assert.match(html, /For example: buy 100 USDC of NVDAx\./);
    assert.match(html, /slipGhost/);
    assert.match(html, /slipCaret/);
    assert.doesNotMatch(html, /This slip stays blank/);
  });
});
