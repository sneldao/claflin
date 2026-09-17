// ============================================
// Aerodrome Venue Adapter — Hetty's Base desk
// ============================================
// Read-side execution adapter for Coinbase Tokenized Stocks
// on Aerodrome Slipstream. Implements the three price layers
// from the product contract:
//
//   1. Reference price  — Chainlink total-return feed (24/5,
//      freezes on weekends and corporate actions). A
//      valuation input, never an executable quote.
//   2. Market price     — indicative price implied by a
//      minimal-size quote on the allowlisted pool (24/7).
//   3. Quote estimate — delegates to trading/quotes for
//      an exact input in paper mode. The legacy API name
//      does not authorize or submit a transaction.
//
// Historical investigation 2026-09-05:
//   - A 0x NVDAc request was legally restricted. Odos's error
//     did not establish token policy; other routes remain unverified.
//   - The original MixedQuoter does not resolve pools on the
//     newest CL factory; MixedRouteQuoterV3 is required, with
//     the cl2 factory bitmask (1 << 19) OR'd into the path
//     filler's tickSpacing field.
//   - B20 token decimals are configurable: the four tradable
//     stocks use 8, not 18. Always read decimals() onchain.
//   - Quotes are only produced against allowlisted venue
//     pairs from the instrument catalog.
// ============================================

import { ethers } from 'ethers';
import type { Address } from 'viem';
import { BASE_RPC_URL, BASE_USDC } from './base-chain';
import type { TokenizedStock, VenuePair } from './tokenized-stocks';
import { createAerodromeReader } from './trading/aerodrome';
import { createQuoteService, referenceObservation } from './trading/quotes';
import { getDeskInstrument, getQuotePair } from './trading/catalog';
import { formatAmount, type BaseQuoteEstimate } from './trading/domain';

const estimate = createQuoteService(createAerodromeReader());

function canonical(instrument: TokenizedStock) {
  return getDeskInstrument(`8453:${instrument.contractAddress.toLowerCase()}`);
}

function verifyPair(instrument: TokenizedStock, pair: VenuePair) {
  const stock = canonical(instrument);
  const approved = getQuotePair(stock);
  if (JSON.stringify(pair) !== JSON.stringify(approved)) throw new Error('Unverified pair.');
  return stock;
}

// ============================================
// ABIs (minimal, read-only)
// ============================================

const CHAINLINK_FEED_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

const B20_ABI = [
  'function decimals() view returns (uint8)',
  'function multiplier() view returns (uint256)',
];

// ============================================
// Types
// ============================================

export type PriceLayerStatus = 'fresh' | 'observed' | 'stale' | 'unavailable';

export interface ReferencePrice {
  kind: 'reference';
  source: 'chainlink';
  /** Underlying × multiplier, USD per tokenized stock */
  priceUsd: number;
  updatedAt: number; // unix seconds
  status: PriceLayerStatus;
}

export interface MarketPrice {
  kind: 'market';
  source: 'aerodrome_quoter';
  poolAddress: Address;
  /** USD per tokenized stock implied by a minimal-size quote */
  priceUsd: number;
  status: PriceLayerStatus;
}

// Raw input units are carried in amountInRaw.
// Raw output units are carried in amountOutRaw.
/** Amounts are decimal strings; no floating-point sizing. */
/** A small buy quote is not a neutral market mid or impact benchmark. */
// quotedAt and expiresAt use unix ms.
/** This legacy type name now exposes a paper-only estimate, never an execution.
 *  A type alias, not an interface — the shared QuoteEstimate is a union now,
 *  and this module only ever handles the Base branch. */
export type ExecutableQuote = BaseQuoteEstimate;

/** Reference observation validity is defined in trading/quotes, not inferred from session age. */
/** Estimate expiry is anchored to request start in the shared quote service. */

// ============================================
// Provider and per-token metadata
// ============================================

let provider: ethers.JsonRpcProvider | null = null;

export function getBaseProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(BASE_RPC_URL, 8453, {
      staticNetwork: true,
    });
  }
  return provider;
}

const decimalsCache = new Map<string, number>();

/** B20 decimals are per-token configurable — always resolve onchain. */
export async function getTokenDecimals(
  instrument: TokenizedStock,
): Promise<number> {
  const key = instrument.contractAddress.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  const token = new ethers.Contract(
    instrument.contractAddress,
    B20_ABI,
    getBaseProvider(),
  );
  const decimals = Number(await token.decimals());
  decimalsCache.set(key, decimals);
  return decimals;
}

