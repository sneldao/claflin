/**
 * Halley's curve math — turn a launch intent plus an equity anchor into DBC
 * config parameters and a projected price path. Pure module: no network, no
 * env; the caller resolves the anchor (Pyth snapshots) and the quote mint.
 *
 * The anchor is the desk's whole thesis: the curve opens at the equity's
 * price (or the pair ratio for an xStock quote) instead of opening at zero,
 * and runs a stated band above it (`bandBps`) to graduation.
 *
 * `graduationQuote` means exactly what the slip says: the quote collected on
 * the curve when it migrates to DAMM v2. The SDK's market-cap builders spend
 * the whole non-leftover supply on the curve, so with a fixed opening price
 * the quote raised scales with the circulating supply. The desk therefore
 * sizes the curve's share of supply to hit the graduation line and returns
 * the remainder to the launcher as DBC `leftover` — disclosed on every
 * estimate. (Before 2026-10-13 the line was read as a market-cap delta,
 * which made a "150 USDC" house launch need ~500K USDC to graduate.)
 *
 * Every serialized number that crosses the estimate boundary is a string.
 */

import BN from 'bn.js';
import {
  buildCurveWithLiquidityWeights,
  getPriceFromSqrtPrice,
  ActivationType,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import type {
  HalleyAnchor,
  HalleyDlmmPlan,
  HalleyLaunchEstimate,
  HalleyLaunchIntent,
  HalleyPathPoint,
  HalleyProfiles,
  LaunchCurvePreset,
} from './contracts';
import { DAMM_V2_MIGRATION_CONFIGS, quoteMintForSymbol, type HalleyQuoteMint } from './catalog';
import {
  LAUNCH_FEE_BPS,
  feeConfigFor,
  liquidityConfigFor,
  migrationConfigFor,
  resolveProfiles,
  summarizeProfiles,
} from './profiles';

/** Base token decimals — the launched tracker mint. 6 matches house norms. */
export const HALLEY_BASE_DECIMALS = 6;

/** Widest unsigned integer the DBC program stores (curve sqrt price & liquidity). */
const U128_MAX = new BN('340282366920938463463374607431768211455');

/**
 * Can this curve exist on-chain? A segment whose liquidity or sqrt price needs
 * more than u128 bytes cannot be encoded into the program's config. That is
 * what a too-tight band against a large supply produces: selling the whole
 * supply must barely move the price, and the liquidity required overflows.
 * Returns the worst segment's liquidity as a readable decimal, or null when
 * every segment fits.
 */
export function curveOverflowFor(params: ConfigParameters): string | null {
  for (const segment of params.curve ?? []) {
    if (segment.liquidity.gt(U128_MAX) || segment.sqrtPrice.gt(U128_MAX)) {
      return segment.liquidity.toString(10);
    }
  }
  return null;
}

/* Curve presets → liquidity weight profile. buildCurveWithLiquidityWeights
   builds a fixed 16-segment curve, so every preset carries 16 weights.
   Higher weight = more liquidity in that segment = slower price movement
   there: 'long' loads the early segments, 'exponential' loads the tail.
   flat/equity-pair differ in anchor source, not shape. */
export const PRESET_WEIGHTS: Record<LaunchCurvePreset, number[]> = {
  flat: Array(16).fill(1),
  'equity-pair': Array(16).fill(1),
  long: [4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  exponential: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4],
};

export { LAUNCH_FEE_BPS };

/** Anchored launches whose curve runs wider than this are disclosed as
 *  wide: they are no longer tight price discovery around the reference. */
export const WIDE_BAND_BPS = 2000;

/** DLMM conviction range defaults — equities move in tight steps, so a
 *  narrow bin step and a +/-5% range around the reference. */
export const DLMM_BIN_STEP_BPS = 10;
export const DLMM_HALF_WIDTH_BPS = 500;
/** One DLMM position spans at most 70 bins; stay inside it. */
export const DLMM_MAX_BINS = 69;

/** Graduation lines are hit from above by this fraction (SDK rounding). */
const GRADUATION_BUFFER = 2e-5;
/** Smallest leftover share the SDK's supply invariant tolerates. */
const MIN_LEFTOVER_FRACTION = 1e-6;

/** A launch shape the curve math refuses — a caller error, not an outage. */
export class HalleyCurveError extends Error {
  constructor(public code: 'supply_too_small' | 'curve_unbuildable', message: string) {
    super(message);
    this.name = 'HalleyCurveError';
  }
}

const BASE_SCALE = 10 ** 6; // HALLEY_BASE_DECIMALS

/** Round down to base-token precision. */
function roundBase(n: number): number {
  return Math.floor(n * BASE_SCALE) / BASE_SCALE;
}

function minLeftoverFor(supply: number): number {
  return Math.max(roundBase(supply * MIN_LEFTOVER_FRACTION), 1 / BASE_SCALE);
}

/** Whole-token count for copy (grouped) or the wire (plain, 6dp max). */
function fmtTokens(n: number, grouped = true): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  return grouped ? rounded.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(rounded);
}

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

