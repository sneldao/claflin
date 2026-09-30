import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { offeringForInstrument } from '../lib/desk/offerings';
import { entryIntentWithInstruction } from '../lib/house-entry';
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

  it('starts a fresh slip for a carried instruction — an omitted amount is never inherited', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty', base.offeringId));
    await act(async () => desk!.edit({ ...desk!.state.draft, amount: '50' }, 'amount'));
    assert.equal(desk!.state.draft.amount, '50');
    await act(async () => desk!.leaveDesk());
    await act(async () => desk!.enterDesk('hetty', base.offeringId, entryIntentWithInstruction('Apple', 'typed')));
    assert.equal(desk!.state.draft.instrumentId, base.instrumentId);
    assert.equal(desk!.state.draft.amount, '');
  });

  it('blocks the estimate until the client chooses buy or sell', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty', base.offeringId, entryIntentWithInstruction('Apple', 'typed')));
    assert.equal(desk!.sideRequired, true);
    await act(async () => { await desk!.requestQuote(); });
    assert.equal(desk!.error, 'Choose buy or sell before asking for an estimate.');
    await act(async () => desk!.edit({ ...desk!.state.draft, amount: '10' }, 'amount'));
    assert.equal(desk!.sideRequired, true);
    await act(async () => desk!.edit({ ...desk!.state.draft, side: 'buy', unit: 'USDC' }, 'side'));
    assert.equal(desk!.sideRequired, false);
  });

  it('keeps the unchosen side across a desk switch away and back', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty', base.offeringId, entryIntentWithInstruction('Apple', 'typed')));
    assert.equal(desk!.sideRequired, true);
    await act(async () => desk!.switchDesk('jesse'));
    assert.equal(desk!.deskId, 'jesse');
    await act(async () => desk!.switchDesk('hetty'));
    assert.equal(desk!.deskId, 'hetty');
    assert.equal(desk!.sideRequired, true, 'the unchosen direction survives the switch');
    await act(async () => { await desk!.requestQuote(); });
    assert.equal(desk!.error, 'Choose buy or sell before asking for an estimate.');
  });

  it('restores the unchosen side from a checkpoint on reload, amount included', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty', base.offeringId, entryIntentWithInstruction('Apple for 25', 'typed')));
    assert.equal(desk!.sideRequired, true);
    assert.equal(desk!.state.draft.amount, '25');
    await act(async () => root!.unmount());
    window.history.replaceState({}, '', '/?desk=hetty&amount=25');
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(createElement(Harness)));
    await act(async () => {});
    assert.equal(desk!.deskId, 'hetty');
    assert.equal(desk!.state.draft.amount, '25');
    assert.equal(desk!.sideRequired, true, 'the checkpoint remembers the side was never chosen');
    await act(async () => { await desk!.requestQuote(); });
    assert.equal(desk!.error, 'Choose buy or sell before asking for an estimate.');
  });

  it('an explicit entry side overrides a checkpoint that still asks for one', async () => {
    await render();
    await act(async () => desk!.enterDesk('hetty', base.offeringId, entryIntentWithInstruction('Apple for 25', 'typed')));
    assert.equal(desk!.sideRequired, true);
    await act(async () => root!.unmount());
    window.history.replaceState({}, '', '/?desk=hetty&side=buy&amount=25');
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(createElement(Harness)));
    await act(async () => {});
    assert.equal(desk!.sideRequired, false, 'the link itself chose the side');
  });

  it('keeps instruction words and source in memory only — never in the URL or storage', async () => {
    await render();
    const intent = entryIntentWithInstruction('sell 2 tokens of Apple please', 'spoken');
    await act(async () => desk!.enterDesk('hetty', base.offeringId, intent));
    assert.equal(desk!.entryIntent?.instruction?.text, 'sell 2 tokens of Apple please');
    assert.equal(desk!.entryIntent?.instruction?.source, 'spoken');
    const params = new URLSearchParams(window.location.search);
    for (const value of params.values()) {
      assert.doesNotMatch(value, /tokens of Apple please/);
    }
    const stored: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      stored.push(window.localStorage.getItem(window.localStorage.key(i)!) ?? '');
    }
    assert.doesNotMatch(stored.join('\n'), /tokens of Apple please/);
  });

  it('carries instruction context to a desk even when its offering belongs elsewhere', async () => {
    await render();
    await act(async () => desk!.enterDesk('jesse', base.offeringId, entryIntentWithInstruction('buy Apple', 'typed')));
    assert.equal(desk!.deskId, 'jesse');
    assert.equal(desk!.entryOfferingId, null);
    assert.equal(desk!.entryIntent?.instruction?.source, 'typed');
    assert.equal(desk!.state.draft.instrumentId, '');
  });
});
