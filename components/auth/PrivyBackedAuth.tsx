'use client';

import { useMemo } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { DeskAuthContext, type DeskAuth } from './AuthProvider';

/** Loaded via next/dynamic — the Privy SDK stays out of the anonymous bundle. */
function Inner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const value = useMemo<DeskAuth>(() => ({
    enabled: true,
    ready,
    authenticated,
    userId: user?.id ?? null,
    label: user?.email?.address ?? user?.wallet?.address ?? user?.id ?? null,
    login: () => login(),
    logout: () => { void logout(); },
    getAccessToken: () => getAccessToken(),
  }), [ready, authenticated, user, login, logout, getAccessToken]);
  return <DeskAuthContext.Provider value={value}>{children}</DeskAuthContext.Provider>;
}

export default function PrivyBackedAuth({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'dark', accentColor: '#c9a961' },
      }}
    >
      <Inner>{children}</Inner>
    </PrivyProvider>
  );
}
