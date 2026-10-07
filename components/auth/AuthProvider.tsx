'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

/**
 * Optional account tier. When NEXT_PUBLIC_PRIVY_APP_ID/CLIENT_ID are set,
 * children get a Privy session (email/social, wallet link); otherwise the
 * desk stays fully anonymous — the voice session, tape and paper records
 * work unchanged. Auth never gates the paper desk.
 *
 * The Privy SDK loads on account activation, or when restoring a previously
 * activated account. Fresh paper-only visits do not fetch the account runtime.
 */

export type SendTransactionRequest = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
  chainId: number;
};

export interface DeskAuth {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  label: string | null;
  /** Wallet bound to the account (embedded or linked external). Null until linked. */
  walletAddress: string | null;
  /** The connected wallet's active chain (eip155 id), when known. */
  walletChainId: number | null;
  /** Ask the connected wallet to switch to Base. Resolves true once it is on Base. */
  ensureBaseChain: () => Promise<boolean>;
  linkWallet: () => void;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
  /** Send a pre-built transaction through the connected wallet. Returns the tx hash. Throws if no wallet. */
  sendTransaction: (tx: SendTransactionRequest) => Promise<`0x${string}`>;
}

const ANON: DeskAuth = {
  enabled: false, ready: true, authenticated: false, userId: null, label: null,
  walletAddress: null, walletChainId: null, ensureBaseChain: async () => false,
  linkWallet: () => {},
  login: () => {}, logout: () => {}, getAccessToken: async () => null,
  sendTransaction: async () => { throw new Error('Wallet not connected.'); },
};

export const DeskAuthContext = createContext<DeskAuth>(ANON);

export type AccountRequest = { id: number; action: 'login' | 'linkWallet' };
export type AccountBridgeProps = {
  onChange: (auth: DeskAuth) => void;
  request: AccountRequest | null;
};
type AccountBridge = ComponentType<AccountBridgeProps>;
const loadAccountBridge = () => import('./PrivyBackedAuth').then(module => module.default);
const ACCOUNT_ACTIVATED = 'claflin.account.activated';

/** Keep paper children in place while the optional account runtime starts. */
export function LazyDeskAuthProvider({ children, enabled, load = loadAccountBridge }: {
  children: ReactNode;
  enabled: boolean;
  load?: () => Promise<AccountBridge>;
}) {
  const [Bridge, setBridge] = useState<AccountBridge | null>(null);
  const [account, setAccount] = useState<DeskAuth | null>(null);
  const [request, setRequest] = useState<AccountRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sequence = useRef(0);
  const activate = useCallback(() => {
    if (!enabled || Bridge || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    void load().then(component => {
      setBridge(() => component);
    }).catch(() => {
      setError('Account sign-in could not load. Try Sign in again; the paper desk is still usable.');
    }).finally(() => {
      loadingRef.current = false;
      setLoading(false);
    });
  }, [enabled, Bridge, load]);

  useEffect(() => {
    if (!enabled) return;
    try {
      // Also restore accounts created before the action-loaded bridge existed.
      const returning = window.localStorage.getItem(ACCOUNT_ACTIVATED) === 'true'
        || Object.keys(window.localStorage).some(key => key.startsWith('privy:'));
      if (returning) activate();
    } catch { /* Storage restrictions must not prevent paper use. */ }
  }, [enabled, activate]);

  const ask = (action: AccountRequest['action']) => {
    if (!enabled || loadingRef.current) return;
    try { window.localStorage.setItem(ACCOUNT_ACTIVATED, 'true'); } catch { /* optional */ }
    setRequest({ id: ++sequence.current, action });
    activate();
  };
  const value: DeskAuth = account ?? {
    ...ANON,
    enabled,
    ready: !loading && !Bridge,
    login: () => ask('login'),
    linkWallet: () => ask('linkWallet'),
  };
  return (
    <DeskAuthContext.Provider value={value}>
      {children}
      {Bridge && <Bridge onChange={setAccount} request={request} />}
      {(loading || (Bridge && !account?.ready)) && <p role="status">Loading optional account services…</p>}
      {error && <p role="alert">{error}</p>}
    </DeskAuthContext.Provider>
  );
}

export function DeskAuthProvider({ children }: { children: ReactNode }) {
  return <LazyDeskAuthProvider enabled={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)}>{children}</LazyDeskAuthProvider>;
}

export function useDeskAuth(): DeskAuth {
  return useContext(DeskAuthContext);
}
