/**
 * Halley's curve math — turn a launch intent plus an equity anchor into DBC
 * config parameters and a projected price path. Pure module: no network, no
 * env; the caller resolves the anchor (Pyth snapshots) and the quote mint.
 *
 * The anchor is the desk's whole thesis: the curve opens at the equity's
 * price (or the pair ratio for an xStock quote) instead of opening at zero.
 * `graduationQuote` is the user's "raise this much quote before migrating" —
 * it maps to `migrationMarketCap = initialMarketCap + graduationQuote`, which
 * is the only honest reading of a threshold on a market-cap curve.
 *
 * Every serialized number that crosses the estimate boundary is a string.
 */

import BN from 'bn.js';
import {
  buildCurveWithLiquidityWeights,
  getPriceFromSqrtPrice,
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import type { HalleyAnchor, HalleyLaunchEstimate, HalleyLaunchIntent, HalleyPathPoint, LaunchCurvePreset } from './contracts';
import { DAMM_V2_MIGRATION_CONFIGS, quoteMintForSymbol, type HalleyQuoteMint } from './catalog';

/** Base token decimals — the launched tracker mint. 6 matches house norms. */
export const HALLEY_BASE_DECIMALS = 6;

/* Curve presets → liquidity weight profile. buildCurveWithLiquidityWeights
   builds a fixed 16-segment curve, so every preset carries 16 weights.
   Higher weight = more liquidity in that segment = slower price movement
   there: 'long' loads the early segments, 'exponential' loads the tail.
   flat/equity-pair differ in anchor source, not shape. */
const PRESET_WEIGHTS: Record<LaunchCurvePreset, number[]> = {
  flat: Array(16).fill(1),
  'equity-pair': Array(16).fill(1),
  long: [4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  exponential: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4],
};

export const LAUNCH_FEE_BPS = 100;
export const LAUNCH_MIGRATION_FEE_BPS = 25; // MigrationFeeOption.FixedBps25
const LOCKED_LIQUIDITY_BPS = 1000; // 10% partner-permanent-locked — program minimum

function decimalToNumber(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad decimal: ${s}`);
  return n;
}

/**
 * Opening price in quote units per whole base token.
 * - USDC quote: the anchor's equity USD price (1 tracker ≈ 1 share exposure).
 * - xStock quote: equityUsd(anchor) / equityUsd(quoteUnderlying) — the pair
 *   ratio is the anchor.
 * - unanchored: 1.0 quote unit, disclosed in assumptions.
 */
export function openingPriceFor(intent: HalleyLaunchIntent, quote: HalleyQuoteMint, anchor: HalleyAnchor | null): number {
  /* Only an observed anchor may set the opening price. A stale or
     unavailable anchor carries '0' evidence — treating it as a price would
     throw here and, worse, could silently misprice the projection. */
  if (!anchor || anchor.status !== 'observed') return 1;
  if (quote.underlyingSymbol && anchor.pairRatio) return decimalToNumber(anchor.pairRatio);
  return decimalToNumber(anchor.equityUsd);
}

/** The resolved config params for a launch intent — the same params a live
 *  `createConfigAndPool` call would carry. */
export function buildLaunchConfig(intent: HalleyLaunchIntent, quote: HalleyQuoteMint, anchor: HalleyAnchor | null): ConfigParameters {
  const supply = decimalToNumber(intent.supply);
  const opening = openingPriceFor(intent, quote, anchor);
  const initialMarketCap = opening * supply;
  const migrationMarketCap = initialMarketCap + decimalToNumber(intent.graduationQuote);

  return buildCurveWithLiquidityWeights({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quote.decimals,
      tokenAuthorityOption: TokenAuthorityOption.CreatorUpdateAuthority,
      totalTokenSupply: supply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: LAUNCH_FEE_BPS, endingFeeBps: LAUNCH_FEE_BPS, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps25,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 10,
      partnerLiquidityPercentage: 45,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 45,
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Slot,
    initialMarketCap,
    migrationMarketCap,
    liquidityWeights: PRESET_WEIGHTS[intent.curve],
  });
}

/**
 * Projected path — sample sqrt-price linearly across the curve segments and
 * convert each to a whole-unit price. Single-segment curves (flat,
 * equity-pair) price smoothly; weighted presets show their shape here.
 */
export function projectedPath(params: ConfigParameters, quoteDec: number): readonly HalleyPathPoint[] {
  const sqrtStart = params.sqrtStartPrice;
  const segments = params.curve ?? [];
  const last = segments[segments.length - 1];
  const sqrtEnd = last?.sqrtPrice ?? sqrtStart;
  const start = BigInt(sqrtStart.toString());
  const end = BigInt(sqrtEnd.toString());
  if (end <= start) return [{ progress: '0', priceQuote: '0' }, { progress: '1', priceQuote: '0' }];

  /* getPriceFromSqrtPrice already maps a raw sqrt-price to whole units
     (base decimal → quote decimal); converting its Decimal output straight
     to string keeps the estimate boundary exact. */
  const baseDecimal = HALLEY_BASE_DECIMALS as TokenDecimal;
  const points: HalleyPathPoint[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const sqrtI = start + ((end - start) * BigInt(i)) / BigInt(N);
    const price = getPriceFromSqrtPrice(new BN(sqrtI.toString()), baseDecimal, quoteDec);
    points.push({ progress: String(i / N), priceQuote: price.toString() });
  }
  return points;
}

/** Build the full paper estimate for a validated intent. */
export function estimateLaunch(
  intent: HalleyLaunchIntent,
  anchor: HalleyAnchor | null,
  now: number,
  network: 'mainnet' | 'devnet' = 'mainnet',
): HalleyLaunchEstimate {
  const quote = quoteMintForSymbol(intent.quoteSymbol);
  if (!quote) throw new Error(`unknown quote asset: ${intent.quoteSymbol}`);
  const params = buildLaunchConfig(intent, quote, anchor);
  const path = projectedPath(params, quote.decimals);
  const openingPriceQuote = path[0]?.priceQuote ?? '0';
  const graduationPriceQuote = path[path.length - 1]?.priceQuote ?? '0';

  const anchored = anchor !== null && anchor.status === 'observed';
  const pair = quote.underlyingSymbol !== null;
  const assumptions = [
    'Estimate only — a projection of the curve configuration, never an order or a fill.',
    anchored
      ? `Opening price anchored to Pyth ${anchor.symbol}${pair && anchor.pairRatio ? `/${quote.underlyingSymbol} ratio` : ''} (${anchor.status} at quote time).`
      : anchor !== null
        ? `Equity anchor ${anchor.symbol} was ${anchor.status} at quote time — the opening price defaults to 1.0 quote unit and is NOT anchored.`
        : 'No equity anchor — opening price defaults to 1.0 quote unit; the launch is unanchored by choice.',
    `Graduation at ${intent.graduationQuote} ${quote.symbol} collected migrates the pool to DAMM v2.`,
    `${LOCKED_LIQUIDITY_BPS / 100}% of migrated liquidity is permanently locked (protocol minimum).`,
    'The launched token is a tracker/exposure token — it is not, and does not claim to be, stock ownership.',
    pair ? `Quote asset ${quote.symbol} is a badged xStock mint (Meteora token badge verified on mainnet).` : '',
  ].filter(Boolean).join(' ');

  return {
    version: 1,
    id: `halley-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'launch-estimate',
    mode: 'paper',
    deskId: 'halley',
    mandateId: 'meteora-launch',
    network: 'solana:mainnet',
    venue: 'meteora-dbc',
    intent,
    quoteMint: quote.mint,
    quoteDecimals: quote.decimals,
    quoteBadge: quote.badge,
    anchor,
    openingPriceQuote,
    graduationPriceQuote,
    sqrtStart: params.sqrtStartPrice.toString(),
    sqrtMin: params.sqrtStartPrice.toString(),
    sqrtMax: (params.curve?.[params.curve.length - 1]?.sqrtPrice ?? params.sqrtStartPrice).toString(),
    migrationQuoteThreshold: params.migrationQuoteThreshold.toString(),
    path,
    migration: {
      target: 'damm-v2',
      config: DAMM_V2_MIGRATION_CONFIGS[network] ?? '',
      lockedLiquidityBps: LOCKED_LIQUIDITY_BPS,
    },
    tradingFeeBps: LAUNCH_FEE_BPS,
    migrationFeeBps: LAUNCH_MIGRATION_FEE_BPS,
    quotedAt: now,
    expiresAt: now + 60_000,
    assumptions,
  };
}
