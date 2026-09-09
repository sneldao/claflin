import { TradingError } from './domain';
import { markAdapterFor } from './adapters';
import type { MarksResult } from './marks-shared';

/**
 * Ambient reference-mark serving with per-desk caches. While a refresh is
 * in flight the last known tape is served; if the feed fails entirely the
 * last known tape is served stale rather than 503 — the tape is ambient
 * reference, so a stale mark with an honest label beats an empty one.
 */

const CACHE_MS = 45_000;
const STALE_LIMIT_MS = 30 * 60_000; // serve last-known-good for at most 30 minutes

const cached = new Map<string, { at: number; body: MarksResult }>();
const pending = new Map<string, Promise<MarksResult>>();

async function load(deskId: string): Promise<MarksResult> {
  let flight = pending.get(deskId);
  if (!flight) {
    flight = markAdapterFor(deskId).read().finally(() => { pending.delete(deskId); });
    pending.set(deskId, flight);
  }
  return flight;
}

function staleBody(body: MarksResult): MarksResult {
  return {
    ...body,
    marks: body.marks.map(mark => ({
      ...mark,
      reference: { ...mark.reference, status: mark.reference.status === 'observed' ? 'stale' : mark.reference.status },
    })),
  };
}

export async function serveMarks(deskId: string): Promise<Response> {
  const key = deskId.toLowerCase();
  const headers = { 'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=120' };
  try {
    const hit = cached.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return Response.json(hit.body, { headers });
    }
    const body = await load(key);
    cached.set(key, { at: Date.now(), body });
    return Response.json(body, { headers });
  } catch (error) {
    if (error instanceof TradingError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    const hit = cached.get(key);
    if (hit && Date.now() - hit.at < STALE_LIMIT_MS) {
      return Response.json(staleBody(hit.body), {
        status: 200,
        headers: { ...headers, 'X-Marks-Stale': 'true', Age: String(Math.floor((Date.now() - hit.at) / 1000)) },
      });
    }
    return Response.json({ error: 'marks_unavailable', message: 'Reference marks are unavailable. Estimates are unaffected.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
