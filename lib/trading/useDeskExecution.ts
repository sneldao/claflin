'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { approveInputForQuote, createBasePublicClient, estimateSwapGas, readTokenAllowance, readTokenBalance, swapForQuote, waitForLiveOutcome, type LiveOutcome } from './execute-swap';
import { AERODROME_SWAP_ROUTER, BASE_USDC } from '../base-chain';
import type { QuoteEstimate } from './domain';

export type DeskExecutionState =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'ready'; allowance: bigint; balance: bigint; gasCostWei: bigint | null }
  | { stage: 'approving' }
  | { stage: 'swapping' }
  | { stage: 'confirming'; hash: `0x${string}` }
  | { stage: 'done'; outcome: LiveOutcome };

/** Rejected signatures, expired estimates, reverted approvals and RPC drops
 *  all become honest failure copy — the desk never hangs in a pending stage. */
function failureOutcome(e: unknown): LiveOutcome {
  const raw = e instanceof Error ? e.message : 'unknown';
  const rejected = /reject|denied|cancelled|user denied/i.test(raw);
  return {
    status: 'failed',
    hash: '0x',
    message: rejected
      ? 'The wallet request was declined. Nothing was submitted.'
      : raw.length > 140
        ? 'The transaction could not be submitted. Refresh the estimate and try again.'
        : `The transaction could not be submitted: ${raw}`,
  };
}

export function useDeskExecution(quote: QuoteEstimate | null) {
  const auth = useDeskAuth();
  const publicClient = useMemo(() => createBasePublicClient(), []);
  const [state, setState] = useState<DeskExecutionState>({ stage: 'idle' });

  const inputToken = useMemo(() => (quote?.intent.side === 'buy' ? BASE_USDC as `0x${string}` : (quote?.instrumentAddress as `0x${string}` | undefined)), [quote]);
  const inputAmount = quote ? BigInt(quote.amountInRaw) : 0n;
  const genRef = useRef(0);

  /* Read allowance, balance and — once approval is in place — the gas
     estimate. Re-runs for every fresh quote, so a re-quoted estimate always
     shows current wallet facts. */
  const refresh = useCallback(async () => {
    if (!quote || !auth.walletAddress || !inputToken) { setState({ stage: 'idle' }); return; }
    const gen = ++genRef.current;
    const wallet = auth.walletAddress as `0x${string}`;
    setState({ stage: 'checking' });
    try {
      const [allowance, balance] = await Promise.all([
        readTokenAllowance(publicClient, inputToken, wallet, AERODROME_SWAP_ROUTER),
        readTokenBalance(publicClient, inputToken, wallet),
      ]);
      const gas = allowance >= inputAmount ? await estimateSwapGas(publicClient, quote, wallet) : null;
      if (genRef.current !== gen) return;
      setState({ stage: 'ready', allowance, balance, gasCostWei: gas ? gas.gas * gas.gasPrice : null });
    } catch {
      if (genRef.current === gen) setState({ stage: 'idle' });
    }
  }, [quote, auth.walletAddress, inputToken, inputAmount, publicClient]);

  useEffect(() => {
    void refresh();
    return () => { genRef.current += 1; };
  }, [refresh]);

  /** Step 1 of 2: approve the router to spend the input token, then re-read
   *  the wallet so the execute step lights up with a gas estimate. */
  const approve = useCallback(async (): Promise<boolean> => {
    if (!quote || !auth.walletAddress || !auth.authenticated || !inputToken) return false;
    setState({ stage: 'approving' });
    try {
      await approveInputForQuote(
        { sendTransaction: (tx) => auth.sendTransaction(tx), publicClient },
        quote,
      );
      await refresh();
      return true;
    } catch (e) {
      setState({ stage: 'done', outcome: failureOutcome(e) });
      return false;
    }
  }, [quote, auth.walletAddress, auth.authenticated, auth.sendTransaction, inputToken, publicClient, refresh]);

  /** Step 2 of 2: sign and broadcast the swap, then wait for the receipt. */
  const execute = useCallback(async (slippageBps: number, deadlineSeconds = 120): Promise<LiveOutcome> => {
    if (!quote || !auth.walletAddress || !auth.authenticated || !inputToken) {
      return { status: 'failed', hash: '0x', message: 'Wallet not connected.' };
    }
    const wallet = auth.walletAddress as `0x${string}`;
    setState({ stage: 'swapping' });
    try {
      const hash = await swapForQuote(
        { walletAddress: wallet, sendTransaction: (tx) => auth.sendTransaction(tx), publicClient },
        quote,
        slippageBps,
        deadlineSeconds,
      );
      setState({ stage: 'confirming', hash });
      const outcome = await waitForLiveOutcome(publicClient, hash);
      setState({ stage: 'done', outcome });
      return outcome;
    } catch (e) {
      const outcome = failureOutcome(e);
      setState({ stage: 'done', outcome });
      return outcome;
    }
  }, [quote, auth.walletAddress, auth.authenticated, auth.sendTransaction, inputToken, publicClient]);

  /** Clear a finished or failed outcome and re-read the wallet. */
  const reset = useCallback(() => { void refresh(); }, [refresh]);

  return {
    state,
    approve,
    execute,
    reset,
    needsApproval: state.stage === 'ready' && state.allowance < inputAmount,
    insufficientBalance: state.stage === 'ready' && state.balance < inputAmount,
  };
}
