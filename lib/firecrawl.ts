// ============================================
// Firecrawl Integration
// ============================================
// Provides web search, scraping, crawling, mapping, and extraction via Firecrawl API.
// Uses the REST API directly to avoid SDK compatibility issues with Next.js.

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2';
const SANDBASE_BASE_URL = () =>
  (process.env.SANDBASE_BASE_URL || 'https://api.sandbase.ai').replace(/\/+$/, '');
const CRAWL_POLL_INTERVAL_MS = 2000;
const CRAWL_TIMEOUT_MS = 30000;

// ============================================
// Types
// ============================================

export interface FirecrawlSearchResult {
  title: string;
  url: string;
  snippet: string;
  markdown?: string;
  source: string;
}

export interface FirecrawlSearchResponse {
  query: string;
  results: FirecrawlSearchResult[];
  totalResults: number;
  /** Which route served the result — 'native' (Firecrawl) or 'sandbase'. */
  provider?: FirecrawlProvider;
}

// ============================================
// Helpers
// ============================================

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured');
  return key;
}

function getSandbaseKey(): string {
  return process.env.SANDBASE_API_KEY || '';
}

type FetchRoute = 'native' | 'sandbase';

// SandBase can proxy Firecrawl's SYNC endpoints only; crawl / batch-scrape /
// extract are async on SandBase and stay native-only.
const SANDBABLE_PATHS: Record<string, string> = {
  '/search': 'firecrawl/search',
  '/scrape': 'firecrawl/scrape',
  '/map': 'firecrawl/map',
};

/** Ordered routes for a call: keyless routes dropped. */
function routeOrder(): FetchRoute[] {
  const order =
    (process.env.SEARCH_ROUTE_ORDER || '').trim().toLowerCase() === 'sandbase,native'
      ? (['sandbase', 'native'] as const)
      : (['native', 'sandbase'] as const);
  return order.filter((r) =>
    r === 'native' ? !!process.env.FIRECRAWL_API_KEY : !!getSandbaseKey()
  );
}

/** Which route served a response — provenance for "which routes stick". */
export type FirecrawlProvider = 'native' | 'sandbase';

