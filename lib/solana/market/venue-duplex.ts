/**
 * Free xStock duplex — issuer/stock reference versus Solana venue USD.
 *
 * Replaces Pyth Pro for Stocklana demo evidence without inventing Pro numbers:
 *   - Issuer leg: Backed/xStocks public `price-data` when `quote` is present
 *   - Fallback reference: Jupiter Price v3 `stockData.price` (xStocks id)
 *   - Venue leg: Jupiter Price v3 `usdPrice` for the catalog mint
 *
 * Never labelled as Pyth. Never called arbitrage. Unavailable when either
 * comparable leg is missing — same honesty grammar as PreStocks/Pyth paths.
 */

import { getSolanaInstrument, SOLANA_INSTRUMENTS } from '../catalog';
import { isSolanaInstrumentId, type SolanaInstrumentId } from '../contracts';

export const BACKED_PRICE_URL = 'https://api.xstocks.fi/api/v2/public/assets';
export const JUPITER_PRICE_V3_URL = 'https://api.jup.ag/price/v3';
export const VENUE_DUPLEX_CACHE_MS = 30_000;

export type VenueDuplexStatus = 'comparable' | 'unavailable';

export type VenueDuplexReasonCode =
  | 'issuer-quote-unavailable'
  | 'venue-price-unavailable'
  | 'unknown-instrument'
  | 'nonpositive-price'
  | 'provider-unavailable'
  | 'issuer-indicative'
  | 'jupiter-stock-reference';

export type VenueReferenceSource = 'backed' | 'jupiter-stock-data';

export interface VenueDuplex {
  version: 1;
  source: 'venue-duplex';
  instrumentId: SolanaInstrumentId;
  symbol: string;
  mint: string;
  observedAt: number;
  status: VenueDuplexStatus;
  referencePrice: string | null;
  referenceSource: VenueReferenceSource | null;
  venuePrice: string | null;
  venueSource: 'jupiter-price-v3';
  referenceDifferenceBps: string | null;
  reasonCodes: VenueDuplexReasonCode[];
  disclaimer: string;
}

export const VENUE_DUPLEX_DISCLAIMER =
  'Issuer or xStocks stock reference versus Solana venue USD — not a Pyth Pro reading, not an exchange print, and not executable arbitrage.';

const REASON_SENTENCES: Record<VenueDuplexReasonCode, string> = {
  'issuer-quote-unavailable': 'The Backed issuer price-data quote was null or unreachable; no issuer number is shown.',
  'venue-price-unavailable': 'Jupiter Price could not provide a venue USD reading for this mint.',
  'unknown-instrument': 'That instrument is outside Jesse’s verified xStock catalog.',
  'nonpositive-price': 'A non-positive price was refused.',
  'provider-unavailable': 'A market-data provider could not be reached.',
  'issuer-indicative': 'Backed public price-data is an issuer indicative quote, not a NYSE tape print.',
  'jupiter-stock-reference': 'Stock reference is Jupiter Price stockData (xStocks), used when the issuer quote is unavailable.',
};

export function venueDuplexReasonSentence(code: string): string {
  return REASON_SENTENCES[code as VenueDuplexReasonCode]
    ?? 'Venue duplex evidence is unavailable right now.';
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(6).replace(/\.?0+$/, '') || String(n);
}

/** Reference difference in bps: 10000 × (venue/reference − 1), one decimal. */
export function venueReferenceDifferenceBps(reference: number, venue: number): string | null {
  if (!(reference > 0) || !(venue > 0) || !Number.isFinite(reference) || !Number.isFinite(venue)) return null;
  const bps = 10_000 * (venue / reference - 1);
  const rounded = Math.round(bps * 10) / 10;
  return rounded.toFixed(1);
}

export function unavailableVenueDuplex(
  instrumentId: SolanaInstrumentId | null,
  reasons: VenueDuplexReasonCode[],
  now = Date.now(),
): VenueDuplex {
  const instrument = instrumentId && isSolanaInstrumentId(instrumentId)
    ? SOLANA_INSTRUMENTS.find(i => i.id === instrumentId) ?? null
    : null;
  const codes = reasons.includes('issuer-indicative') || reasons.includes('jupiter-stock-reference')
    ? reasons
    : (['issuer-indicative', ...reasons] as VenueDuplexReasonCode[]);
  return {
    version: 1,
    source: 'venue-duplex',
    instrumentId: (instrument?.id ?? instrumentId ?? 'sol:') as SolanaInstrumentId,
    symbol: instrument?.symbol ?? '',
    mint: instrument?.mint ?? '',
    observedAt: now,
    status: 'unavailable',
    referencePrice: null,
    referenceSource: null,
    venuePrice: null,
    venueSource: 'jupiter-price-v3',
    referenceDifferenceBps: null,
    reasonCodes: codes,
    disclaimer: VENUE_DUPLEX_DISCLAIMER,
  };
}

