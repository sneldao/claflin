import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TickerTape } from '../components/desk/TickerTape';
import { useReferenceMarks } from '../lib/trading/useReferenceMarks';
import { resetContainer, getRootElement } from './jsdom-setup';

function Harness() {
  const marks = useReferenceMarks();
  return createElement(TickerTape, { marks: marks.result?.marks ?? [], failed: marks.failed, onSelect: () => {}, disabled: false });
}

describe('reference marks to ticker tape', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  async function flush() {
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  it('renders a visible STALE label when the server returns a stale mark', async () => {
    (globalThis as any).fetch = async () => Response.json({
      asOf: Date.now() - 60_000,
      marks: [
        {
          instrumentId: 'googl-base',
          symbol: 'GOOGLc',
          name: 'Alphabet Class A',
          reference: { status: 'stale', source: 'chainlink', priceUsdPerToken: '164.20', updatedAt: Date.now() - 120_000, session: 'unknown', pauseStatus: 'unchecked' },
        },
      ],
    }, { status: 200, headers: { 'X-Marks-Stale': 'true', 'Age': '120' } });

    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();

    const stale = getRootElement().querySelectorAll('[data-stale="true"]');
    assert.ok(stale.length > 0, 'at least one tape item should be flagged stale');
    assert.ok(Array.from(getRootElement().querySelectorAll('span')).some(s => s.textContent === 'STALE'), 'the STALE label must be visible in the DOM');
    assert.ok(getRootElement().textContent?.includes('GOOGLc'), 'the symbol must be visible');
    assert.ok(getRootElement().textContent?.includes('$164.20'), 'the price must be visible');
  });

  it('shows the unavailable note when marks fail to load cold', async () => {
    (globalThis as any).fetch = async () => new Response('{}', { status: 404 });
    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();

    const note = getRootElement().querySelector('[role="status"]');
    assert.ok(note?.textContent?.includes('unavailable'), 'cold failure should surface an unavailable note');
  });
});
