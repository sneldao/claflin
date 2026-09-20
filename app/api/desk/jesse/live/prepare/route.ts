import { prepareJesseLiveProposal } from '@/lib/solana/live-prepare';
import { jesseLiveEnabled } from '@/lib/solana/flags';
import { TradingError } from '@/lib/trading/domain';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);

/**
 * POST /api/desk/jesse/live/prepare
 * Body: { intent, wallet, revision }
 * Returns a SolanaLiveProposal (includes transactionBase64 for wallet sign).
 */
export async function POST(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!jesseLiveEnabled()) {
    return Response.json(
      { error: 'desk_unavailable', message: 'Jesse live settle is not enabled on this deployment.' },
      { status: 403, headers },
    );
  }
  if (!budget()) return busyResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_request', message: 'Expected JSON body.' }, { status: 400, headers });
  }
  const payload = body as Record<string, unknown>;
  try {
    const proposal = await prepareJesseLiveProposal({
      intent: payload.intent,
      wallet: typeof payload.wallet === 'string' ? payload.wallet : '',
      revision: typeof payload.revision === 'number' ? payload.revision : 0,
    });
    return Response.json(proposal, { headers });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      {
        error: known ? error.code : 'quote_unavailable',
        message: known ? error.message : 'Live prepare unavailable. Please retry.',
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
