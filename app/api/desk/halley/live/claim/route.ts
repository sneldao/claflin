import { prepareHalleyClaim } from '@/lib/meteora/live-tx';
import { halleyLiveEnabled } from '@/lib/meteora/flags';
import { TradingError } from '@/lib/trading/domain';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(30);

/**
 * POST /api/desk/halley/live/claim
 * Body: { pool, wallet }
 * Returns a HalleyTxProposal — the launcher collects accrued curve
 * trading fees. Only the config fee claimer may prepare it.
 */
export async function POST(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!halleyLiveEnabled()) {
    return Response.json(
      { error: 'desk_unavailable', message: 'Halley live trading is not enabled on this deployment.' },
      { status: 403, headers },
    );
  }
  if (!budget()) return busyResponse();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid_request', message: 'Expected JSON body.' }, { status: 400, headers });
  }
  try {
    const proposal = await prepareHalleyClaim({
      pool: typeof body.pool === 'string' ? body.pool : '',
      wallet: typeof body.wallet === 'string' ? body.wallet : '',
    });
    return Response.json(proposal, { headers });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      { error: known ? error.code : 'quote_unavailable', message: known ? error.message : 'Fee claim unavailable. Please retry.' },
      { status: known ? error.status : 503, headers },
    );
  }
}
