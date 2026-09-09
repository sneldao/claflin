import { createPublicClient, http, formatUnits, parseAbi, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { buildAerodromeSwapTx, buildErc20ApproveTx } from './aerodrome-router';
import { AERODROME_SWAP_ROUTER, BASE_RPC_URL, BASE_USDC } from '../base-chain';
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

/** Wait for the swap receipt and return the honest live outcome. */
export async function waitForLiveOutcome(
  publicClient: PublicClient,
  hash: `0x${string}`,
): Promise<LiveOutcome> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      return { status: 'filled', hash, message: 'Swap filled on Base.' };
    }
    return { status: 'failed', hash, message: 'Swap reverted on Base.' };
  } catch (e) {
    return { status: 'unknown', hash, message: `Could not confirm: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/** Format a raw balance for display using the quote's input/output decimals. */
export function formatBalance(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}
