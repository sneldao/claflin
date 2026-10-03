/**
 * Lighter domain venue client — the Robinhood Chain instance
 * (`https://api.rh.lighter.xyz`, verified live 2026-10-01). Server-side only.
 *
 * Reads are public and keyless; order placement is a Lighter account
 * relationship and out of scope for the paper desk (docs/ELIGIBILITY.md §5).
 * The books quote `<SYM>/USDG` spot with market-makers posting real depth —
 * SPY printed $1.17M / 8,356 trades in 24h at verification while tail names
 * ran thin. Depth is evidence, not a promise: the walker reports what the
 * visible book could actually fill and says so when it could not.
 */

import { USDG_DECIMALS } from './contracts';

export const LIGHTER_API_BASE = 'https://api.rh.lighter.xyz';
const BOOK_DEPTH_LEVELS = 50;

type FetchLike = typeof fetch;

export interface LighterMarket {
  symbol: string;          // e.g. 'NVDA/USDG'
  marketId: number;
  marketType: 'spot' | 'perp' | string;
  status: string;
  minBaseAmount: string | null;
  minQuoteAmount: string | null;
  sizeDecimals: number;    // supported_size_decimals
  priceDecimals: number;   // supported_price_decimals
  quoteDecimals: number;   // supported_quote_decimals
  /** Corporate-action multiplier carried natively by the venue. */
  multiplier: string | null;
}

export interface LighterLevel {
  /** USDG per token, decimal string at priceDecimals. */
  price: string;
  /** Token quantity remaining at the level, at sizeDecimals. */
  remainingBase: string;
}

export interface LighterBook {
  bids: LighterLevel[];
  asks: LighterLevel[];
}

export interface LighterBookStats {
  marketId: number;
  lastTradePrice: string | null;
  dailyTradesCount: number | null;
  dailyQuoteVolume: string | null;  // USDG, decimal string
  dailyBaseVolume: string | null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function int(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

function parseMarket(row: Record<string, unknown>): LighterMarket | null {
  const marketId = int(row.market_id);
  const symbol = str(row.symbol);
  if (marketId === null || !symbol) return null;
  return {
    symbol,
    marketId,
    marketType: str(row.market_type) ?? 'spot',
    status: str(row.status) ?? 'unknown',
    minBaseAmount: str(row.min_base_amount),
    minQuoteAmount: str(row.min_quote_amount),
    sizeDecimals: int(row.supported_size_decimals) ?? 4,
    priceDecimals: int(row.supported_price_decimals) ?? 2,
    quoteDecimals: int(row.supported_quote_decimals) ?? USDG_DECIMALS,
    multiplier: str(row.multiplier),
  };
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error('venue-unavailable');
  return res.json();
}

export async function fetchLighterMarkets(fetchImpl: FetchLike = fetch): Promise<LighterMarket[]> {
  const body = await getJson(`${LIGHTER_API_BASE}/api/v1/orderBooks`, fetchImpl) as Record<string, unknown>;
  const rows = Array.isArray(body?.order_books) ? body.order_books : [];
  return rows
    .map(row => (typeof row === 'object' && row !== null ? parseMarket(row as Record<string, unknown>) : null))
    .filter((m): m is LighterMarket => m !== null);
}

export async function fetchLighterBook(
  marketId: number,
  fetchImpl: FetchLike = fetch,
  limit = BOOK_DEPTH_LEVELS,
): Promise<LighterBook> {
  const body = await getJson(
    `${LIGHTER_API_BASE}/api/v1/orderBookOrders?market_id=${marketId}&limit=${limit}`,
    fetchImpl,
  ) as Record<string, unknown>;
  const levels = (side: unknown): LighterLevel[] =>
    (Array.isArray(side) ? side : [])
      .map(l => {
        const rec = typeof l === 'object' && l !== null ? (l as Record<string, unknown>) : {};
        const price = str(rec.price);
        const remainingBase = str(rec.remaining_base_amount);
        return price && remainingBase ? { price, remainingBase } : null;
      })
      .filter((l): l is LighterLevel => l !== null);
  return { bids: levels(body?.bids), asks: levels(body?.asks) };
}

export async function fetchLighterBookStats(fetchImpl: FetchLike = fetch): Promise<Map<number, LighterBookStats>> {
  const body = await getJson(`${LIGHTER_API_BASE}/api/v1/orderBookDetails`, fetchImpl) as Record<string, unknown>;
  const rows = [
    ...(Array.isArray(body?.order_book_details) ? body.order_book_details : []),
    ...(Array.isArray(body?.spot_order_book_details) ? body.spot_order_book_details : []),
  ];
  const map = new Map<number, LighterBookStats>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const rec = row as Record<string, unknown>;
    const marketId = int(rec.market_id);
    if (marketId === null) continue;
    map.set(marketId, {
      marketId,
      lastTradePrice: str(rec.last_trade_price),
      dailyTradesCount: int(rec.daily_trades_count),
      dailyQuoteVolume: str(rec.daily_quote_token_volume),
      dailyBaseVolume: str(rec.daily_base_token_volume),
    });
  }
  return map;
}

/* --- Fixed-point book walking ---
 * Level values arrive as decimal strings at the market's declared decimals
 * (priceDecimals / sizeDecimals). All math is bigint fixed-point; nothing
 * rounds through a float. USDG raw is 1e6 scale. */

/** Decimal string → bigint at `scale` decimals; null when malformed or more
 *  precise than the venue declares. */
export function decimalToScaled(value: string, scale: number): bigint | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = (m[2] ?? '');
  if (frac.length > scale) return null;
  return BigInt(m[1]) * 10n ** BigInt(scale) + BigInt((frac + '0'.repeat(scale)).slice(0, scale) || '0');
}

