/**
 * Robinhood issuer REST client — the keyless `rhj` surface exercised in the
 * venue spike (docs/WORLDS_FAIR_PLAN.md §4a/§4b). Server-side only.
 *
 * `/prices` returns *underlying-equity* bid/ask plus `tokenBid`/`tokenAsk`
 * (multiplier-adjusted server-side, verified across all 194 assets on
 * 2026-10-01: tokenBid / bid == currentMultiplier exactly). These are issuer
 * reference marks — label them as such; they are not onchain observations.
 *
 * The endpoints are undocumented public APIs: keyless today, rate-limited
 * (~60 req/s), 15s price cache. Honor `generatedAt` and `isTradingHalt` —
 * they are first-class fields, not scraped guesses.
 */

const RHJ_BASE = 'https://api.robinhood.com/rhj';
const PRICE_CACHE_MS = 15_000; // server advertises a 15s price cache
const ASSET_CACHE_MS = 300_000; // catalog changes on corporate actions, not seconds

type FetchLike = typeof fetch;

export interface RhjPrice {
  symbol: string;
  bid: number | null;
  ask: number | null;
  tokenBid: number | null;
  tokenAsk: number | null;
  halted: boolean;
  generatedAt: string | null;
  dailyTradingVolume: number | null;
  dailyHigh: number | null;
  dailyLow: number | null;
  currency: string | null;
}

export interface RhjAsset {
  symbol: string;
  name: string;
  contractAddress: string | null;
  chainId: number | null;
  currentMultiplier: string | null;
  status: string;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function parsePrice(symbol: string, row: Record<string, unknown>): RhjPrice {
  return {
    symbol,
    bid: num(row.bid),
    ask: num(row.ask),
    tokenBid: num(row.tokenBid),
    tokenAsk: num(row.tokenAsk),
    halted: row.isTradingHalt === true,
    generatedAt: typeof row.generatedAt === 'string' ? row.generatedAt : null,
    dailyTradingVolume: num(row.dailyTradingVolume),
    dailyHigh: num(row.dailyHigh),
    dailyLow: num(row.dailyLow),
    currency: typeof row.currency === 'string' ? row.currency : null,
  };
}

function parseAsset(row: Record<string, unknown>): RhjAsset | null {
  const symbol = typeof row.tokenSymbol === 'string' ? row.tokenSymbol : null;
  if (!symbol) return null;
  const deployments = Array.isArray(row.deployments) ? row.deployments : [];
  const rh = deployments.find((d): d is Record<string, unknown> =>
    typeof d === 'object' && d !== null && (d as Record<string, unknown>).chainId === 4663);
  return {
    symbol,
    name: typeof row.tokenName === 'string' ? row.tokenName : symbol,
    contractAddress: typeof rh?.contractAddress === 'string' ? rh.contractAddress : null,
    chainId: rh ? 4663 : null,
    currentMultiplier: typeof row.currentMultiplier === 'string' ? row.currentMultiplier : null,
    status: typeof row.status === 'string' ? row.status : 'UNKNOWN',
  };
}

let pricesCache: { at: number; bySymbol: Map<string, RhjPrice> } | null = null;
let assetsCache: { at: number; bySymbol: Map<string, RhjAsset> } | null = null;

/** Test helper. */
export function clearRhjCache(): void {
  pricesCache = null;
  assetsCache = null;
}

/** Bulk read — the whole book in one call (~99KB); prices map by symbol. */
export async function fetchRhjPrices(fetchImpl: FetchLike = fetch): Promise<Map<string, RhjPrice>> {
  const now = Date.now();
  if (pricesCache && now - pricesCache.at < PRICE_CACHE_MS) return pricesCache.bySymbol;
  const res = await fetchImpl(`${RHJ_BASE}/prices`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error('provider-unavailable');
  const body = await res.json();
  const rows: unknown[] = Array.isArray(body) ? body
    : Array.isArray(body?.quotes) ? body.quotes
    : Array.isArray(body?.prices) ? body.prices
    : [];
  const bySymbol = new Map<string, RhjPrice>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const rec = row as Record<string, unknown>;
    const symbol = typeof rec.symbol === 'string' ? rec.symbol : typeof rec.tokenSymbol === 'string' ? rec.tokenSymbol : null;
    if (symbol) bySymbol.set(symbol, parsePrice(symbol, rec));
  }
  pricesCache = { at: now, bySymbol };
  return bySymbol;
}

/** Issuer catalog — status/multiplier/contract per symbol (4663 deployment). */
export async function fetchRhjAssets(fetchImpl: FetchLike = fetch): Promise<Map<string, RhjAsset>> {
  const now = Date.now();
  if (assetsCache && now - assetsCache.at < ASSET_CACHE_MS) return assetsCache.bySymbol;
  const res = await fetchImpl(`${RHJ_BASE}/assets`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error('provider-unavailable');
  const body = await res.json();
  const rows: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.assets) ? body.assets : [];
  const bySymbol = new Map<string, RhjAsset>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const asset = parseAsset(row as Record<string, unknown>);
    if (asset) bySymbol.set(asset.symbol, asset);
  }
  assetsCache = { at: now, bySymbol };
  return bySymbol;
}
