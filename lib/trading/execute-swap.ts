import { createPublicClient, http, formatUnits, formatEther, parseAbi, type PublicClient, type TransactionReceipt } from 'viem';
import { base } from 'viem/chains';
import { buildAerodromeSwapTx, buildErc20ApproveTx } from './aerodrome-router';
import { AERODROME_SWAP_ROUTER, BASE_RPC_URL, BASE_USDC, BASE_USDC_DECIMALS } from '../base-chain';
import type { QuoteEstimate } from './domain';

export type SendTransaction = (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint; chainId: number }) => Promise<`0x${string}`>;

export type LiveExecutionDeps = {
  walletAddress: `0x${string}`;
  sendTransaction: SendTransaction;
  publicClient: PublicClient;
};

export type LiveOutcome = {
  status: 'submitted' | 'pending' | 'filled' | 'failed' | 'unknown';
  hash: `0x${string}`;
  message: string;
  /** Machine-readable failure reason (distinct wallet/network/RPC causes). */
  reason?: 'disconnected' | 'wrong_network' | 'insufficient_funds' | 'rejected' | 'gas_unavailable' | 'rpc_failed' | 'submit_failed';
  gasUsedWei?: string;
  effectiveGasPriceWei?: string;
  feeEth?: string;
  amountInObserved?: string;
  amountOutObserved?: string;
  blockNumber?: number;
};

const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const);

export function createBasePublicClient(rpcUrl = BASE_RPC_URL): PublicClient {
  return createPublicClient({ chain: base, transport: http(rpcUrl) }) as PublicClient;
}

export async function readTokenAllowance(
  publicClient: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  }) as Promise<bigint>;
}

export async function readTokenBalance(
  publicClient: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  }) as Promise<bigint>;
}

function inputTokenFor(quote: QuoteEstimate): `0x${string}` {
  return (quote.intent.side === 'buy' ? BASE_USDC : quote.instrumentAddress) as `0x${string}`;
}

function inputAmountFor(quote: QuoteEstimate): bigint {
  return BigInt(quote.amountInRaw);
}

/** Build and send an ERC-20 approve for the router to spend the input token. */
export async function sendApproveForQuote(
  deps: Pick<LiveExecutionDeps, 'sendTransaction'>,
  quote: QuoteEstimate,
): Promise<`0x${string}`> {
  const token = inputTokenFor(quote);
  const amount = inputAmountFor(quote);
  const tx = buildErc20ApproveTx(token, AERODROME_SWAP_ROUTER, amount);
  return deps.sendTransaction({ ...tx, value: 0n, chainId: base.id });
}

/** Approve the router and wait for confirmation. Throws on revert or timeout —
 *  the caller reports the failure, never assumes the allowance. */
export async function approveInputForQuote(
  deps: Pick<LiveExecutionDeps, 'sendTransaction' | 'publicClient'>,
  quote: QuoteEstimate,
): Promise<`0x${string}`> {
  const hash = await sendApproveForQuote(deps, quote);
  const receipt = await deps.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error('The approval reverted on Base.');
  return hash;
}

/** Build and send only the swap — approval must already be in place. */
export async function swapForQuote(
  deps: LiveExecutionDeps,
  quote: QuoteEstimate,
  slippageBps: number,
  deadlineSeconds = 120,
): Promise<`0x${string}`> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  const swap = buildAerodromeSwapTx(quote, slippageBps, deps.walletAddress, deadline);
  return deps.sendTransaction({ to: swap.to, data: swap.data, value: swap.value, chainId: base.id });
}

/** Estimate the swap's network cost. Null when the estimate cannot be read
 *  (e.g. allowance not yet in place) — the desk shows honest fallback copy
 *  rather than a fabricated figure. */
export async function estimateSwapGas(
  publicClient: PublicClient,
  quote: QuoteEstimate,
  walletAddress: `0x${string}`,
): Promise<{ gas: bigint; gasPrice: bigint } | null> {
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
    const swap = buildAerodromeSwapTx(quote, 50, walletAddress, deadline);
    const [gas, gasPrice] = await Promise.all([
      publicClient.estimateGas({ account: walletAddress, to: swap.to, data: swap.data, value: swap.value }),
      publicClient.getGasPrice(),
    ]);
    return { gas, gasPrice };
  } catch {
    return null;
  }
}

