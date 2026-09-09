import { serveMarks } from '@/lib/trading/marks-cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desk/[deskId]/marks
 *
 * Desk-routed reference marks. The desk resolves to its market and feed
 * adapter; a planned desk answers `desk_unavailable`. Resilience matches
 * the ambient tape contract: last-known-good served stale, honest 503
 * only when there has never been one.
 */

export async function GET(_req: Request, ctx: { params: Promise<{ deskId: string }> }): Promise<Response> {
  const { deskId } = await ctx.params;
  return serveMarks(deskId);
}
