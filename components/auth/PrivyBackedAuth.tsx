'use client';

import { useMemo } from 'react';
import { PrivyProvider, usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { BASE_CHAIN_ID } from '@/lib/base-chain';
import { DeskAuthContext, type DeskAuth } from './AuthProvider';

/** Loaded via next/dynamic — the Privy SDK stays out of the anonymous bundle. */
function Inner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken, linkWallet } = usePrivy();
  const { sendTransaction: privySend } = useSendTransaction();
  const { wallets } = useWallets();
  const value = useMemo<DeskAuth>(() => {
    const wallet = user?.wallet?.address
      ?? (user?.linkedAccounts?.find(a => (a as { type?: string }).type === 'wallet') as { address?: string } | undefined)?.address
      ?? null;
    const address = wallet ?? undefined;
    const activeWallet = wallets.find(w => w.address?.toLowerCase() === address?.toLowerCase()) ?? null;
    const walletChainId = activeWallet?.chainId?.startsWith('eip155:')
      ? Number(activeWallet.chainId.slice('eip155:'.length))
      : null;
    /* The desk trades on Base only. Privy refuses to send when the wallet's
       active chain differs from the request's chainId, so switch first —
       never fail with the wallet's raw chainId error. */
    const ensureBaseChain = async () => {
      if (!activeWallet) return false;
      if (walletChainId === BASE_CHAIN_ID) return true;
      try {
        await activeWallet.switchChain(BASE_CHAIN_ID);
        return true;
      } catch {
        return false;
      }
    };
    return {
      enabled: true,
      ready,
      authenticated,
      userId: user?.id ?? null,
      label: user?.email?.address ?? wallet ?? user?.id ?? null,
      walletAddress: wallet,
      walletChainId,
      ensureBaseChain,
      linkWallet: () => linkWallet(),
      login: () => login(),
      logout: () => { void logout(); },
      getAccessToken: () => getAccessToken(),
      sendTransaction: async (tx) => {
        if (activeWallet && walletChainId !== null && walletChainId !== tx.chainId) {
          try {
            await activeWallet.switchChain(tx.chainId);
          } catch {
            throw new Error('The wallet is not on Base. Switch networks in your wallet and try again.');
          }
        }
        const result = await privySend({ ...tx, value: tx.value ? Number(tx.value) : undefined, chainId: tx.chainId }, { address });
        return result.hash;
      },
    };
  }, [ready, authenticated, user, login, logout, getAccessToken, linkWallet, privySend, wallets]);
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
