import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem';
import { AERODROME_SWAP_ROUTER, BASE_CHAIN_ID, BASE_USDC } from '../base-chain';
import { getInstrumentAndPairByPoolAddress } from './catalog';
import type { QuoteEstimate } from './domain';

/**
 * Aerodrome SlipStream Swap Router call builder.
 *
 * These are pure, stateless, client-side helpers. They do not sign,
 * broadcast, or hold keys. They only construct the calldata that a
 * connected wallet must approve and sign.
 */

const swapRouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
]);

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]);

export type SwapTx = {
  to: Address;
  data: Hex;
  value: bigint;
};

export type ApproveTx = {
  to: Address;
  data: Hex;
};

const UINT256_MAX = 2n ** 256n;

function toBig(value: string): bigint {
  const n = BigInt(value);
  if (n <= 0n || n >= UINT256_MAX) throw new Error('Invalid raw amount');
  return n;
}

function clampedSlippageBps(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 10000);
}

export function minimumOut(amountOut: bigint, slippageBps: number): bigint {
  const bps = clampedSlippageBps(slippageBps);
  if (bps >= 10000) return 1n;
  /* The quotient is bounded by amountOut (< 2^256), so it cannot overflow.
     Floor is deliberate: the router requires at least 1 unit. */
  return (amountOut * BigInt(10000 - bps)) / 10000n || 1n;
}

/**
 * Bind a quote to the verified catalog: the pool must belong to a known
 * instrument, the quote's instrument must own that pool, and the pool must
 * be USDC-quoted on Base. A quote assembled from mismatched parts (e.g.
 * instrument A with instrument B's pool) is refused, not encoded.
 */
function bindQuoteToCatalog(quote: QuoteEstimate, tickSpacingOverride?: number): number {
  if (quote.chainId !== BASE_CHAIN_ID || quote.venue !== 'aerodrome') {
    throw new Error('Quote is not a verified Base Aerodrome estimate');
  }
  const match = getInstrumentAndPairByPoolAddress(quote.poolAddress);
  if (!match) throw new Error('Pool not in the verified catalog; tickSpacing required');
  if (match.instrument.contractAddress.toLowerCase() !== quote.instrumentAddress.toLowerCase()) {
    throw new Error('Quote instrument does not match the catalog pool');
  }
  if (match.pair.quoteToken.toLowerCase() !== BASE_USDC.toLowerCase()) {
    throw new Error('Catalog pool is not USDC-quoted');
  }
  return tickSpacingOverride ?? match.pair.tickSpacing;
}

/**
 * Build an `exactInputSingle` swap call to the Aerodrome SlipStream router.
 *
 * @param quote         A verified Base desk estimate; must be unexpired at build time.
 * @param slippageBps   Slippage tolerance in basis points (e.g. 50 for 0.5%).
 * @param recipient     Address that receives the output tokens.
 * @param deadline      Unix timestamp (seconds) after which the transaction reverts.
 *                      May exceed the quote's expiry: it bounds a pending transaction,
 *                      while `amountOutMinimum` bounds the price.
 * @param tickSpacing   Optional pool tick spacing; inferred from catalog if omitted.
 * @param now           Clock for expiry checks (ms); injectable for tests.
 */
export function buildAerodromeSwapTx(
  quote: QuoteEstimate,
  slippageBps: number,
  recipient: Address,
  deadline: bigint,
  tickSpacing?: number,
  now: number = Date.now(),
): SwapTx {
  if (!Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now) {
    throw new Error('Quote expired; request a fresh estimate');
  }
  if (deadline <= 0n || deadline * 1000n <= BigInt(now)) {
    throw new Error('Deadline must be a future Unix timestamp in seconds');
  }
  const amountIn = toBig(quote.amountInRaw);
  const amountOut = toBig(quote.amountOutRaw);
  const tokenIn = (quote.intent.side === 'buy' ? BASE_USDC : quote.instrumentAddress) as Address;
  const tokenOut = (quote.intent.side === 'buy' ? quote.instrumentAddress : BASE_USDC) as Address;

  const data = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn,
      tokenOut,
      tickSpacing: bindQuoteToCatalog(quote, tickSpacing),
      recipient,
      deadline,
      amountIn,
      amountOutMinimum: minimumOut(amountOut, slippageBps),
      sqrtPriceLimitX96: 0n,
    }],
  });

  return { to: AERODROME_SWAP_ROUTER, data, value: 0n };
}

/** Build an ERC-20 `approve` call so the router can spend the input token. */
export function buildErc20ApproveTx(token: Address, spender: Address, amount: bigint): ApproveTx {
  /* An out-of-range amount must never become a transaction: negative values
     would otherwise wrap into a near-unlimited approval. */
  if (amount <= 0n || amount >= UINT256_MAX) throw new Error('Invalid approval amount');
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });
  return { to: token, data };
}

export { erc20Abi };
