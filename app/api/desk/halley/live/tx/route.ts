import { submitHalleyTx } from '@/lib/meteora/live-tx';
import { halleyLiveEnabled } from '@/lib/meteora/flags';
import { TradingError } from '@/lib/trading/domain';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(30);

/**
 * POST /api/desk/halley/live/tx
 * Body: { proposalId, signedTransactionBase64, idempotencyKey, wallet }
 * Submits a signed swap or fee-claim proposal after verifying the signed
 * message is byte-identical to the prepared one and the wallet signed it.
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
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  try {
    const result = await submitHalleyTx({
      proposalId: str(body.proposalId),
      signedTransactionBase64: str(body.signedTransactionBase64),
      idempotencyKey: str(body.idempotencyKey),
      wallet: str(body.wallet),
    });
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      {
        error: known ? error.code : 'quote_unavailable',
        message: known ? error.message : 'Submit unavailable. Outcome may be unknown — do not resend.',
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
