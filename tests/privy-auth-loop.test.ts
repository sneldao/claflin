import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { resetContainer, getRootElement } from './jsdom-setup';

/* Privy's SDK hooks do not guarantee stable identities between renders.
   The stub below returns brand-new objects and functions every call —
   the shape that made the published DeskAuth rebuild every render and
   drove onChange → setAccount → re-render into React error #185. */
const req = createRequire(import.meta.url);
const privyId = req.resolve('@privy-io/react-auth');
const privyStub = new Module(privyId);
(privyStub as unknown as { exports: unknown }).exports = {
  PrivyProvider: ({ children }: { children: unknown }) => children,
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    user: { id: 'user-1', email: { address: 'caller@claflin.test' }, wallet: { address: '0xAbC00000000000000000000000000000000000aa' }, linkedAccounts: [] },
    login: () => {},
    logout: async () => {},
    getAccessToken: async () => null,
    linkWallet: () => {},
  }),
  useSendTransaction: () => ({ sendTransaction: async () => ({ hash: '0x0' as const }) }),
  useWallets: () => ({ wallets: [] }),
};
req.cache[privyId] = privyStub;

process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app';
process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID = 'test-client';

/* Must come after the stub is in the cache — the component reads the SDK
   at module load. */
const PrivyBackedAuth = req('../components/auth/PrivyBackedAuth').default;
const { LazyDeskAuthProvider, useDeskAuth } = req('../components/auth/AuthProvider') as typeof import('../components/auth/AuthProvider');

let published: ReturnType<typeof useDeskAuth> | null = null;
let publishes = 0;
function Reader() {
  const current = useDeskAuth();
  /* Each changed DeskAuth object refires this effect — a publish loop
     churns it forever, so cap it and fail fast instead of spinning
     inside act. */
  useEffect(() => {
    published = current;
    if (++publishes > 80) throw new Error('auth publish loop: exceeded 80 publishes');
  }, [current]);
  return null;
}

describe('Privy-backed account publishing', () => {
  let root: Root;
  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    published = null;
    publishes = 0;
    root = createRoot(getRootElement());
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('publishes auth state once per data change — no update loop on unstable SDK identities', async () => {
    const load = async () => PrivyBackedAuth;
    await act(async () => root.render(createElement(LazyDeskAuthProvider, { enabled: true, load }, createElement(Reader))));
    await act(async () => published!.login());
    await act(async () => {});
    /* With an unstable published value React throws "Maximum update depth
       exceeded" inside act; reaching the assertions means it settled. */
    assert.equal(published!.enabled, true);
    assert.equal(published!.authenticated, true);
    assert.equal(published!.userId, 'user-1');
    assert.equal(published!.walletAddress, '0xAbC00000000000000000000000000000000000aa');
    const publishesAfterSettle = publishes;
    await act(async () => {});
    /* Identity unchanged → no further publishes should have been caused. */
    assert.equal(publishes, publishesAfterSettle);
  });
});
