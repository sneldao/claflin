import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LazyDeskAuthProvider, useDeskAuth, type AccountBridgeProps, type DeskAuth } from '../components/auth/AuthProvider';
import { resetContainer, getRootElement } from './jsdom-setup';

let auth: DeskAuth;
let mounts = 0;
let unmounts = 0;
function Paper() {
  const currentAuth = useDeskAuth();
  useEffect(() => { auth = currentAuth; }, [currentAuth]);
  useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
  return createElement('input', { defaultValue: 'paper draft' });
}

describe('action-loaded optional accounts', () => {
  let root: Root;
  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    mounts = unmounts = 0;
    root = createRoot(getRootElement());
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('does not load on anonymous visits and preserves paper state through sign-in', async () => {
    let loads = 0;
    let requests = 0;
    let resolve!: (component: (props: AccountBridgeProps) => null) => void;
    const load = () => { loads++; return new Promise<(props: AccountBridgeProps) => null>(r => { resolve = r; }); };
    await act(async () => root.render(createElement(LazyDeskAuthProvider, { enabled: true, load }, createElement(Paper))));
    assert.equal(loads, 0);
    const input = getRootElement().querySelector('input')!;
    input.value = 'kept instruction';
    await act(async () => { auth.login(); auth.login(); });
    assert.equal(loads, 1);
    const account = { ...auth, ready: true, authenticated: true, userId: 'user-test' };
    function Bridge({ onChange, request }: AccountBridgeProps) {
      useEffect(() => { onChange(account); }, [onChange]);
      useEffect(() => { if (request) requests++; }, [request]);
      return null;
    }
    await act(async () => resolve(Bridge));
    assert.equal(requests, 1);
    assert.equal(auth.authenticated, true);
    assert.equal(mounts, 1);
    assert.equal(unmounts, 0);
    assert.equal(getRootElement().querySelector('input'), input);
    assert.equal(input.value, 'kept instruction');
  });

  it('allows retry after a chunk-load failure while keeping paper usable', async () => {
    let loads = 0;
    const load = async () => { loads++; throw new Error('offline'); };
    await act(async () => root.render(createElement(LazyDeskAuthProvider, { enabled: true, load }, createElement(Paper))));
    await act(async () => auth.login());
    assert.match(getRootElement().querySelector('[role="alert"]')!.textContent!, /could not load/);
    assert.equal(auth.authenticated, false);
    assert.equal(mounts, 1);
    await act(async () => auth.login());
    assert.equal(loads, 2);
  });

  it('restores previously activated account services without a sign-in request', async () => {
    window.localStorage.setItem('claflin.account.activated', 'true');
    let loads = 0;
    let pending: AccountBridgeProps['request'] = null;
    function Bridge({ request }: AccountBridgeProps) { pending = request; return null; }
    const load = async () => { loads++; return Bridge; };
    await act(async () => root.render(createElement(LazyDeskAuthProvider, { enabled: true, load }, createElement(Paper))));
    assert.equal(loads, 1);
    assert.equal(pending, null);
  });

  it('never loads account services when account configuration is absent', async () => {
    let loads = 0;
    const load = async () => { loads++; return () => null; };
    await act(async () => root.render(createElement(LazyDeskAuthProvider, { enabled: false, load }, createElement(Paper))));
    assert.equal(auth.enabled, false);
    await act(async () => { auth.login(); auth.linkWallet(); });
    assert.equal(loads, 0);
    assert.equal(window.localStorage.getItem('claflin.account.activated'), null);
  });
});
