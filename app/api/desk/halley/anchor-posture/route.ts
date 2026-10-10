import { busyResponse, requestBudget } from '@/lib/trading/http';
import { resolveAnchor } from '@/lib/meteora/anchor';
import { HALLEY_PAPER_ENABLED } from '@/lib/meteora/flags';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/halley/anchor-posture?anchor=NVDA
 *
 * Which basis would anchor a launch right now — the equity mark while the
 * tape is awake, or the live onchain venue mark while it rests — with the
 * resting-equity gap carried as evidence. Indicative posture for the slip;
 * the estimate remains the authoritative reading.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  if (!HALLEY_PAPER_ENABLED) {
    return Response.json({ error: 'desk_unavailable', message: 'Halley’s launch desk is not open on this deployment.' }, { status: 422, headers });
  }
  const symbol = (new URL(req.url).searchParams.get('anchor') ?? '').trim().toUpperCase();
  if (!SOLANA_INSTRUMENTS.some(i => i.underlyingSymbol === symbol)) {
    return Response.json(
      { error: 'invalid_request', message: 'Anchor must be one of the desk’s verified equities.' },
      { status: 400, headers },
    );
  }
  const resolved = await resolveAnchor(symbol, 'USDC');
  const observed = resolved?.status === 'observed';
  return Response.json({
    symbol,
    basis: observed ? resolved!.source : 'none',
    markUsd: observed ? resolved!.equityUsd : null,
    restingEquityUsd: resolved?.restingEquity?.equityUsd
      ?? (resolved && !observed && Number(resolved.equityUsd) > 0 ? resolved.equityUsd : null),
    differenceBps: resolved?.restingEquity?.differenceBps ?? null,
    observedAt: resolved?.observedAt ?? null,
  }, { headers });
}
