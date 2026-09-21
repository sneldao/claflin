/**
 * Verified Pyth Pro feed mapping for Jesse's xStock catalog (plan §4.4,
 * E2 work item 1).
 *
 * Every numeric id below was resolved through Pyth's official symbology API
 * (`https://pyth.dourolabs.app/v1/symbols`, the endpoint linked from
 * https://docs.pyth.network/price-feeds/pro/price-feed-ids) on
 * 2026-09-17 — never from a Core/Hermes hex id, a ticker guess, or the
 * docs page's Apple example.
 *
 * Token unit basis verified 2026-09-21 against live Lazer observations under
 * All Access trial entitlement: for AAPL/NVDA, Pt ≈ Pe × R (redemption rate)
 * within ~3 bps while |Pt − Pe|/Pe was larger; TSLA R=1 so both relations
 * coincide. That matches Backed Scaled UI Amount multipliers ≈ RR →
 * feeds price USD per **raw** token. Comparison normalizes by the mint
 * multiplier effective at the token generation time.
 */
import { SOLANA_INSTRUMENTS } from '../catalog';
import type { SolanaInstrumentId } from '../contracts';

export interface PythFeedRef {
  /** Numeric Pyth Pro (Lazer) id — NOT a Hermes hex id. */
  feedId: number;
  symbol: string;
  exponent: number;
  minChannel: string;
}

export type TokenUnitBasis = 'usd-per-scaled-token' | 'usd-per-raw-token';

export interface JesseFeedMapping {
  instrumentId: SolanaInstrumentId;
  equity: PythFeedRef & { unit: 'usd-per-share' };
  token: PythFeedRef;
  /** Provider redemption-rate feed (token → underlying), used by the
   *  daemon to corroborate the token price basis at runtime. */
  redemptionRate: PythFeedRef;
  /** null until live observations verify the basis. */
  tokenUnitBasis: TokenUnitBasis | null;
  /** Where the mapping / basis came from. */
  basisSource: string;
  /** When the symbology verification happened (ISO date). */
  verifiedAt: string;
  /** When the unit basis was proven from live Lazer samples (ISO date). */
  basisVerifiedAt: string | null;
}

const SYMBOLOGY_SOURCE =
  'https://pyth.dourolabs.app/v1/symbols (official Pyth Pro symbology API)';
const BASIS_SOURCE =
  'Pyth Lazer live sample 2026-09-21: Pt≈Pe×R for AAPLx/NVDAx (All Access trial); RR≈Backed scaled-UI multiplier';
const VERIFIED_AT = '2026-09-17';
const BASIS_VERIFIED_AT = '2026-09-21';

type FeedSet = Omit<JesseFeedMapping, 'instrumentId'>;

/** Verified feeds keyed by catalog symbol; instrument ids are resolved
 *  from the catalog itself so the mint provenance has a single source. */
const VERIFIED_FEEDS: Readonly<Record<string, FeedSet>> = {
  AAPLx: {
    equity: { feedId: 922, symbol: 'Equity.US.AAPL/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1792, symbol: 'Crypto.AAPLX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1791, symbol: 'Crypto.AAPLX/AAPL.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: 'usd-per-raw-token',
    basisSource: `${SYMBOLOGY_SOURCE}; ${BASIS_SOURCE}`,
    verifiedAt: VERIFIED_AT,
    basisVerifiedAt: BASIS_VERIFIED_AT,
  },
  NVDAx: {
    equity: { feedId: 1314, symbol: 'Equity.US.NVDA/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1833, symbol: 'Crypto.NVDAX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1832, symbol: 'Crypto.NVDAX/NVDA.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: 'usd-per-raw-token',
    basisSource: `${SYMBOLOGY_SOURCE}; ${BASIS_SOURCE}`,
    verifiedAt: VERIFIED_AT,
    basisVerifiedAt: BASIS_VERIFIED_AT,
  },
  TSLAx: {
    equity: { feedId: 1435, symbol: 'Equity.US.TSLA/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1847, symbol: 'Crypto.TSLAX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1846, symbol: 'Crypto.TSLAX/TSLA.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: 'usd-per-raw-token',
    basisSource: `${SYMBOLOGY_SOURCE}; ${BASIS_SOURCE}`,
    verifiedAt: VERIFIED_AT,
    basisVerifiedAt: BASIS_VERIFIED_AT,
  },
};

/* A mapping without its catalog instrument is a build-time defect, not a
   runtime condition — fail closed at module load. */
export const JESSE_FEED_MAPPINGS: readonly JesseFeedMapping[] = Object.entries(VERIFIED_FEEDS).map(([symbol, feeds]) => {
  const instrument = SOLANA_INSTRUMENTS.find(candidate => candidate.symbol === symbol);
  if (!instrument) throw new Error(`Feed mapping without a catalog instrument: ${symbol}`);
  return { instrumentId: instrument.id, ...feeds };
});

export function feedMappingFor(instrumentId: SolanaInstrumentId): JesseFeedMapping | null {
  return JESSE_FEED_MAPPINGS.find(mapping => mapping.instrumentId === instrumentId) ?? null;
}

/** All feed ids the ingestion daemon subscribes to, deduplicated. */
export function allJesseFeedIds(): number[] {
  const ids = new Set<number>();
  for (const mapping of JESSE_FEED_MAPPINGS) {
    ids.add(mapping.equity.feedId);
    ids.add(mapping.token.feedId);
    ids.add(mapping.redemptionRate.feedId);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Symbol lookup for daemon snapshot rows. */
export function feedSymbolForId(feedId: number): string | null {
  for (const mapping of JESSE_FEED_MAPPINGS) {
    if (mapping.equity.feedId === feedId) return mapping.equity.symbol;
    if (mapping.token.feedId === feedId) return mapping.token.symbol;
    if (mapping.redemptionRate.feedId === feedId) return mapping.redemptionRate.symbol;
  }
  return null;
}

/** Every mapping must point at an instrument the desk actually allows. */
export function feedMappingsAreCatalogBound(): boolean {
  return JESSE_FEED_MAPPINGS.every(mapping =>
    SOLANA_INSTRUMENTS.some(instrument => instrument.id === mapping.instrumentId),
  );
}
