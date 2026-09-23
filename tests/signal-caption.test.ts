import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { markSignalSeen, signalSeen, useSignalCaption } from '../lib/desk/use-signal-caption';
import { SignalCaption } from '../components/desk/SignalCaption';
import { resetContainer, getRootElement } from './jsdom-setup';

function Harness({ captionKey = 'lampCool' as const }: { captionKey?: 'lampCool' | 'fuseDrain' | 'stampThud' }) {
  const { show, dismiss } = useSignalCaption(captionKey);
  return createElement('div', null,
    createElement('span', { id: 'state' }, show ? 'shown' : 'hidden'),
    createElement('button', { id: 'dismiss', onClick: dismiss }, 'x'));
}

describe('first-exposure signal captions', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  async function mount(key?: 'lampCool' | 'fuseDrain' | 'stampThud') {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Harness, { captionKey: key })));
    await act(async () => {});
  }

  function state(): string | null {
    return getRootElement().querySelector('#state')?.textContent ?? null;
  }

  it('shows on first mount and retires on dismiss', async () => {
    await mount('fuseDrain');
    assert.equal(state(), 'shown');
    assert.equal(signalSeen('fuseDrain'), false, 'visible is not yet an exposure');
    const dismiss = getRootElement().querySelector('#dismiss') as HTMLButtonElement;
    await act(async () => { dismiss.click(); });
    assert.equal(state(), 'hidden');
    assert.equal(signalSeen('fuseDrain'), true, 'dismissal persists per browser');
  });

  it('stays hidden when already seen', async () => {
    markSignalSeen('lampCool');
    await mount('lampCool');
    assert.equal(state(), 'hidden');
  });

  it('keys are independent per signal', async () => {
    markSignalSeen('stampThud');
    assert.equal(signalSeen('stampThud'), true);
    assert.equal(signalSeen('lampCool'), false);
  });

  it('SignalCaption renders text with a dismiss control, or nothing when seen', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SignalCaption, { captionKey: 'lampCool' })));
    await act(async () => {});
    const caption = getRootElement().querySelector('p[role="status"]');
    assert.ok(caption?.textContent?.includes('room cools'), 'caption teaches the signal once');
    assert.ok(caption?.querySelector('button[aria-label="Dismiss"]'), 'caption can be dismissed');

    await act(async () => { root!.unmount(); });
    resetContainer();
    markSignalSeen('lampCool');
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(SignalCaption, { captionKey: 'lampCool' })));
    await act(async () => {});
    assert.equal(getRootElement().querySelector('p[role="status"]'), null, 'retired caption renders nothing');
  });
});
