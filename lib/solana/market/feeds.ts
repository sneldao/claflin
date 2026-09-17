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
 * What is verified:
 *   - equity feeds are `Equity.US.<ticker>/USD`, asset_type `equity`,
 *     instrument_type `spot`, exponent -5, with regular/preMarket/
 *     postMarket/overNight sessions (USD per share).
 *   - token feeds are `Crypto.<ticker>X/USD`, asset_type `crypto`,
 *     instrument_type `spot`, exponent -8, 24/7 schedule.
 *   - redemption-rate feeds `Crypto.<ticker>X/<ticker>.RR`,
 *     asset_type `crypto-redemption-rate`, exist for all three pairs and
 *     are the provider-side corroboration for the token price basis.
 *
 * What is NOT yet verified: whether a token feed prices USD per raw token
 * or per scaled (displayed) unit. The symbology metadata does not state
 * the basis, and exchange quote conventions cannot prove it. Until the
 * ingestion daemon observes the token, equity, and redemption-rate feeds
 * together and confirms which relationship holds (token ≈ equity for
 * scaled, token ≈ equity × rate for raw), `tokenUnitBasis` stays null —
 * and per §4.4 rule 1 an unverified basis makes the comparison
 * unavailable. It is never guessed.
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
  /** null until the daemon verifies the basis from live observations. */
  tokenUnitBasis: TokenUnitBasis | null;
  /** Where the mapping came from. */
  basisSource: string;
  /** When the symbology verification happened (ISO date). */
  verifiedAt: string;
}

const SYMBOLOGY_SOURCE =
  'https://pyth.dourolabs.app/v1/symbols (official Pyth Pro symbology API)';
const VERIFIED_AT = '2026-09-17';

type FeedSet = Omit<JesseFeedMapping, 'instrumentId'>;

/** Verified feeds keyed by catalog symbol; instrument ids are resolved
 *  from the catalog itself so the mint provenance has a single source. */
const VERIFIED_FEEDS: Readonly<Record<string, FeedSet>> = {
  AAPLx: {
    equity: { feedId: 922, symbol: 'Equity.US.AAPL/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1792, symbol: 'Crypto.AAPLX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1791, symbol: 'Crypto.AAPLX/AAPL.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: null,
    basisSource: SYMBOLOGY_SOURCE,
    verifiedAt: VERIFIED_AT,
  },
  NVDAx: {
    equity: { feedId: 1314, symbol: 'Equity.US.NVDA/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1833, symbol: 'Crypto.NVDAX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1832, symbol: 'Crypto.NVDAX/NVDA.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: null,
    basisSource: SYMBOLOGY_SOURCE,
    verifiedAt: VERIFIED_AT,
  },
  TSLAx: {
    equity: { feedId: 1435, symbol: 'Equity.US.TSLA/USD', exponent: -5, minChannel: 'fixed_rate@50ms', unit: 'usd-per-share' },
    token: { feedId: 1847, symbol: 'Crypto.TSLAX/USD', exponent: -8, minChannel: 'fixed_rate@200ms' },
    redemptionRate: { feedId: 1846, symbol: 'Crypto.TSLAX/TSLA.RR', exponent: -8, minChannel: 'fixed_rate@200ms' },
    tokenUnitBasis: null,
    basisSource: SYMBOLOGY_SOURCE,
    verifiedAt: VERIFIED_AT,
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

/** Every mapping must point at an instrument the desk actually allows. */
export function feedMappingsAreCatalogBound(): boolean {
  return JESSE_FEED_MAPPINGS.every(mapping =>
    SOLANA_INSTRUMENTS.some(instrument => instrument.id === mapping.instrumentId),
  );
}
