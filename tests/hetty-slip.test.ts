import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { initialDesk, type DeskState } from '../lib/trading/workflow';
import { foregroundDocument } from '../lib/trading/desk-documents';
import type { TradeIntent } from '../lib/trading/domain';
import type { useTradingDesk } from '../lib/trading/useTradingDesk';
import type { SlipProvenance } from '../lib/desk/slip-provenance';

const require = createRequire(import.meta.url);
const originalCssLoader = require.extensions['.css'];
require.extensions['.css'] = module => {
  module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
};
const { TradeTicket } = require('../components/desk/TradeTicket') as typeof import('../components/desk/TradeTicket');
if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
else delete require.extensions['.css'];

const now = 1788916260000;
const emptyDraft: TradeIntent = { instrumentId: '', side: 'buy', amount: '', unit: 'USDC' };

function renderRoom(state: DeskState, provenance: SlipProvenance = {}) {
  const clock = mock.method(Date, 'now', () => now);
  const noop = () => {};
  const desk: ReturnType<typeof useTradingDesk> = {
    state, historyReady: true, error: null, storageError: null,
    records: [], watched: [], edit: noop, requestQuote: async () => {}, save: noop, cancel: noop,
    loadHistory: noop, removeRecord: noop, watch: noop, unwatch: noop,
    viewedRecordId: null, focusedRecordId: null, openRecord: noop, dismissRecord: noop,
    deskId: 'hetty', activeDesk: { id: 'hetty', name: 'Hetty', shortName: 'Hetty', market: 'Base', approach: '', access: '', status: 'paper' },
    open: true, switchDesk: noop, enterDesk: noop, entryPhase: 'desk',
    foreground: foregroundDocument(state, null, []),
  };
  try {
    return renderToStaticMarkup(createElement(TradeTicket, {
      desk, roomView: true, provenance,
      onHandEdit: noop, onSlipEdit: noop, onDictated: noop,
    }));
  } finally { clock.mock.restore(); }
}

describe('Hetty written slip in the Room', () => {
  it('writes a blank sentence skeleton instead of a hand form', () => {
    const html = renderRoom(initialDesk(emptyDraft));
    assert.match(html, /data-ticket-view="draft"/);
    /* The slip reads as a sentence with blanks, never a form. */
    assert.doesNotMatch(html, /<form|<select|type="radio"/);
    assert.match(html, /for your account/);
    /* Hetty's draft always carries a side, so the side blank is a value button. */
    assert.match(html, /aria-label="Change side: Buy"/);
    assert.match(html, /aria-label="Add amount"/);
    assert.match(html, /aria-label="Choose stock"/);
  });

  it('marks a hand-written value while it still stands', () => {
    const draft: TradeIntent = { ...emptyDraft, amount: '5' };
    const html = renderRoom(
      { ...initialDesk(draft), draft },
      { amount: { kind: 'hand', value: '5' } },
    );
    assert.match(html, /← by hand/);
    const stale = renderRoom(
      { ...initialDesk(draft), draft },
      { amount: { kind: 'hand', value: '25' } },
    );
    assert.doesNotMatch(stale, /← by hand/);
  });

  it('renders room dictation controls under the slip', () => {
    const html = renderRoom(initialDesk(emptyDraft));
    assert.match(html, /Fill ticket by voice/);
  });
});
