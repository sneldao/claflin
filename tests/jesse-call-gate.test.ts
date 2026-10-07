import './jsdom-setup';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JesseCallGate } from '../components/desk/JesseCallGate';
import { consumeRingOnArrival, requestRingOnArrival, LINE_SIGNAL_EVENT } from '../lib/trading/line-signal';
import { resetContainer, getRootElement } from './jsdom-setup';
import type { JesseDesk } from '../lib/solana/useJesseDesk';

function signalLine() {
  window.dispatchEvent(new window.CustomEvent(LINE_SIGNAL_EVENT, { detail: 'toggle' }));
}

describe('Jesse voice loading handoff', () => {
  let root: Root;
  beforeEach(() => { resetContainer(); window.sessionStorage.clear(); root = createRoot(getRootElement()); });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('loads only after the shared hotkey signal and hands one pending ring to the carrier', async () => {
    let loads = 0;
    let rings = 0;
    function Call() { useEffect(() => { if (consumeRingOnArrival('jesse')) rings++; }, []); return null; }
    const load = async () => { loads++; return Call; };
    await act(async () => root.render(createElement(JesseCallGate, { jesse: {} as JesseDesk, load })));
    assert.equal(loads, 0);
    await act(async () => signalLine());
    assert.equal(loads, 1);
    assert.equal(rings, 1);
  });

  it('honors foyer ring-on-arrival', async () => {
    requestRingOnArrival('jesse');
    let rings = 0;
    function Call() { useEffect(() => { if (consumeRingOnArrival('jesse')) rings++; }, []); return null; }
    await act(async () => root.render(createElement(JesseCallGate, { jesse: {} as JesseDesk, load: async () => Call })));
    assert.equal(rings, 1);
  });

  it('cancel during chunk loading prevents automatic dialing when the carrier arrives', async () => {
    let resolve!: (component: () => null) => void;
    let rings = 0;
    function Call() { useEffect(() => { if (consumeRingOnArrival('jesse')) rings++; }, []); return null; }
    const load = () => new Promise<() => null>(r => { resolve = r; });
    await act(async () => root.render(createElement(JesseCallGate, { jesse: {} as JesseDesk, load })));
    await act(async () => signalLine());
    await act(async () => signalLine());
    await act(async () => resolve(Call));
    assert.equal(rings, 0);
  });

  it('ring after cancellation reuses the pending import and dials once', async () => {
    let resolve!: (component: () => null) => void;
    let loads = 0;
    let rings = 0;
    function Call() { useEffect(() => { if (consumeRingOnArrival('jesse')) rings++; }, []); return null; }
    const load = () => { loads++; return new Promise<() => null>(r => { resolve = r; }); };
    await act(async () => root.render(createElement(JesseCallGate, { jesse: {} as JesseDesk, load })));
    await act(async () => signalLine());
    await act(async () => signalLine());
    await act(async () => signalLine());
    await act(async () => resolve(Call));
    assert.equal(loads, 1);
    assert.equal(rings, 1);
  });

  it('a carrier chunk-load failure leaves an accessible retry and paper controls mounted', async () => {
    const load = async () => { throw new Error('offline'); };
    await act(async () => root.render(createElement(JesseCallGate, { jesse: {} as JesseDesk, load })));
    await act(async () => signalLine());
    assert.match(getRootElement().querySelector('[role="alert"]')!.textContent!, /ticket stays usable/);
    assert.ok(getRootElement().querySelector('button[aria-label="Ring Jesse"]'));
  });
});