async function nativeFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FIRECRAWL_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function sandbaseFetch<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SANDBASE_BASE_URL()}/v1/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getSandbaseKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SandBase API error ${res.status}: ${text}`);
  }

  const envelope = (await res.json()) as { status?: string; output?: unknown };
  if (envelope?.status !== 'completed' || !envelope.output || typeof envelope.output !== 'object') {
    throw new Error('SandBase response not completed');
  }
  return envelope.output as T;
}

async function firecrawlFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const routed = await firecrawlFetchRouted<T>(path, body);
  return routed.data;
}

async function firecrawlFetchRouted<T>(
  path: string,
  body: Record<string, unknown>
): Promise<{ data: T; provider: FirecrawlProvider }> {
  const sandbaseEndpoint = SANDBABLE_PATHS[path];
  if (!sandbaseEndpoint) {
    // crawl / extract: async on SandBase — native only.
    return { data: await nativeFetch<T>(path, body), provider: 'native' };
  }

  const routes = routeOrder();
  let lastErr: unknown = new Error('no search route configured (FIRECRAWL_API_KEY / SANDBASE_API_KEY)');
  for (const route of routes) {
    try {
      if (route === 'sandbase') {
        // SandBase scrape requires proxy:"basic" alongside url + formats.
        const sbBody =
          path === '/scrape' ? { proxy: 'basic', ...body } : body;
        return {
          data: await sandbaseFetch<T>(sandbaseEndpoint, sbBody),
          provider: 'sandbase',
        };
      }
      return { data: await nativeFetch<T>(path, body), provider: 'native' };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ============================================
// Public API
// ============================================

/**
 * Search the web using Firecrawl Search API.
 * Returns clean, LLM-ready results with optional scraped content.
 */
export async function firecrawlSearch(
  query: string,
  options?: {
    limit?: number;
    scrapeContent?: boolean;
    country?: string;
    lang?: string;
  }
): Promise<FirecrawlSearchResponse> {
  const limit = options?.limit ?? 5;

  const body: Record<string, unknown> = { query, limit };

  if (options?.scrapeContent) {
    body.scrapeOptions = { formats: ['markdown'] };
  }
  if (options?.country) body.country = options.country;
  if (options?.lang) body.lang = options.lang;

  const routed = await firecrawlFetchRouted<any>('/search', body);
  const response = routed.data;

  // API returns { success: true, data: { web: [...] } }
  const webResults = response.data?.web ?? response.web ?? [];

  const results: FirecrawlSearchResult[] = webResults.map((item: any) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.description ?? item.snippet ?? '',
    markdown: item.markdown ?? undefined,
    source: item.url ? new URL(item.url).hostname : 'unknown',
  }));

  return { query, results, totalResults: results.length, provider: routed.provider };
}

/**
 * Scrape a single URL and return clean markdown content.
 */
export async function firecrawlScrape(
  url: string
): Promise<{ url: string; title: string; markdown: string }> {
  const response = await firecrawlFetch<any>('/scrape', {
    url,
    formats: ['markdown'],
  });

  // API returns { success: true, data: { markdown, metadata } }
  const data = response.data ?? response;

  return {
    url: data.metadata?.sourceURL ?? url,
    title: data.metadata?.title ?? '',
    markdown: data.markdown ?? '',
  };
}

/**
 * Crawl a site and return all scraped pages as markdown.
 * Starts an async crawl job and polls until complete.
 */
export async function firecrawlCrawl(
  url: string,
  options?: { maxPages?: number; excludePaths?: string[] }
): Promise<{ url: string; title: string; markdown: string }[]> {
  const limit = options?.maxPages ?? 5;

  const body: Record<string, unknown> = {
    url,
    limit,
    scrapeOptions: { formats: ['markdown'] },
  };
  if (options?.excludePaths) body.excludePaths = options.excludePaths;

  // Start crawl job
  const startRes = await firecrawlFetch<any>('/crawl', body);
  const jobId = startRes.id ?? startRes.jobId;
  if (!jobId) throw new Error('Firecrawl crawl: no job ID returned');

  // Poll until complete
  const start = Date.now();
  while (Date.now() - start < CRAWL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, CRAWL_POLL_INTERVAL_MS));

    const pollRes = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
      headers: { 'Authorization': `Bearer ${getApiKey()}` },
    });
    if (!pollRes.ok) continue;

    const status = await pollRes.json();
    if (status.status === 'completed') {
      const pages = status.data ?? [];
      return pages.map((p: any) => ({
        url: p.metadata?.sourceURL ?? p.url ?? url,
        title: p.metadata?.title ?? '',
        markdown: p.markdown ?? '',
      }));
    }
    if (status.status === 'failed') {
      throw new Error(`Firecrawl crawl failed: ${status.error ?? 'unknown error'}`);
    }
  }

  throw new Error('Firecrawl crawl timed out');
}

/**
 * Map a site — discover all URLs without scraping content.
 */
export async function firecrawlMap(
  url: string,
  options?: { maxLinks?: number }
): Promise<{ url: string; title: string }[]> {
  const body: Record<string, unknown> = {
    url,
    limit: options?.maxLinks ?? 20,
  };

  const response = await firecrawlFetch<any>('/map', body);
  const links = response.data?.links ?? response.links ?? [];

  return links.map((l: any) => ({
    url: l.url ?? l,
    title: l.title ?? '',
  }));
}

/**
 * Extract structured data from one or more URLs using LLM-powered extraction.
 */
export async function firecrawlExtract(
  urls: string[],
  prompt: string
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    urls,
    prompt,
    scrapeOptions: { formats: ['markdown'] },
  };

  const startRes = await firecrawlFetch<any>('/extract', body);
  const jobId = startRes.id ?? startRes.jobId;
  if (!jobId) {
    // Some API versions return data directly
    if (startRes.data) return startRes.data;
    throw new Error('Firecrawl extract: no job ID returned');
  }

  // Poll until complete
  const start = Date.now();
  while (Date.now() - start < CRAWL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, CRAWL_POLL_INTERVAL_MS));

    const pollRes = await fetch(`${FIRECRAWL_API_URL}/extract/${jobId}`, {
      headers: { 'Authorization': `Bearer ${getApiKey()}` },
    });
    if (!pollRes.ok) continue;

    const status = await pollRes.json();
    if (status.status === 'completed') {
      return status.data ?? status;
    }
    if (status.status === 'failed') {
      throw new Error(`Firecrawl extract failed: ${status.error ?? 'unknown error'}`);
    }
  }

  throw new Error('Firecrawl extract timed out');
}

/**
 * Extract URLs from arbitrary text (transcripts, chat messages, etc.)
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>)"']+/gi;
  const matches = text.match(urlRegex) ?? [];
  // Deduplicate and filter out common non-content URLs (images, tracking pixels, etc.)
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const url of matches) {
    const clean = url.replace(/[.,;:!?]+$/, ''); // strip trailing punctuation
    if (seen.has(clean)) continue;
    if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i.test(clean)) continue;
    seen.add(clean);
    filtered.push(clean);
  }
  return filtered;
}
