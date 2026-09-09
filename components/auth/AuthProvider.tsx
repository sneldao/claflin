'use client';

import { createContext, useContext } from 'react';
import dynamic from 'next/dynamic';

/**
 * Optional account tier. When NEXT_PUBLIC_PRIVY_APP_ID/CLIENT_ID are set,
 * children get a Privy session (email/social, wallet link); otherwise the
 * desk stays fully anonymous — the voice session, tape and paper records
 * work unchanged. Auth never gates the paper desk.
 *
 * The Privy SDK is loaded via next/dynamic so it never reaches the
 * anonymous bundle.
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
  linkWallet: () => void;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
  /** Send a pre-built transaction through the connected wallet. Returns the tx hash. Throws if no wallet. */
  sendTransaction: (tx: SendTransactionRequest) => Promise<`0x${string}`>;
}

const ANON: DeskAuth = {
  enabled: false, ready: true, authenticated: false, userId: null, label: null,
  walletAddress: null, linkWallet: () => {},
  login: () => {}, logout: () => {}, getAccessToken: async () => null,
  sendTransaction: async () => { throw new Error('Wallet not connected.'); },
};

export const DeskAuthContext = createContext<DeskAuth>(ANON);

const PrivyBackedAuth = dynamic(() => import('./PrivyBackedAuth'), { ssr: false });

export function DeskAuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  if (!enabled) {
    return <DeskAuthContext.Provider value={ANON}>{children}</DeskAuthContext.Provider>;
  }
  return <PrivyBackedAuth>{children}</PrivyBackedAuth>;
}

export function useDeskAuth(): DeskAuth {
  return useContext(DeskAuthContext);
}
