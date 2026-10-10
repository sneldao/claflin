/**
 * Meteora launch-desk contracts — Halley's desk implementation for the
 * 'meteora-launch' mandate on solana:mainnet. Shared desk vocabulary lives
 * in lib/desk/contracts.ts and is re-exported here for compatibility.
 * Client-safe: no server imports, no env access, no dependencies.
 *
 * The desk's job is a launch, not a swap: a new base mint (a tracker token —
 * never a claim of stock ownership) is priced on a DBC curve against a
 * verified quote mint (USDC, or a badged xStock for the equity pair), with an
 * opening price anchored to the equity's Pyth mark inside a tight band.
 *
 * Every raw quantity and price is a serialized string — no floats cross this
 * boundary.
 */

import type { DeskRevision as SharedDeskRevision } from '../desk/contracts';

export type {
  CommandResult,
  DeskCapabilities,
  DeskLifecycleStage,
  DeskPresentation,
  DeskPresentationState,
} from '../desk/contracts';
export { normalizeDeskPresentation } from '../desk/contracts';

export type HalleyNetwork = 'solana:mainnet';

/** Curve presets — the desk's "novel config" axis. */
export type LaunchCurvePreset = 'flat' | 'exponential' | 'long' | 'equity-pair';

export const LAUNCH_CURVE_PRESETS: readonly LaunchCurvePreset[] =
  Object.freeze(['flat', 'exponential', 'long', 'equity-pair']);

/**
 * A launch instruction. The base mint does not exist yet — DBC creates it at
 * launch — so there is no instrumentId; the identity is name + symbol +
 * anchor + quote + curve.
 *
 * `anchorSymbol` is the equity whose Pyth mark the opening price is moored
 * to (e.g. 'NVDA'). For a pair launch the quote is an xStock and the anchor
 * is the ratio of the two equities.
 */
export interface HalleyLaunchIntent {
  name: string;
  symbol: string;
  /** Equity the opening price anchors to. null = unanchored curve (allowed,
   *  but disclosed — the desk's story is the anchor). */
  anchorSymbol: string | null;
  /** Quote asset symbol from the verified catalog ('USDC' | 'AAPLx' | …). */
  quoteSymbol: string;
  curve: LaunchCurvePreset;
  /** Total base supply in whole tokens (e.g. '1000000000'). */
  supply: string;
  /** Quote units at which the curve migrates to DAMM v2 (e.g. '150' USDC). */
  graduationQuote: string;
}

/** An incomplete launch instruction — every field independently nullable. */
export interface HalleyDraft {
  name: string | null;
  symbol: string | null;
  anchorSymbol: string | null;
  quoteSymbol: string | null;
  curve: LaunchCurvePreset | null;
  supply: string | null;
  graduationQuote: string | null;
}

/** The anchor evidence — where the opening price came from. */
export interface HalleyAnchor {
  symbol: string;
  /** 'pyth-pro' — the equity feed; 'onchain' — the live xStock venue mark,
      used while the equity tape rests. Never a fabricated price. */
  source: 'pyth-pro' | 'onchain';
  /** The observed USD mark used for the opening price — per share for
      equity, per token for onchain. */
  equityUsd: string;
  /** For pair launches: anchor mark / quote mark, same basis. */
  pairRatio: string | null;
  quoteEquityUsd: string | null;
  observedAt: number;
  status: 'observed' | 'stale' | 'unavailable';
  /** Present on onchain anchors: the resting equity reading the onchain
      mark replaced, and the venue-versus-reference gap — evidence, not
      an arbitrage claim. */
  restingEquity?: { equityUsd: string; differenceBps: string | null } | null;
}

/** One point on the projected price path — estimate, never an order. */
export interface HalleyPathPoint {
  /** Curve fill 0–1. */
  progress: string;
  priceQuote: string;
}

/**
 * Paper launch estimate — the projected curve for a launch draft. It is an
 * estimate of what the launch WOULD do; it never represents an executed or
 * executable figure.
 */
export interface HalleyLaunchEstimate {
  version: 1;
  id: string;
  kind: 'launch-estimate';
  mode: 'paper';
  deskId: 'halley';
  mandateId: 'meteora-launch';
  network: HalleyNetwork;
  venue: 'meteora-dbc';
  intent: HalleyLaunchIntent;
  quoteMint: string;
  quoteDecimals: number;
  quoteBadge: string | null;
  anchor: HalleyAnchor | null;
  /** Opening price in quote units per base token, serialized. */
  openingPriceQuote: string;
  /** Price at the graduation threshold, same units. */
  graduationPriceQuote: string;
  /** sqrt prices — the raw curve params in Q64, serialized decimal. */
  sqrtStart: string;
  sqrtMin: string;
  sqrtMax: string;
  /** Quote units (raw integer string) that trigger DAMM v2 migration. */
  migrationQuoteThreshold: string;
  /** Projected price path across the curve — 0% → 100% fill. */
  path: readonly HalleyPathPoint[];
  migration: {
    target: 'damm-v2';
    /** DAMM v2 migration config (network-verified). */
    config: string;
    lockedLiquidityBps: number;
  };
  /** Fees the curve will charge, in bps. */
  tradingFeeBps: number;
  migrationFeeBps: number;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
  /** The same reading as separate clauses — the slip renders it as a
      broker's note instead of one long sentence. Optional: older filed
      estimates predate the field. */
  assumptionClauses?: readonly string[];
}

export type DeskRevision = SharedDeskRevision<'halley'>;

const POSITIVE_DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;
const LAUNCH_SYMBOL = /^[A-Z0-9]{2,10}$/;

export function isHalleyLaunchIntent(input: unknown): input is HalleyLaunchIntent {
  if (typeof input !== 'object' || input === null) return false;
  const c = input as Record<string, unknown>;
  if (typeof c.name !== 'string' || c.name.trim().length < 2 || c.name.length > 40) return false;
  if (typeof c.symbol !== 'string' || !LAUNCH_SYMBOL.test(c.symbol)) return false;
  if (c.anchorSymbol !== null && (typeof c.anchorSymbol !== 'string' || !/^[A-Z0-9.]{1,10}$/.test(c.anchorSymbol))) return false;
  if (typeof c.quoteSymbol !== 'string' || c.quoteSymbol.length === 0) return false;
  if (!LAUNCH_CURVE_PRESETS.includes(c.curve as LaunchCurvePreset)) return false;
  if (typeof c.supply !== 'string' || !/^[1-9]\d*$/.test(c.supply)) return false;
  if (typeof c.graduationQuote !== 'string' || !POSITIVE_DECIMAL.test(c.graduationQuote) || !/[1-9]/.test(c.graduationQuote)) return false;
  return true;
}
/* Deliberately not merged into DeskIntentRegistry / QuoteEstimateRegistry:
   the shared trade-union consumers (router, execute-swap, ticket) assume a
   buy/sell instruction shape. A launch intent is not a trade — it drafts a
   curve — so it stays out of the union rather than wearing false fields. */
