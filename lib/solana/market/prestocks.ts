/**
 * PreStocks secondary duplex — issuer mark vs issuer token price.
 *
 * Sanctioned Stocklana secondary (build plan contest focus). Not part of
 * Jesse's xStock trading catalog and never files paper. Labels are honest:
 * SPV-backed issuer mark, not a public equity or exchange price. Any
 * fetch/parse failure degrades to unavailable — never synthetic bps.
 */
import { z } from 'zod';

export const PRESTOCKS_API_URL = 'https://prestocks.com/api/prestocks';
export const PRESTOCKS_CACHE_MS = 45_000;

const productSchema = z.object({
  name: z.string().min(1).max(200),
  symbol: z.string().min(1).max(40),
  description: z.string().max(4000).optional().default(''),
  image: z.string().url().optional().nullable(),
  external_url: z.string().url().optional().nullable(),
  contract_address: z.string().min(32).max(44),
  markPrice: z.number().finite(),
  tokenPrice: z.number().finite(),
  markValuation: z.number().finite().optional(),
  impliedValuation: z.number().finite().optional(),
  supply: z.number().finite().optional(),
});

export type PreStockProduct = z.infer<typeof productSchema>;

export type PreStockDuplexStatus = 'comparable' | 'unavailable';

export type PreStockReasonCode =
  | 'issuer-api-unavailable'
  | 'issuer-payload-invalid'
  | 'unknown-symbol'
  | 'nonpositive-price'
  | 'spv-issuer-mark';

export interface PreStockDuplex {
  version: 1;
  source: 'prestocks';
  symbol: string;
  name: string;
  mint: string;
  observedAt: number;
  status: PreStockDuplexStatus;
  markPrice: string | null;
  tokenPrice: string | null;
  referenceDifferenceBps: string | null;
  reasonCodes: PreStockReasonCode[];
  disclaimer: string;
  externalUrl: string | null;
}

export const PRESTOCKS_DISCLAIMER =
  'Issuer-provided SPV mark and token price — not a public equity quote, not an exchange price, and not executable arbitrage.';

const PRESTOCK_REASON_SENTENCES: Record<PreStockReasonCode, string> = {
  'issuer-api-unavailable': 'The PreStocks issuer API could not be reached.',
  'issuer-payload-invalid': 'The PreStocks issuer response could not be verified.',
  'unknown-symbol': 'That PreStock is not on the verified allowlist.',
  'nonpositive-price': 'A non-positive issuer price was refused.',
  'spv-issuer-mark': PRESTOCKS_DISCLAIMER,
};

export function prestockReasonSentence(code: string): string {
  return PRESTOCK_REASON_SENTENCES[code as PreStockReasonCode]
    ?? 'PreStocks evidence is unavailable right now.';
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(6).replace(/\.?0+$/, '') || String(n);
}

/** Reference difference in bps: 10000 × (token/mark − 1), one decimal. */
export function prestockReferenceDifferenceBps(mark: number, token: number): string | null {
  if (!(mark > 0) || !(token > 0) || !Number.isFinite(mark) || !Number.isFinite(token)) return null;
  const bps = 10_000 * (token / mark - 1);
  const rounded = Math.round(bps * 10) / 10;
  return rounded.toFixed(1);
}

export function buildPreStockDuplex(product: PreStockProduct, now = Date.now()): PreStockDuplex {
  const markOk = Number.isFinite(product.markPrice) && product.markPrice > 0;
  const tokenOk = Number.isFinite(product.tokenPrice) && product.tokenPrice > 0;
  const reasonCodes: PreStockReasonCode[] = ['spv-issuer-mark'];
  if (!markOk || !tokenOk) {
    reasonCodes.push('nonpositive-price');
    return {
      version: 1,
      source: 'prestocks',
      symbol: product.symbol,
      name: product.name,
      mint: product.contract_address,
      observedAt: now,
      status: 'unavailable',
      markPrice: markOk ? formatPrice(product.markPrice) : null,
      tokenPrice: tokenOk ? formatPrice(product.tokenPrice) : null,
      referenceDifferenceBps: null,
      reasonCodes,
      disclaimer: PRESTOCKS_DISCLAIMER,
      externalUrl: product.external_url ?? null,
    };
  }
  return {
    version: 1,
    source: 'prestocks',
    symbol: product.symbol,
    name: product.name,
    mint: product.contract_address,
    observedAt: now,
    status: 'comparable',
    markPrice: formatPrice(product.markPrice),
    tokenPrice: formatPrice(product.tokenPrice),
    referenceDifferenceBps: prestockReferenceDifferenceBps(product.markPrice, product.tokenPrice),
    reasonCodes,
    disclaimer: PRESTOCKS_DISCLAIMER,
    externalUrl: product.external_url ?? null,
  };
}

export function unavailablePreStockDuplex(
  symbol: string | null,
  reasons: PreStockReasonCode[],
  now = Date.now(),
): PreStockDuplex {
  const codes = reasons.includes('spv-issuer-mark') ? reasons : (['spv-issuer-mark', ...reasons] as PreStockReasonCode[]);
  return {
    version: 1,
    source: 'prestocks',
    symbol: symbol ?? '',
    name: symbol ?? 'PreStock',
    mint: '',
    observedAt: now,
    status: 'unavailable',
    markPrice: null,
    tokenPrice: null,
    referenceDifferenceBps: null,
    reasonCodes: codes,
    disclaimer: PRESTOCKS_DISCLAIMER,
    externalUrl: null,
  };
}

export function parsePreStockProducts(raw: unknown): PreStockProduct[] {
  if (!Array.isArray(raw)) throw new Error('issuer-payload-invalid');
  const out: PreStockProduct[] = [];
  for (const row of raw) {
    const parsed = productSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length === 0) throw new Error('issuer-payload-invalid');
  return out;
}

type Cache = { at: number; products: PreStockProduct[] };
let cache: Cache | null = null;

export async function fetchPreStockProducts(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<PreStockProduct[]> {
  if (cache && now - cache.at < PRESTOCKS_CACHE_MS) return cache.products;
  const response = await fetchImpl(PRESTOCKS_API_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('issuer-api-unavailable');
  const body: unknown = await response.json();
  const products = parsePreStockProducts(body);
  cache = { at: now, products };
  return products;
}

/** Test helper — clear the module cache between cases. */
export function clearPreStockCache(): void {
  cache = null;
}

export function findPreStockProduct(
  products: readonly PreStockProduct[],
  symbol: string,
): PreStockProduct | null {
  const needle = symbol.trim().toUpperCase();
  if (!needle) return null;
  return products.find(p => p.symbol.toUpperCase() === needle) ?? null;
}

export async function readPreStockDuplex(args: {
  symbol: string | null;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<PreStockDuplex> {
  const now = args.now ?? Date.now();
  let products: PreStockProduct[];
  try {
    products = await fetchPreStockProducts(args.fetchImpl, now);
  } catch (err) {
    const code = err instanceof Error && err.message === 'issuer-payload-invalid'
      ? 'issuer-payload-invalid'
      : 'issuer-api-unavailable';
    return unavailablePreStockDuplex(args.symbol, [code], now);
  }
  if (!args.symbol) {
    /* List mode — return unavailable shell; callers should use products list. */
    return unavailablePreStockDuplex(null, [], now);
  }
  const product = findPreStockProduct(products, args.symbol);
  if (!product) return unavailablePreStockDuplex(args.symbol, ['unknown-symbol'], now);
  return buildPreStockDuplex(product, now);
}