/** Execute a live Aerodrome swap for the given quote. */
export async function executeAerodromeSwap(
  deps: LiveExecutionDeps,
  quote: QuoteEstimate,
  slippageBps: number,
  deadlineSeconds = 120,
): Promise<LiveOutcome> {
  const { walletAddress, sendTransaction, publicClient } = deps;
  const token = inputTokenFor(quote);
  const amount = inputAmountFor(quote);

  const [allowance, balance] = await Promise.all([
    readTokenAllowance(publicClient, token, walletAddress, AERODROME_SWAP_ROUTER),
    readTokenBalance(publicClient, token, walletAddress),
  ]);

  if (balance < amount) {
    return { status: 'failed', hash: '0x', message: `Insufficient ${quote.inputSymbol} balance.` };
  }

  if (allowance < amount) {
    try {
      await approveInputForQuote({ sendTransaction, publicClient }, quote);
    } catch (e) {
      return { status: 'failed', hash: '0x', message: `Approval failed: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  }

  const hash = await swapForQuote(deps, quote, slippageBps, deadlineSeconds);
  return { status: 'submitted', hash, message: 'Swap submitted. Reconciliation pending.' };
}

function inputDecimals(quote: QuoteEstimate): number {
  return quote.intent.side === 'buy' ? BASE_USDC_DECIMALS : quote.tokenDecimals;
}

function outputDecimals(quote: QuoteEstimate): number {
  return quote.intent.side === 'buy' ? quote.tokenDecimals : BASE_USDC_DECIMALS;
}

function outputTokenFor(quote: QuoteEstimate): `0x${string}` {
  return (quote.intent.side === 'buy' ? quote.instrumentAddress : BASE_USDC) as `0x${string}`;
}

/** Build an honest outcome from a receipt. Reviewed quote amounts stay separate —
 *  observed Transfer sums are fill evidence when present. */
export function outcomeFromReceipt(
  receipt: Pick<TransactionReceipt, 'status' | 'gasUsed' | 'effectiveGasPrice' | 'blockNumber' | 'logs'>,
  hash: `0x${string}`,
  quote?: QuoteEstimate,
  walletAddress?: `0x${string}`,
): LiveOutcome {
  const gasUsedWei = receipt.gasUsed?.toString();
  const effectiveGasPriceWei = receipt.effectiveGasPrice?.toString();
  const feeEth = receipt.gasUsed != null && receipt.effectiveGasPrice != null
    ? formatEther(receipt.gasUsed * receipt.effectiveGasPrice)
    : undefined;
  const blockNumber = typeof receipt.blockNumber === 'bigint'
    ? Number(receipt.blockNumber)
    : receipt.blockNumber;

  let amountInObserved: string | undefined;
  let amountOutObserved: string | undefined;
  if (quote && walletAddress && receipt.logs) {
    try {
      const input = inputTokenFor(quote).toLowerCase();
      const output = outputTokenFor(quote).toLowerCase();
      const wallet = walletAddress.toLowerCase();
      let inRaw = 0n;
      let outRaw = 0n;
      for (const log of receipt.logs) {
        if (!log.topics || log.topics.length < 3) continue;
        const address = (log.address as string).toLowerCase();
        /* Transfer(from, to, value) — topics[1]=from, topics[2]=to */
        const from = `0x${(log.topics[1] as string).slice(26)}`.toLowerCase();
        const to = `0x${(log.topics[2] as string).slice(26)}`.toLowerCase();
        const value = BigInt(log.data);
        if (address === input && from === wallet) inRaw += value;
        if (address === output && to === wallet) outRaw += value;
      }
      if (inRaw > 0n) amountInObserved = formatUnits(inRaw, inputDecimals(quote));
      if (outRaw > 0n) amountOutObserved = formatUnits(outRaw, outputDecimals(quote));
    } catch { /* observed amounts are best-effort */ }
  }

  const enrichment = {
    gasUsedWei,
    effectiveGasPriceWei,
    feeEth,
    amountInObserved,
    amountOutObserved,
    blockNumber,
  };

  if (receipt.status === 'success') {
    return {
      status: 'filled',
      hash,
      message: amountOutObserved
        ? `Swap filled on Base. Observed receipt ≈ ${amountOutObserved} ${quote?.outputSymbol ?? 'tokens'}${feeEth ? `; network fee ≈ ${feeEth} ETH` : ''}.`
        : `Swap filled on Base.${feeEth ? ` Network fee ≈ ${feeEth} ETH.` : ''}`,
      ...enrichment,
    };
  }
  return {
    status: 'failed',
    hash,
    message: 'Swap reverted on Base.',
    ...enrichment,
  };
}

/** Wait for the swap receipt and return the honest live outcome. */
export async function waitForLiveOutcome(
  publicClient: PublicClient,
  hash: `0x${string}`,
  quote?: QuoteEstimate,
  walletAddress?: `0x${string}`,
): Promise<LiveOutcome> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return outcomeFromReceipt(receipt, hash, quote, walletAddress);
  } catch (e) {
    return { status: 'unknown', hash, message: `Could not confirm: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/** Re-read a known hash after reload — never resubmits. */
export async function reconcileLiveHash(
  publicClient: PublicClient,
  hash: `0x${string}`,
  quote?: QuoteEstimate,
  walletAddress?: `0x${string}`,
): Promise<LiveOutcome> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    if (receipt) return outcomeFromReceipt(receipt, hash, quote, walletAddress as `0x${string}` | undefined);
  } catch { /* not mined yet — fall through to a bounded wait */ }
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 });
    return outcomeFromReceipt(receipt, hash, quote, walletAddress);
  } catch (e) {
    return {
      status: 'unknown',
      hash,
      message: `Still unconfirmed on Base: ${e instanceof Error ? e.message : 'unknown'}. The hash is retained — nothing was resubmitted.`,
    };
  }
}

/** Format a raw balance for display using the quote's input/output decimals. */
export function formatBalance(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}
