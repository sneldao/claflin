'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { createBasePublicClient, executeAerodromeSwap, readTokenAllowance, readTokenBalance, waitForLiveOutcome, type LiveOutcome } from './execute-swap';
import { AERODROME_SWAP_ROUTER, BASE_USDC } from '../base-chain';
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

  const inputToken = useMemo(() => (quote?.intent.side === 'buy' ? BASE_USDC as `0x${string}` : (quote?.instrumentAddress as `0x${string}` | undefined)), [quote]);
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
    try {
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
    } catch (e) {
      /* Rejected signatures, expired estimates, reverted approvals and RPC
         drops all land here — the desk reports failure honestly instead of
         hanging in a pending stage. */
      const raw = e instanceof Error ? e.message : 'unknown';
      const rejected = /reject|denied|cancelled|user denied/i.test(raw);
      const outcome: LiveOutcome = {
        status: 'failed',
        hash: '0x',
        message: rejected
          ? 'The wallet request was declined. Nothing was submitted.'
          : raw.length > 140
            ? 'The swap could not be submitted. Refresh the estimate and try again.'
            : `The swap could not be submitted: ${raw}`,
      };
      setState({ stage: 'done', outcome });
      return outcome;
    }
  }, [quote, auth.walletAddress, auth.sendTransaction, inputToken, publicClient]);

  return { state, execute, needsApproval: state.stage === 'ready' && state.allowance < inputAmount };
}
