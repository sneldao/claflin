import { createChainlinkFeedReader, createMarksService, type MarksResult } from '@/lib/trading/marks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stocks/marks
 *
 * Indicative reference marks for the quote-supported instruments —
 * Chainlink total-return observations, never venue offers. Short-lived
 * shared cache so the ambient tape cannot hammer the RPC; a fresh
 * reviewed estimate still goes through /api/stocks/quote.
 */

const CACHE_MS = 45_000;
let cached: { at: number; body: MarksResult } | null = null;
let pending: Promise<MarksResult> | null = null;

async function load(): Promise<MarksResult> {
  pending ??= createMarksService(createChainlinkFeedReader())().finally(() => { pending = null; });
  return pending;
}

export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=120' };
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Response.json(cached.body, { headers });
  }
  try {
    const body = await load();
    cached = { at: Date.now(), body };
    return Response.json(body, { headers });
  } catch {
    return Response.json({ error: 'marks_unavailable', message: 'Reference marks are unavailable. Estimates are unaffected.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
