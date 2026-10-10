'use client';

import { useEffect, useMemo, useRef } from 'react';
import { PrivyProvider, usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { BASE_CHAIN_ID } from '@/lib/base-chain';
import type { AccountBridgeProps, DeskAuth } from './AuthProvider';

/** Loaded on account activation; publishes identity without remounting the paper app. */
function Inner({ onChange, request }: AccountBridgeProps) {
  const { ready, authenticated, user, login, logout, getAccessToken, linkWallet } = usePrivy();
  const { sendTransaction: privySend } = useSendTransaction();
  const { wallets } = useWallets();

  /* Privy's hook returns are not guaranteed to keep identity between
     renders. The published DeskAuth may depend only on *data*: capturing
     the SDK functions themselves would rebuild `value` every render, and
     the onChange → setAccount → re-render cycle never settles (#185). */
  const latest = useRef({ login, logout, getAccessToken, linkWallet, privySend, wallets });
  useEffect(() => {
    latest.current = { login, logout, getAccessToken, linkWallet, privySend, wallets };
  });

  const wallet = user?.wallet?.address
    ?? (user?.linkedAccounts?.find(a => (a as { type?: string }).type === 'wallet') as { address?: string } | undefined)?.address
    ?? null;
  const address = wallet ?? undefined;
  const activeWallet = wallets.find(w => w.address?.toLowerCase() === address?.toLowerCase()) ?? null;
  const walletChainId = activeWallet?.chainId?.startsWith('eip155:')
    ? Number(activeWallet.chainId.slice('eip155:'.length))
    : null;
  /* Primitives only — `user` itself may not keep identity either. */
  const userId = user?.id ?? null;
  const userEmail = user?.email?.address ?? null;

  const value = useMemo<DeskAuth>(() => {
    /* The desk trades on Base only. Privy refuses to send when the wallet's
       active chain differs from the request's chainId, so switch first —
       never fail with the wallet's raw chainId error. The current wallets
       are read through the ref so these closures never go stale. */
    const walletNow = () =>
      latest.current.wallets.find(w => w.address?.toLowerCase() === address?.toLowerCase()) ?? null;
    const chainOf = (w: { chainId?: string } | null) =>
      w?.chainId?.startsWith('eip155:') ? Number(w.chainId.slice('eip155:'.length)) : null;
    const ensureBaseChain = async () => {
      const active = walletNow();
      if (!active) return false;
      if (chainOf(active) === BASE_CHAIN_ID) return true;
      try {
        await active.switchChain(BASE_CHAIN_ID);
        return true;
      } catch {
        return false;
      }
    };
    return {
      enabled: true,
      ready,
      authenticated,
      userId,
      label: userEmail ?? wallet ?? userId,
      walletAddress: wallet,
      walletChainId,
      ensureBaseChain,
      linkWallet: () => latest.current.linkWallet(),
      login: () => latest.current.login(),
      logout: () => { void latest.current.logout(); },
      getAccessToken: () => latest.current.getAccessToken(),
      sendTransaction: async (tx) => {
        const active = walletNow();
        const chain = chainOf(active);
        if (active && chain !== null && chain !== tx.chainId) {
          try {
            await active.switchChain(tx.chainId);
          } catch {
            throw new Error('The wallet is not on Base. Switch networks in your wallet and try again.');
          }
        }
        const result = await latest.current.privySend(
          { ...tx, value: tx.value ? Number(tx.value) : undefined, chainId: tx.chainId },
          { address },
        );
        return result.hash;
      },
    };
  }, [ready, authenticated, userId, userEmail, wallet, walletChainId, address]);
  useEffect(() => { onChange(value); }, [onChange, value]);
  const handled = useRef(0);
  useEffect(() => {
    if (!ready || !request || handled.current === request.id) return;
    handled.current = request.id;
    if (request.action === 'login') latest.current.login();
    else latest.current.linkWallet();
  }, [ready, request]);
  return null;
}

export default function PrivyBackedAuth(props: AccountBridgeProps) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'dark', accentColor: '#c9a961' },
      }}
    >
      <Inner {...props} />
    </PrivyProvider>
  );
}
