import { OPEN_DESK_ID } from '@/lib/house';
import { serveMarks } from '@/lib/trading/marks-cache';
import type { MarksResult } from '@/lib/trading/marks';

export type { DeskMark, MarksResult } from '@/lib/trading/marks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stocks/marks
 *
 * Legacy path — serves Hetty's desk marks. Prefer /api/desk/[deskId]/marks.
 *
 * Indicative reference marks for the quote-supported instruments —
 * Chainlink total-return observations, never venue offers. Short-lived
 * shared cache so the ambient tape cannot hammer the RPC; a fresh
 * reviewed estimate still goes through the quote endpoint.
 *
 * Resilience: while a refresh is in flight the last known tape is served
 * (marked so the client can label it), and if the RPC fails entirely the
 * last known tape is served stale rather than 503 — the tape is ambient
 * reference, so a stale mark with an honest label beats an empty one.
 */

export async function GET(): Promise<Response> {
  return serveMarks(OPEN_DESK_ID);
}
