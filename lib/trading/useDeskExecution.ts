'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { createBasePublicClient, executeAerodromeSwap, readTokenAllowance, readTokenBalance, waitForLiveOutcome, type LiveOutcome } from './execute-swap';
import { AERODROME_SWAP_ROUTER } from '../base-chain';
import type { QuoteEstimate } from './domain';

export type DeskExecutionState =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'ready'; allowance: bigint; balance: bigint }
  | { stage: 'approving' }
  | { stage: 'swapping' }
  | { stage: 'confirming'; hash: `0x${string}` }
  | { stage: 'done'; outcome: LiveOutcome };

export function useDeskExecution(quote: QuoteEstimate | null) {
  const auth = useDeskAuth();
  const publicClient = useMemo(() => createBasePublicClient(), []);
  const [state, setState] = useState<DeskExecutionState>({ stage: 'idle' });

  const inputToken = useMemo(() => (quote?.intent.side === 'buy' ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` : (quote?.instrumentAddress as `0x${string}` | undefined)), [quote]);
  const inputAmount = quote ? BigInt(quote.amountInRaw) : 0n;

  useEffect(() => {
    if (!quote || !auth.walletAddress || !inputToken) { setState({ stage: 'idle' }); return; }
    const wallet = auth.walletAddress as `0x${string}`;
    let cancelled = false;
    setState({ stage: 'checking' });
    Promise.all([
      readTokenAllowance(publicClient, inputToken, wallet, AERODROME_SWAP_ROUTER),
      readTokenBalance(publicClient, inputToken, wallet),
    ]).then(([allowance, balance]) => {
      if (!cancelled) setState({ stage: 'ready', allowance, balance });
    }).catch(() => { if (!cancelled) setState({ stage: 'idle' }); });
    return () => { cancelled = true; };
  }, [quote, auth.walletAddress, inputToken, publicClient]);

  const execute = useCallback(async (slippageBps: number, deadlineSeconds = 120): Promise<LiveOutcome> => {
    if (!quote || !auth.walletAddress || !auth.authenticated || !inputToken) {
      return { status: 'failed', hash: '0x', message: 'Wallet not connected.' };
    }
    setState({ stage: 'swapping' });
    const wallet = auth.walletAddress as `0x${string}`;
    const initial = await executeAerodromeSwap(
      { walletAddress: wallet, sendTransaction: (tx) => auth.sendTransaction(tx), publicClient },
      quote,
      slippageBps,
      deadlineSeconds,
    );
    if (initial.status === 'failed') {
      setState({ stage: 'done', outcome: initial });
      return initial;
    }
    setState({ stage: 'confirming', hash: initial.hash });
    const outcome = await waitForLiveOutcome(publicClient, initial.hash);
    setState({ stage: 'done', outcome });
    return outcome;
  }, [quote, auth.walletAddress, auth.sendTransaction, inputToken, publicClient]);

  return { state, execute, needsApproval: state.stage === 'ready' && state.allowance < inputAmount };
}
