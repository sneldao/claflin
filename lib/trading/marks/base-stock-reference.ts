/**
 * Base stock reference — Hetty's "what's the underlying equity trading at"
 * service.
 *
 * Why this exists: the board's most-differentiated cell is the gap
 * between the tokenized stock (B20c on Base) and its underlying equity
 * (NVDA, AAPL, etc). Jesse has this via the venue-duplex reads; Isabel
 * has this via the rhj `/prices` endpoint; Hetty doesn't.
 *
 * The plan's candidates for the Base stock reference are:
 *   1. A Base equity Chainlink feed (if one is published).
 *   2. Pyth for the underlying (publisher-attested US-equity feeds exist).
 *   3. Coinbase Exchange REST for the underlying spot price.
 *
 * This module implements candidate (3) first because it is keyless,
 * a successful response must identify a fresh provider observation.
 * Product availability is not assumed: missing tickers remain unavailable.
 * Candidates (1) and (2) plug in as alternative
 * sources — the contract is the same.
 *
 * Honesty posture: this is the underlying-equity price, not the
 * tokenized product. The board surfaces it as "stock ref," labelled
 * with source and freshness. When the read fails or is stale, the
 * cell reads `—` with the existing "no stock reference on this rail
 * yet" note — never a fake.
 */

import { DESK_INSTRUMENTS, type DeskInstrument } from '../catalog';

/** A single read of the underlying equity's spot price. */
export interface BaseStockReference {
  /** The instrument id, e.g. "8453:0xb200…00078ee7…". */
  instrumentId: string;
  /** The tokenized ticker on Base, e.g. "NVDAc". */
  symbol: string;
  /** The underlying equity ticker, e.g. "NVDA". */
  underlyingSymbol: string;
  /** Spot price of the underlying equity in USD, as a decimal string. */
  priceUsd: string;
  /** Provider's last-trade timestamp, ms-since-epoch, not receipt time. */
  observedAt: number;
  /** The source of the read. */
  source: 'coinbase-exchange';
}

/** The reason a read failed. Honest categories, not a stack trace. */
export type BaseStockReferenceError =
  | { kind: 'no-underlying-mapping'; symbol: string }
  | { kind: 'transport'; message: string }
  | { kind: 'bad-response'; message: string }
  | { kind: 'stale'; observedAt: number; maxAgeMs: number };

/** The contract every read returns. */
export type BaseStockReferenceResult =
  | { kind: 'ok'; value: BaseStockReference }
  | { kind: 'unavailable'; reason: BaseStockReferenceError };

/** The Coinbase Exchange product id is "<TICKER>-USD". */
function coinbaseProductId(underlying: string): string {
  return `${underlying.toUpperCase()}-USD`;
}

/**
 * A single read of the Coinbase Exchange ticker endpoint. The response is
 * `{ price: string, time: string }` — the price is the last trade in USD.
 *
 * The endpoint is keyless public data; we still set a conservative
 * timeout to keep the tape responsive.
 */
export async function readCoinbaseExchangeTicker(
  productId: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4_000,
): Promise<{ priceUsd: string; observedAt: number } | { error: 'transport' | 'bad-response'; message: string }> {
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/ticker`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: controller.signal, headers: { 'User-Agent': 'claflin/1.0 (+https://claflin.trustfall.xyz)' } });
    if (!res.ok) {
      return { error: 'bad-response', message: `Coinbase Exchange returned ${res.status} for ${productId}` };
    }
    const body = await res.json() as unknown;
    if (typeof body !== 'object' || body === null) {
      return { error: 'bad-response', message: 'Coinbase Exchange returned a non-object body' };
    }
    const price = (body as Record<string, unknown>).price;
    if (typeof price !== 'string' && typeof price !== 'number') {
      return { error: 'bad-response', message: 'Coinbase Exchange response missing "price" field' };
    }
    const asNumber = Number(price);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
      return { error: 'bad-response', message: 'Coinbase Exchange price is not a positive number' };
    }
    const time = (body as Record<string, unknown>).time;
    const observedAt = typeof time === 'string' ? Date.parse(time) : NaN;
    if (!Number.isFinite(observedAt) || observedAt <= 0) {
      return { error: 'bad-response', message: 'Coinbase Exchange response missing a valid observation time' };
    }
    return { priceUsd: asNumber.toString(), observedAt };
  } catch (err) {
    return { error: 'transport', message: err instanceof Error ? err.message : 'transport error' };
  } finally {
    clearTimeout(timer);
  }
}

/** The freshness window — if a read is older than this, label it stale. */
export const DEFAULT_MAX_AGE_MS = 5 * 60_000; // 5 min

/**
 * Read the underlying-equity stock reference for a single Base instrument.
 * Returns an honest result, not a number — the caller decides how to label
 * `unavailable` on the board.
 */
export async function readBaseStockReference(
  instrument: DeskInstrument,
  options: {
    fetcher?: typeof fetch;
    maxAgeMs?: number;
    now?: number;
    clock?: () => number;
  } = {},
): Promise<BaseStockReferenceResult> {
  const fetcher = options.fetcher ?? fetch;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const clock = options.clock ?? (() => options.now ?? Date.now());
  const productId = coinbaseProductId(instrument.underlyingSymbol);
  const read = await readCoinbaseExchangeTicker(productId, fetcher);
  if ('error' in read) {
    return { kind: 'unavailable', reason: { kind: read.error, message: read.message } };
  }
  const now = clock();
  if (read.observedAt > now) {
    return { kind: 'unavailable', reason: { kind: 'bad-response', message: 'Stock reference observation is in the future' } };
  }
  if (now - read.observedAt > maxAgeMs) {
    return { kind: 'unavailable', reason: { kind: 'stale', observedAt: read.observedAt, maxAgeMs } };
  }
  return {
    kind: 'ok',
    value: {
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      underlyingSymbol: instrument.underlyingSymbol,
      priceUsd: read.priceUsd,
      observedAt: read.observedAt,
      source: 'coinbase-exchange',
    },
  };
}

/** Read references for every Base instrument in parallel. */
export async function readAllBaseStockReferences(
  options: { fetcher?: typeof fetch; maxAgeMs?: number; now?: number } = {},
): Promise<Map<string, BaseStockReferenceResult>> {
  const out = new Map<string, BaseStockReferenceResult>();
  await Promise.all(
    DESK_INSTRUMENTS.map(async instrument => {
      out.set(instrument.id, await readBaseStockReference(instrument, options));
    }),
  );
  return out;
}

/**
 * Pure helper: the difference between the onchain token mark and the
 * underlying-equity reference, in basis points. Returns null when either
 * leg is missing or zero.
 */
export function referenceDifferenceBps(
  tokenMarkUsd: string | null | undefined,
  stockRefUsd: string | null,
  multiplierRaw: bigint | null = null,
): string | null {
  if (tokenMarkUsd == null || stockRefUsd === null || multiplierRaw === null || multiplierRaw <= 0n) return null;
  const t = Number(tokenMarkUsd);
  const s = Number(stockRefUsd);
  const multiplier = Number(multiplierRaw) / 1e18;
  if (!Number.isFinite(t) || !Number.isFinite(s) || t <= 0 || s <= 0 || !Number.isFinite(multiplier)) return null;
  const diff = (t / (s * multiplier) - 1) * 10_000;
  if (!Number.isFinite(diff)) return null;
  // one decimal place, like Jesse's adapter
  return (Math.round(diff * 10) / 10).toFixed(1);
}