export function buildVenueDuplex(args: {
  instrumentId: SolanaInstrumentId;
  referencePrice: number;
  referenceSource: VenueReferenceSource;
  venuePrice: number;
  now?: number;
}): VenueDuplex {
  const now = args.now ?? Date.now();
  const instrument = getSolanaInstrument(args.instrumentId);
  const reasonCodes: VenueDuplexReasonCode[] = args.referenceSource === 'backed'
    ? ['issuer-indicative']
    : ['jupiter-stock-reference'];
  const refOk = Number.isFinite(args.referencePrice) && args.referencePrice > 0;
  const venueOk = Number.isFinite(args.venuePrice) && args.venuePrice > 0;
  if (!refOk || !venueOk) {
    if (!refOk) reasonCodes.push(args.referenceSource === 'backed' ? 'issuer-quote-unavailable' : 'nonpositive-price');
    if (!venueOk) reasonCodes.push('venue-price-unavailable');
    return {
      version: 1,
      source: 'venue-duplex',
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      mint: instrument.mint,
      observedAt: now,
      status: 'unavailable',
      referencePrice: refOk ? formatPrice(args.referencePrice) : null,
      referenceSource: refOk ? args.referenceSource : null,
      venuePrice: venueOk ? formatPrice(args.venuePrice) : null,
      venueSource: 'jupiter-price-v3',
      referenceDifferenceBps: null,
      reasonCodes,
      disclaimer: VENUE_DUPLEX_DISCLAIMER,
    };
  }
  return {
    version: 1,
    source: 'venue-duplex',
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    mint: instrument.mint,
    observedAt: now,
    status: 'comparable',
    referencePrice: formatPrice(args.referencePrice),
    referenceSource: args.referenceSource,
    venuePrice: formatPrice(args.venuePrice),
    venueSource: 'jupiter-price-v3',
    referenceDifferenceBps: venueReferenceDifferenceBps(args.referencePrice, args.venuePrice),
    reasonCodes,
    disclaimer: VENUE_DUPLEX_DISCLAIMER,
  };
}

type FetchLike = typeof fetch;

type CacheEntry = { at: number; duplex: VenueDuplex };
const cache = new Map<string, CacheEntry>();

/** Test helper. */
export function clearVenueDuplexCache(): void {
  cache.clear();
}

export async function fetchBackedQuote(
  symbol: string,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  const res = await fetchImpl(`${BACKED_PRICE_URL}/${encodeURIComponent(symbol)}/price-data`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error('provider-unavailable');
  const body = await res.json() as { quote?: unknown };
  if (body.quote === null || body.quote === undefined) return null;
  if (typeof body.quote !== 'number' || !Number.isFinite(body.quote)) throw new Error('provider-unavailable');
  return body.quote;
}

export async function fetchJupiterVenuePrice(
  mint: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ venuePrice: number; stockReference: number | null }> {
  const res = await fetchImpl(`${JUPITER_PRICE_V3_URL}?ids=${encodeURIComponent(mint)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error('provider-unavailable');
  const body = await res.json() as Record<string, {
    usdPrice?: unknown;
    stockData?: { price?: unknown } | null;
  } | undefined>;
  const row = body[mint];
  if (!row || typeof row.usdPrice !== 'number' || !Number.isFinite(row.usdPrice)) {
    throw new Error('venue-price-unavailable');
  }
  const stock = row.stockData?.price;
  const stockReference = typeof stock === 'number' && Number.isFinite(stock) ? stock : null;
  return { venuePrice: row.usdPrice, stockReference };
}

export async function readVenueDuplex(args: {
  instrumentId: string;
  fetchImpl?: FetchLike;
  now?: number;
}): Promise<VenueDuplex> {
  const now = args.now ?? Date.now();
  if (!isSolanaInstrumentId(args.instrumentId)) {
    return unavailableVenueDuplex(null, ['unknown-instrument'], now);
  }
  let instrument;
  try {
    instrument = getSolanaInstrument(args.instrumentId);
  } catch {
    return unavailableVenueDuplex(args.instrumentId, ['unknown-instrument'], now);
  }

  const cached = cache.get(instrument.id);
  if (cached && now - cached.at < VENUE_DUPLEX_CACHE_MS) return cached.duplex;

  const fetchImpl = args.fetchImpl ?? fetch;
  let backedQuote: number | null = null;
  let backedFailed = false;
  try {
    backedQuote = await fetchBackedQuote(instrument.symbol, fetchImpl);
  } catch {
    backedFailed = true;
  }

  let jupiter: { venuePrice: number; stockReference: number | null };
  try {
    jupiter = await fetchJupiterVenuePrice(instrument.mint, fetchImpl);
  } catch (err) {
    const code = err instanceof Error && err.message === 'venue-price-unavailable'
      ? 'venue-price-unavailable' as const
      : 'provider-unavailable' as const;
    const duplex = unavailableVenueDuplex(instrument.id, [code], now);
    return duplex;
  }

  let referencePrice: number | null = null;
  let referenceSource: VenueReferenceSource | null = null;
  if (backedQuote !== null && backedQuote > 0) {
    referencePrice = backedQuote;
    referenceSource = 'backed';
  } else if (jupiter.stockReference !== null && jupiter.stockReference > 0) {
    referencePrice = jupiter.stockReference;
    referenceSource = 'jupiter-stock-data';
  }

  if (referencePrice === null || referenceSource === null) {
    const reasons: VenueDuplexReasonCode[] = ['issuer-quote-unavailable'];
    if (backedFailed) reasons.push('provider-unavailable');
    return unavailableVenueDuplex(instrument.id, reasons, now);
  }

  const duplex = buildVenueDuplex({
    instrumentId: instrument.id,
    referencePrice,
    referenceSource,
    venuePrice: jupiter.venuePrice,
    now,
  });
  cache.set(instrument.id, { at: now, duplex });
  return duplex;
}