/** Current corporate-action multiplier (WAD-scaled; 1e18 = 1.0). */
export async function getMultiplier(
  instrument: TokenizedStock,
): Promise<bigint> {
  const token = new ethers.Contract(
    instrument.contractAddress,
    B20_ABI,
    getBaseProvider(),
  );
  return token.multiplier();
}

// ============================================
// Layer 1 — reference price (Chainlink, 24/5)
// ============================================

export async function getReferencePrice(
  instrument: TokenizedStock,
): Promise<ReferencePrice> {
  const stock = canonical(instrument);
  const feed = new ethers.Contract(stock.chainlinkFeed, CHAINLINK_FEED_ABI, getBaseProvider());
  const [, answer, , updatedAt] = await feed.latestRoundData();
  const observation = referenceObservation({ answer: BigInt(answer), decimals: Number(await feed.decimals()), updatedAt: Number(updatedAt) }, Date.now());
  if (observation.status === 'unavailable') throw new Error('Invalid reference observation.');
  return {
    kind: 'reference', source: 'chainlink',
    priceUsd: Number(observation.priceUsdPerToken), updatedAt: Number(updatedAt),
    // Age alone does not establish market-session status.
    // This observation is not evidence that an oracle is unpaused.
    status: observation.status,
  };
}

// ============================================
// Path encoding — MixedRouteQuoterV3
// ============================================

/**
 * Packed single-hop CL path: tokenIn —filler→ tokenOut.
 * The filler is the pair's verified tickSpacing OR'd with its
 * CL-factory selector bitmask, read from the allowlisted
 * catalog entry — never assumed.
 */
export function encodeClPath(
  tokenIn: Address,
  pair: VenuePair,
  tokenOut: Address,
): string {
  return ethers.solidityPacked(
    ['address', 'int24', 'address'],
    [tokenIn, pair.tickSpacing | pair.clFactoryBitmask, tokenOut],
  );
}

// ============================================
// Layer 2 — market price (minimal-size quote)
// ============================================
// This legacy helper returns a 1-USDC buy indication, not a
// market mid. New consumers use the exact-input estimate
// from trading/quotes; no execution path is implemented.

export async function getMarketPrice(
  instrument: TokenizedStock,
  pair: VenuePair,
): Promise<MarketPrice> {
  const stock = verifyPair(instrument, pair);
  const quote = await estimate({ instrumentId: stock.id, side: 'buy', amount: '1', unit: 'USDC' });
  return {
    kind: 'market', source: 'aerodrome_quoter', poolAddress: pair.poolAddress,
    priceUsd: 1 / Number(quote.outputAmount), status: 'fresh',
  };
}

// ============================================
// Layer 3 — executable quote
// ============================================
// sizeIn is always the spend: USDC raw units for buys, token
// raw units for sells.

export async function getExecutableQuote(
  instrument: TokenizedStock,
  pair: VenuePair,
  side: 'buy' | 'sell',
  amountIn: bigint,
): Promise<ExecutableQuote> {
  const stock = verifyPair(instrument, pair);
  if (stock.decimals === null || amountIn <= 0n) throw new Error('Invalid amount or unverified units.');
  return estimate({
    instrumentId: stock.id, side,
    amount: formatAmount(amountIn, side === 'buy' ? 6 : stock.decimals),
    unit: side === 'buy' ? 'USDC' : 'token',
  });
}

// ============================================
// Availability gate — nothing executes against an
// unverified or unavailable instrument.
// ============================================

export function getTradablePair(
  instrument: TokenizedStock,
): { pair: VenuePair } | { error: 'not_on_this_desk' | 'insufficient_liquidity' | 'no_usdc_pair' } {
  const stock = canonical(instrument);
  if (instrument.availability !== 'quote_candidate' || !stock.quoteSupported || instrument.venuePairs.length === 0) {
    return {
      error:
        instrument.availability === 'insufficient_liquidity'
          ? 'insufficient_liquidity'
          : 'not_on_this_desk',
    };
  }
  const pair = instrument.venuePairs.find(
    (p) => p.quoteToken.toLowerCase() === BASE_USDC.toLowerCase(),
  );
  if (!pair) return { error: 'no_usdc_pair' };
  const approved = getQuotePair(stock);
  if (JSON.stringify(pair) !== JSON.stringify(approved)) return { error: 'not_on_this_desk' };
  return { pair: { ...approved } };
}
