import { createChainlinkFeedReader, createMarksService, type MarksResult } from '@/lib/trading/marks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stocks/marks
 *
 * Indicative reference marks for the quote-supported instruments —
 * Chainlink total-return observations, never venue offers. Short-lived
 * shared cache so the ambient tape cannot hammer the RPC; a fresh
 * reviewed estimate still goes through /api/stocks/quote.
 *
 * Resilience: while a refresh is in flight the last known tape is served
 * (marked so the client can label it), and if the RPC fails entirely the
 * last known tape is served stale rather than 503 — the tape is ambient
 * reference, so a stale mark with an honest label beats an empty one.
 */

const CACHE_MS = 45_000;
const STALE_LIMIT_MS = 30 * 60_000; // serve last-known-good for at most 30 minutes
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
    // Refresh failed. Serve the last known tape with degraded headers,
    // or an honest JSON 503 when there has never been one.
    if (cached && Date.now() - cached.at < STALE_LIMIT_MS) {
      const staleBody: MarksResult = {
        ...cached.body,
        marks: cached.body.marks.map(mark => ({
          ...mark,
          reference: { ...mark.reference, status: mark.reference.status === 'observed' ? 'stale' : mark.reference.status },
        })),
      };
      return Response.json(staleBody, {
        status: 200,
        headers: { ...headers, 'X-Marks-Stale': 'true', Age: String(Math.floor((Date.now() - cached.at) / 1000)) },
      });
    }
    return Response.json({ error: 'marks_unavailable', message: 'Reference marks are unavailable. Estimates are unaffected.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
