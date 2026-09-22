import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { offeringForInstrument } from '../lib/desk/offerings';
import { useTradingDesk } from '../lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { resetContainer } from './jsdom-setup';

describe('offering-led desk entry', () => {
  let root: Root | null = null;
  let desk: ReturnType<typeof useTradingDesk> | null = null;
  const base = offeringForInstrument(DESK_INSTRUMENTS[0].id)!;
  const solana = offeringForInstrument(SOLANA_INSTRUMENTS[0].id)!;

  function Harness() {
    desk = useTradingDesk();
    return null;
  }

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    desk = null;
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    window.history.replaceState({}, '', '/');
  });

  async function render() {
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(createElement(Harness)));
    await act(async () => {});
  }

  it('carries a valid Base offering into the ticket draft and address bar', async () => {
    await render();
    assert.equal(desk!.entryPhase, 'foyer');

    await act(async () => desk!.enterDesk('hetty', base.offeringId));

    assert.equal(desk!.deskId, 'hetty');
    assert.equal(desk!.entryOfferingId, base.offeringId);
    assert.equal(desk!.state.draft.instrumentId, base.instrumentId);
    assert.match(window.location.search, /desk=hetty/);
    assert.match(window.location.search, /offering=/);
  });

  it('keeps a Solana offering as entry context for Jesse without injecting Base draft state', async () => {
    await render();
    await act(async () => desk!.enterDesk('jesse', solana.offeringId));

    assert.equal(desk!.deskId, 'jesse');
    assert.equal(desk!.entryOfferingId, solana.offeringId);
    assert.equal(desk!.state.draft.instrumentId, '');
    assert.match(window.location.search, /desk=jesse/);
    assert.match(window.location.search, /offering=/);
  });

  it('rejects a valid offering on a desk that cannot carry it', async () => {
    await render();
    await act(async () => desk!.enterDesk('jesse', base.offeringId));

    assert.equal(desk!.deskId, 'jesse');
    assert.equal(desk!.entryOfferingId, null);
    assert.equal(desk!.state.draft.instrumentId, '');
    assert.doesNotMatch(window.location.search, /offering=/);
  });
});
