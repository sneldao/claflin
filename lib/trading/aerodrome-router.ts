import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem';
import { AERODROME_SWAP_ROUTER, BASE_USDC } from '../base-chain';
import { getQuotePairByPoolAddress } from './catalog';
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

function toBig(value: string): bigint {
  const n = BigInt(value);
  if (n <= 0n || n >= 2n ** 256n) throw new Error('Invalid raw amount');
  return n;
}

function clampedSlippageBps(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 10000);
}

export function minimumOut(amountOut: bigint, slippageBps: number): bigint {
  const bps = clampedSlippageBps(slippageBps);
  if (bps >= 10000) return 1n;
  // Floor is deliberate: the router requires at least 1 unit.
  return BigInt.asUintN(256, (amountOut * BigInt(10000 - bps)) / 10000n) || 1n;
}

function resolveTickSpacing(quote: QuoteEstimate, tickSpacingOverride?: number): number {
  if (tickSpacingOverride !== undefined) return tickSpacingOverride;
  const pair = getQuotePairByPoolAddress(quote.poolAddress);
  if (!pair) throw new Error('Pool not in the verified catalog; tickSpacing required');
  return pair.tickSpacing;
}

/**
 * Build an `exactInputSingle` swap call to the Aerodrome SlipStream router.
 *
 * @param quote         A verified Base desk estimate.
 * @param slippageBps   Slippage tolerance in basis points (e.g. 50 for 0.5%).
 * @param recipient     Address that receives the output tokens.
 * @param deadline      Unix timestamp after which the transaction reverts.
 * @param tickSpacing   Optional pool tick spacing; inferred from catalog if omitted.
 */
export function buildAerodromeSwapTx(
  quote: QuoteEstimate,
  slippageBps: number,
  recipient: Address,
  deadline: bigint,
  tickSpacing?: number,
): SwapTx {
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
      tickSpacing: resolveTickSpacing(quote, tickSpacing),
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
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, BigInt.asUintN(256, amount)],
  });
  return { to: token, data };
}

export { erc20Abi };