/** The profiles a launch runs with — explicit intent fields win, the house
 *  proposes the rest from the anchor's posture. Deterministic in its inputs,
 *  so paper and live always agree. */
export function profilesFor(intent: HalleyLaunchIntent, anchor: HalleyAnchor | null): HalleyProfiles {
  const observed = anchor !== null && anchor.status === 'observed';
  return resolveProfiles(
    { fee: intent.feeProfile, liquidity: intent.liquidityProfile, postGraduation: intent.postGraduation },
    { anchorSource: observed ? anchor.source : null },
  );
}

/** House band per curve shape — tight for equity discovery, wider for
 *  shapes whose point is a steep tail. An explicit `bandBps` wins. */
export const DEFAULT_BAND_BPS: Readonly<Record<LaunchCurvePreset, number>> = Object.freeze({
  'equity-pair': 1000,
  flat: 1000,
  long: 5000,
  exponential: 20000,
});

/** The price band, in bps: how far the curve runs from its opening price
 *  to the graduation price. */
export function bandBpsFor(intent: Pick<HalleyLaunchIntent, 'curve' | 'bandBps'>): number {
  return intent.bandBps ?? DEFAULT_BAND_BPS[intent.curve];
}

/**
 * A DLMM conviction range for after graduation: concentrated liquidity in
 * tight bins around the equity reference (or the graduation price when the
 * launch is unanchored). Pure plan — never a transaction.
 */
export function dlmmConvictionPlan(
  centerPrice: number,
  centerSource: HalleyDlmmPlan['centerSource'],
  halfWidthBps = DLMM_HALF_WIDTH_BPS,
): HalleyDlmmPlan | null {
  if (!Number.isFinite(centerPrice) || centerPrice <= 0) return null;
  const lower = centerPrice * (1 - halfWidthBps / 10_000);
  const upper = centerPrice * (1 + halfWidthBps / 10_000);
  /* Widen the bin step until the range fits one position. */
  let binStepBps = DLMM_BIN_STEP_BPS;
  let binCount = Math.ceil(Math.log(upper / lower) / Math.log(1 + binStepBps / 10_000));
  while (binCount > DLMM_MAX_BINS) {
    binStepBps *= 2;
    binCount = Math.ceil(Math.log(upper / lower) / Math.log(1 + binStepBps / 10_000));
  }
  const fmt = (n: number) => String(Number(n.toPrecision(10)));
  return {
    centerPriceQuote: fmt(centerPrice),
    centerSource,
    binStepBps,
    lowerPriceQuote: fmt(lower),
    upperPriceQuote: fmt(upper),
    binCount,
    halfWidthBps,
  };
}

/** Conviction launches vest the unsold remainder to the launcher instead of
 *  releasing it at graduation: 30-day cliff, then daily over a year. */
export const CONVICTION_VESTING = Object.freeze({ cliffDays: 30, days: 365 });

