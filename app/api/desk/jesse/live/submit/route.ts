import { submitJesseLiveProposal } from '@/lib/solana/live-submit';
import { jesseLiveEnabled } from '@/lib/solana/flags';
import { TradingError } from '@/lib/trading/domain';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);

/**
 * POST /api/desk/jesse/live/submit
 * Body: { proposalId, signedTransactionBase64, idempotencyKey, wallet }
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
    const result = await submitJesseLiveProposal({
      proposalId: typeof payload.proposalId === 'string' ? payload.proposalId : '',
      signedTransactionBase64: typeof payload.signedTransactionBase64 === 'string' ? payload.signedTransactionBase64 : '',
      idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : '',
      wallet: typeof payload.wallet === 'string' ? payload.wallet : '',
    });
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      {
        error: known ? error.code : 'quote_unavailable',
        message: known ? error.message : 'Live submit unavailable. Outcome may be unknown — do not resign a different order.',
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
