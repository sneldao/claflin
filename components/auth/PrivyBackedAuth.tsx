'use client';

import { useMemo } from 'react';
import { PrivyProvider, usePrivy, useSendTransaction } from '@privy-io/react-auth';
import { DeskAuthContext, type DeskAuth } from './AuthProvider';

/** Loaded via next/dynamic — the Privy SDK stays out of the anonymous bundle. */
function Inner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken, linkWallet } = usePrivy();
  const { sendTransaction: privySend } = useSendTransaction();
  const value = useMemo<DeskAuth>(() => {
    const wallet = user?.wallet?.address
      ?? (user?.linkedAccounts?.find(a => (a as { type?: string }).type === 'wallet') as { address?: string } | undefined)?.address
      ?? null;
    const address = wallet ?? undefined;
    return {
      enabled: true,
      ready,
      authenticated,
      userId: user?.id ?? null,
      label: user?.email?.address ?? wallet ?? user?.id ?? null,
      walletAddress: wallet,
      linkWallet: () => linkWallet(),
      login: () => login(),
      logout: () => { void logout(); },
      getAccessToken: () => getAccessToken(),
      sendTransaction: async (tx) => {
        const result = await privySend({ ...tx, value: tx.value ? Number(tx.value) : undefined, chainId: tx.chainId }, { address });
        return result.hash;
      },
    };
  }, [ready, authenticated, user, login, logout, getAccessToken, linkWallet, privySend]);
  return <DeskAuthContext.Provider value={value}>{children}</DeskAuthContext.Provider>;
}

export default function PrivyBackedAuth({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'dark', accentColor: '#c9a961' },
      }}
    >
      <Inner>{children}</Inner>
    </PrivyProvider>
  );
}