function curveParams(
  intent: HalleyLaunchIntent,
  quote: HalleyQuoteMint,
  profiles: HalleyProfiles,
  opening: number,
  remainder: number,
): ConfigParameters {
  const supply = decimalToNumber(intent.supply);
  const graduation = opening * (1 + bandBpsFor(intent) / 10_000);
  const vestRemainder = profiles.liquidity === 'conviction';
  /* The SDK's supply invariant needs a sliver of leftover either way. */
  const floor = minLeftoverFor(supply);
  const leftover = vestRemainder ? floor : remainder;
  const vested = vestRemainder ? Math.max(0, roundBase(remainder - floor)) : 0;
  return buildCurveWithLiquidityWeights({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quote.decimals,
      tokenAuthorityOption: TokenAuthorityOption.CreatorUpdateAuthority,
      totalTokenSupply: supply,
      leftover,
    },
    fee: feeConfigFor(profiles.fee),
    migration: migrationConfigFor(profiles.postGraduation),
    liquidityDistribution: liquidityConfigFor(profiles.liquidity),
    lockedVesting: vested > 0
      ? {
          totalLockedVestingAmount: vested,
          numberOfVestingPeriod: CONVICTION_VESTING.days,
          cliffUnlockAmount: 0,
          totalVestingDuration: CONVICTION_VESTING.days * 86_400,
          cliffDurationFromMigrationTime: CONVICTION_VESTING.cliffDays * 86_400,
        }
      : { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Slot,
    initialMarketCap: opening * supply,
    migrationMarketCap: graduation * supply,
    liquidityWeights: PRESET_WEIGHTS[intent.curve],
  });
}

/**
 * Supply split for a launch — how many tracker tokens the curve and the
 * DAMM v2 pool need to collect exactly `graduationQuote`, and how many are
 * left over to the launcher. The migration threshold is linear in the
 * circulating supply at fixed prices, so one reference build solves it.
 */
export function supplySplitFor(
  intent: HalleyLaunchIntent,
  quote: HalleyQuoteMint,
  anchor: HalleyAnchor | null,
): { circulating: number; leftover: number } {
  const supply = decimalToNumber(intent.supply);
  const opening = openingPriceFor(intent, quote, anchor);
  /* Reference build at half the supply circulating: the SDK's own rounding
     invariant needs a non-zero leftover, and the threshold is linear in the
     circulating supply, so doubling it is exact. */
  const reference = curveParams(intent, quote, profilesFor(intent, anchor), opening, supply / 2);
  const fullThreshold = 2 * Number(reference.migrationQuoteThreshold.toString());
  /* A hair over the line, so SDK rounding never graduates under it. */
  const target = decimalToNumber(intent.graduationQuote) * 10 ** quote.decimals * (1 + GRADUATION_BUFFER);
  if (!(fullThreshold > 0)) throw new HalleyCurveError('curve_unbuildable', 'This launch shape does not produce a buildable curve.');
  /* Round the remainder down so the curve never raises less than the line;
     keep the floor the SDK's supply invariant needs. */
  const leftover = roundBase(supply * (1 - target / fullThreshold));
  if (leftover < minLeftoverFor(supply)) {
    throw new HalleyCurveError(
      'supply_too_small',
      `${intent.supply} tracker tokens at this opening price raise at most ${(fullThreshold / 10 ** quote.decimals).toPrecision(6)} ${quote.symbol} across the band — raise the supply or lower the graduation line.`,
    );
  }
  return { circulating: supply - leftover, leftover };
}

/** The resolved config params for a launch intent — the same params a live
 *  `createConfigAndPool` call would carry. */
