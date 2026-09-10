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

export type DeskExecutionFailure =
  | 'disconnected'
  | 'wrong_network'
  | 'insufficient_funds'
  | 'rejected'
  | 'gas_unavailable'
  | 'rpc_failed'
  | 'submit_failed';

/** Rejected signatures, expired estimates, reverted approvals and RPC drops
 *  all become honest failure copy — the desk never hangs in a pending stage.
 *  Each reason stays distinct so the slip can name the fix (reconnect, switch
 *  to Base, fund the wallet, retry the estimate) instead of one generic miss. */
export function classifyExecutionError(e: unknown): DeskExecutionFailure {
  const raw = e instanceof Error ? e.message : 'unknown';
  if (/wallet not connected|no wallet|not connected|account/i.test(raw)) return 'disconnected';
  if (/chainid|wrong network|not on base/i.test(raw)) return 'wrong_network';
  if (/insufficient|balance/i.test(raw)) return 'insufficient_funds';
  if (/reject|denied|cancelled|user denied/i.test(raw)) return 'rejected';
  if (/gas/i.test(raw)) return 'gas_unavailable';
  if (/rpc|network|timeout|fetch|limit|rate/i.test(raw)) return 'rpc_failed';
  return 'submit_failed';
}

const FAILURE_COPY: Record<DeskExecutionFailure, string> = {
  disconnected: 'The wallet is not connected. Reconnect it and try again — nothing was submitted.',
  wrong_network: 'The wallet is not on Base. Switch networks in the wallet and try again.',
  insufficient_funds: 'The wallet does not hold enough to cover this instruction plus gas. Nothing was submitted.',
  rejected: 'The wallet request was declined. Nothing was submitted.',
  gas_unavailable: 'The network cost could not be estimated. Refresh the estimate and try again.',
  rpc_failed: 'The Base connection dropped before anything was submitted. Refresh the estimate and try again.',
  submit_failed: 'The transaction could not be submitted. Refresh the estimate and try again.',
};

function failureOutcome(e: unknown): LiveOutcome {
  const reason = classifyExecutionError(e);
  return {
    status: 'failed',
    hash: '0x',
    message: FAILURE_COPY[reason],
    reason,
  };
}

export function useDeskExecution(quote: QuoteEstimate | null) {
  const auth = useDeskAuth();
  const publicClient = useMemo(() => createBasePublicClient(), []);
  const [state, setState] = useState<DeskExecutionState>({ stage: 'idle' });

  const inputToken = useMemo(() => (quote?.intent.side === 'buy' ? BASE_USDC as `0x${string}` : (quote?.instrumentAddress as `0x${string}` | undefined)), [quote]);
  const inputAmount = quote ? BigInt(quote.amountInRaw) : 0n;
  const genRef = useRef(0);
  const inflightRef = useRef<Promise<LiveOutcome> | null>(null);
  const inflightKeyRef = useRef<string | null>(null);

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

  /** Step 2 of 2: sign and broadcast the swap, then wait for the receipt.
   *  The quote and the reviewed wallet are captured up front: an account
   *  change or a duplicate click cannot silently reuse the authorization. */
  const execute = useCallback(async (slippageBps: number, deadlineSeconds = 120): Promise<LiveOutcome> => {
    const boundQuote = quote;
    const boundWallet = auth.walletAddress;
    const boundAuthenticated = auth.authenticated;
    const boundToken = inputToken;
    const boundSend = auth.sendTransaction;
    if (!boundQuote || !boundWallet || !boundAuthenticated || !boundToken) {
      return { status: 'failed', hash: '0x', message: FAILURE_COPY.disconnected, reason: 'disconnected' };
    }
    const wallet = boundWallet as `0x${string}`;
    const expectedWallet = wallet.toLowerCase();
    const executionKey = `${boundQuote.id}:${expectedWallet}:${boundQuote.amountInRaw}:${slippageBps}`;
    if (inflightRef.current) return inflightRef.current;
    setState({ stage: 'swapping' });
    const run = (async (): Promise<LiveOutcome> => {
      try {
        if ((boundWallet as string).toLowerCase() !== expectedWallet) {
          throw new Error('Wallet account changed during execution.');
        }
        const hash = await swapForQuote(
          { walletAddress: wallet, sendTransaction: (tx) => boundSend(tx), publicClient },
          boundQuote,
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
      } finally {
        if (inflightRef.current && inflightKeyRef.current === executionKey) {
          inflightRef.current = null;
          inflightKeyRef.current = null;
        }
      }
    })();
    inflightRef.current = run;
    inflightKeyRef.current = executionKey;
    return run;
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
