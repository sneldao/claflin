import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TickerTape } from '../components/desk/TickerTape';
import { useReferenceMarks } from '../lib/trading/useReferenceMarks';
import { resetContainer, getRootElement } from './jsdom-setup';

const now = Date.now();
const observedMark = {
  instrumentId: 'googl-base',
  symbol: 'GOOGLc',
  name: 'Alphabet Class A',
  reference: { status: 'observed', source: 'chainlink', priceUsdPerToken: '164.20', updatedAt: now - 60_000, session: 'unknown', pauseStatus: 'unchecked' },
};

const staleMark = {
  ...observedMark,
  reference: { ...observedMark.reference, status: 'stale' as const },
};

function Harness() {
  const marks = useReferenceMarks();
  return createElement(TickerTape, {
    marks: marks.result?.marks ?? [],
    failed: marks.failed,
    stale: marks.stale,
    asOf: marks.result?.asOf,
    onSelect: () => {},
    disabled: false,
  });
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

  async function refresh() {
    document.dispatchEvent(new (window as any).Event('visibilitychange'));
    await flush();
  }

  it('renders a visible STALE label when the server returns a stale mark', async () => {
    (globalThis as any).fetch = async () => Response.json({ asOf: now - 120_000, marks: [staleMark] }, { status: 200, headers: { 'X-Marks-Stale': 'true', 'Age': '120' } });

    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();

    const stale = getRootElement().querySelectorAll('[data-stale="true"]');
    assert.ok(stale.length > 0, 'at least one tape item should be flagged stale');
    assert.ok(Array.from(getRootElement().querySelectorAll('span')).some(s => s.textContent === 'STALE'), 'the STALE label must be visible in the DOM');
    assert.ok(getRootElement().textContent?.includes('GOOGLc'), 'the symbol must be visible');
    assert.ok(getRootElement().textContent?.includes('$164.20'), 'the price must be visible');
    assert.ok(getRootElement().textContent?.includes('last known'), 'stale age should be shown');
  });

  it('shows the unavailable note when marks fail to load cold', async () => {
    (globalThis as any).fetch = async () => new Response('{}', { status: 404 });
    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();

    const note = getRootElement().querySelector('[role="status"]');
    assert.ok(note?.textContent?.includes('unavailable'), 'cold failure should surface an unavailable note');
  });

  it('degrades retained marks when a refresh fails, then recovers on the next successful refresh', async () => {
    let calls = 0;
    (globalThis as any).fetch = async () => {
      calls++;
      if (calls === 1) return Response.json({ asOf: now - 120_000, marks: [observedMark] }, { status: 200 });
      if (calls === 2) return new Response('{}', { status: 404 });
      return Response.json({ asOf: now - 10_000, marks: [observedMark] }, { status: 200 });
    };

    root = createRoot(getRootElement());
    await act(async () => root.render(createElement(Harness)));
    await flush();

    const container = getRootElement();
    assert.ok(container.textContent?.includes('GOOGLc'), 'initial observed mark should render');
    assert.ok(!container.textContent?.includes('STALE'), 'initial mark should not be stale');
    assert.ok(!container.textContent?.includes('last known'), 'initial mark should not show stale age');

    await refresh();
    assert.ok(container.textContent?.includes('STALE'), 'failed refresh should degrade retained marks to stale');
    assert.ok(container.textContent?.includes('last known'), 'stale note should appear after refresh failure');

    await refresh();
    assert.ok(!container.textContent?.includes('STALE'), 'successful recovery should remove stale labels');
    assert.ok(!container.textContent?.includes('last known'), 'stale note should disappear after recovery');
  });
});