export function buildLaunchConfig(intent: HalleyLaunchIntent, quote: HalleyQuoteMint, anchor: HalleyAnchor | null): ConfigParameters {
  const opening = openingPriceFor(intent, quote, anchor);
  const { leftover } = supplySplitFor(intent, quote, anchor);
  return curveParams(intent, quote, profilesFor(intent, anchor), opening, leftover);
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
  const profiles = profilesFor(intent, anchor);
  const profile = summarizeProfiles(profiles);
  const bandBps = bandBpsFor(intent);
  const split = supplySplitFor(intent, quote, anchor);
  /* The conviction range centers on the reference the curve was anchored
     to; an unanchored launch has none, so it centers on graduation. */
  const anchorCenter = anchored ? Number(pair && anchor.pairRatio ? anchor.pairRatio : anchor.equityUsd) : NaN;
  const dlmmConviction = anchored
    ? dlmmConvictionPlan(anchorCenter, 'anchor')
    : dlmmConvictionPlan(Number(graduationPriceQuote), 'graduation');
  const fee = profile.feeSchedule;
  const post = profile.postGraduation;
  const assumptionClauses = [
    'Estimate only — a projection of the curve configuration, never an order or a fill.',
    anchored && anchor.source === 'onchain'
      ? `Opening price anchored to the live onchain ${anchor.symbol} venue mark (${anchor.status} at quote time) — the equity tape rests; the venue does not.${anchor.restingEquity ? ` Resting equity reference $${anchor.restingEquity.equityUsd}${anchor.restingEquity.differenceBps ? `, gap ${anchor.restingEquity.differenceBps} bps` : ''} — a comparison, not an arbitrage.` : ''}${pair && anchor.pairRatio ? ' Pair legs both read on the same onchain basis.' : ''}`
      : anchored
      ? `Opening price anchored to Pyth ${anchor.symbol}${pair && anchor.pairRatio ? `/${quote.underlyingSymbol} ratio` : ''} (${anchor.status} at quote time).`
      : anchor !== null
        ? `Equity anchor ${anchor.symbol} was ${anchor.status} at quote time — the opening price defaults to 1.0 quote unit and is NOT anchored.`
        : 'No equity anchor — opening price defaults to 1.0 quote unit; the launch is unanchored by choice.',
    `Graduation at ${intent.graduationQuote} ${quote.symbol} collected migrates the pool to DAMM v2.`,
    `Price band ${(bandBps / 100).toFixed(2)}% from opening to graduation${anchored && bandBps > WIDE_BAND_BPS ? ' — wide for an anchored launch; this is no longer tight price discovery around the reference' : ''}.`,
    profiles.liquidity === 'conviction'
      ? `The curve and the DAMM v2 pool use ${fmtTokens(split.circulating)} of ${fmtTokens(Number(intent.supply))} tracker tokens; the other ${fmtTokens(split.leftover)} vest to the launcher on-chain — nothing for ${CONVICTION_VESTING.cliffDays} days after graduation, then daily over ${CONVICTION_VESTING.days} days.`
      : `The curve and the DAMM v2 pool use ${fmtTokens(split.circulating)} of ${fmtTokens(Number(intent.supply))} tracker tokens; the other ${fmtTokens(split.leftover)} return to the launcher's wallet after graduation (DBC leftover) and can be sold into the pool.`,
    fee.mode === 'exponential-decay'
      ? `Anti-snipe fee: ${fee.startingFeeBps / 100}% at open, decaying to ${fee.endingFeeBps / 100}% over ${fee.durationSlots} slots${fee.dynamicFee ? ', plus a volatility fee while the equity tape rests' : ''}.`
      : `Flat ${fee.endingFeeBps / 100}% trading fee${fee.dynamicFee ? ' plus a volatility fee' : ''}.`,
    `${profile.liquidity.lockedBps / 100}% of migrated liquidity is permanently locked${profile.liquidity.lockedBps <= 1000 ? ' (protocol minimum)' : ''}${profile.liquidity.vestedBps > 0 ? `; ${profile.liquidity.vestedBps / 100}% vests over ${profile.liquidity.vestingDays} days after a ${profile.liquidity.vestingCliffDays}-day cliff` : ''}.`,
    post.migrationFeeOption === 'customizable'
      ? `After graduation the DAMM v2 pool charges ${post.poolFeeBps / 100}%${post.dynamicFee ? ' plus a volatility fee' : ''}${post.collectFeeMode === 'compounding' ? `, compounding ${post.compoundingFeeBps / 100}% of fees back into liquidity` : ''}.`
      : `After graduation the DAMM v2 pool charges a fixed ${post.poolFeeBps / 100}%.`,
    'The launched token is a tracker/exposure token — it is not, and does not claim to be, stock ownership.',
    pair ? `Quote asset ${quote.symbol} is a badged xStock mint (Meteora token badge verified on mainnet).` : '',
  ].filter(Boolean) as string[];
  const assumptions = assumptionClauses.join(' ');

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
      /* The config must match the migration fee option or graduation
         fails; HALLEY_DAMM_CONFIG only overrides the fixed-fee config. */
      config: profiles.postGraduation === 'fixed' ? (DAMM_V2_MIGRATION_CONFIGS[network] ?? '') : post.dammV2Config,
      lockedLiquidityBps: profile.liquidity.lockedBps,
    },
    tradingFeeBps: fee.endingFeeBps,
    migrationFeeBps: post.poolFeeBps,
    profile,
    bandBps: String(bandBps),
    supplySplit: { circulating: fmtTokens(split.circulating, false), leftover: fmtTokens(split.leftover, false) },
    dlmmConviction,
    quotedAt: now,
    expiresAt: now + 60_000,
    assumptions,
    assumptionClauses,
  };
}
