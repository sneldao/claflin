import { submitHalleyLiveProposal } from '@/lib/meteora/live-submit';
import { halleyLiveEnabled } from '@/lib/meteora/flags';
import { TradingError } from '@/lib/trading/domain';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);

/**
 * POST /api/desk/halley/live/submit
 * Body: { proposalId, signedConfigTransactionBase64,
 *         signedPoolTransactionBase64, idempotencyKey, wallet }
 * Verifies both signed messages bind to the prepared launch, verifies the
 * payer signed each, then broadcasts config → pool in order.
 */
export async function POST(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!halleyLiveEnabled()) {
    return Response.json(
      { error: 'desk_unavailable', message: 'Halley live launch is not enabled on this deployment.' },
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
    const result = await submitHalleyLiveProposal({
      proposalId: typeof payload.proposalId === 'string' ? payload.proposalId : '',
      signedConfigTransactionBase64: typeof payload.signedConfigTransactionBase64 === 'string' ? payload.signedConfigTransactionBase64 : '',
      signedPoolTransactionBase64: typeof payload.signedPoolTransactionBase64 === 'string' ? payload.signedPoolTransactionBase64 : '',
      idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : '',
      wallet: typeof payload.wallet === 'string' ? payload.wallet : '',
    });
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      {
        error: known ? error.code : 'quote_unavailable',
        message: known ? error.message : 'Live submit unavailable. Outcome may be unknown — do not relaunch.',
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