const TEN = (n: number) => 10n ** BigInt(n);

export interface BookWalk {
  /** Output units in the *received* asset's raw scale (token 1e18 for buys,
   *  USDG 1e6 for sells). */
  outRaw: bigint;
  /** Input consumed, in the input asset's raw scale. */
  spentRaw: bigint;
  unfilledInputRaw: bigint;
  filledFully: boolean;
  levelsConsumed: number;
  bestBid: string | null;
  bestAsk: string | null;
  midPrice: string | null;
  spreadBps: string | null;
}

export function topOfBook(book: LighterBook) {
  const bestBid = book.bids[0]?.price ?? null;
  const bestAsk = book.asks[0]?.price ?? null;
  const bid = bestBid !== null ? Number(bestBid) : NaN;
  const ask = bestAsk !== null ? Number(bestAsk) : NaN;
  const midPrice = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0
    ? ((bid + ask) / 2).toPrecision(12)
    : null;
  const spreadBps = midPrice && ask > bid
    ? (Math.round(((ask - bid) / bid) * 1e7) / 10).toFixed(1)
    : null;
  return { bestBid, bestAsk, midPrice, spreadBps };
}

function walk(levels: LighterLevel[], inputRaw: bigint, market: Pick<LighterMarket, 'sizeDecimals' | 'priceDecimals'>, book: LighterBook): BookWalk {
  const top = topOfBook(book);
  const pScale = TEN(market.priceDecimals);   // price units per USDG-per-token
  const qScale = TEN(market.sizeDecimals);    // size units per token
  const quoteScale = TEN(USDG_DECIMALS);      // 1e6 per USDG
  const tokenScale = TEN(18);                 // 1e18 per token

  let outRaw = 0n;
  let spentRaw = 0n;
  let levelsConsumed = 0;
  let remaining = inputRaw;
  const buying = levels === book.asks;

  for (const level of levels) {
    if (remaining <= 0n) break;
    const pRaw = decimalToScaled(level.price, market.priceDecimals);
    const qRaw = decimalToScaled(level.remainingBase, market.sizeDecimals);
    if (pRaw === null || qRaw === null || pRaw <= 0n || qRaw <= 0n) continue;

    if (buying) {
      /* Buy: remaining is USDG-raw. Level cost = p·q → quoteScale. */
      const levelCost = pRaw * qRaw * quoteScale / (pScale * qScale);
      const spend = remaining < levelCost ? remaining : levelCost;
      /* tokens bought = spend / price → tokenScale */
      const tokens = spend * pScale * tokenScale / (pRaw * quoteScale);
      spentRaw += spend;
      outRaw += tokens;
      remaining -= spend;
    } else {
      /* Sell: remaining is token-raw. Level capacity is qRaw (sizeDecimals). */
      const inQty = remaining * qScale / tokenScale;
      const fillQty = inQty < qRaw ? inQty : qRaw;
      if (fillQty <= 0n) break;
      spentRaw += fillQty * tokenScale / qScale;
      outRaw += pRaw * fillQty * quoteScale / (pScale * qScale);
      remaining -= fillQty * tokenScale / qScale;
    }
    levelsConsumed++;
  }
  return {
    outRaw,
    spentRaw,
    unfilledInputRaw: remaining,
    filledFully: remaining <= 0n,
    levelsConsumed,
    ...top,
  };
}

/** Buy: walk the asks with a USDG spend; receive token-raw (1e18). */
export function walkAsks(book: LighterBook, spendUsdGRaw: bigint, market: Pick<LighterMarket, 'sizeDecimals' | 'priceDecimals'>): BookWalk {
  return walk(book.asks, spendUsdGRaw, market, book);
}

/** Sell: walk the bids with a token quantity (1e18 raw); receive USDG-raw. */
export function walkBids(book: LighterBook, tokenRaw: bigint, market: Pick<LighterMarket, 'sizeDecimals' | 'priceDecimals'>): BookWalk {
  return walk(book.bids, tokenRaw, market, book);
}
