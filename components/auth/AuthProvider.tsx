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

export interface DeskAuth {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  label: string | null;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
}

const ANON: DeskAuth = {
  enabled: false, ready: true, authenticated: false, userId: null, label: null,
  login: () => {}, logout: () => {}, getAccessToken: async () => null,
};

export const DeskAuthContext = createContext<DeskAuth>(ANON);

const PrivyBackedAuth = dynamic(() => import('./PrivyBackedAuth'), { ssr: false });

export function DeskAuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID);
  if (!enabled) {
    return <DeskAuthContext.Provider value={ANON}>{children}</DeskAuthContext.Provider>;
  }
  return <PrivyBackedAuth>{children}</PrivyBackedAuth>;
}

export function useDeskAuth(): DeskAuth {
  return useContext(DeskAuthContext);
}
