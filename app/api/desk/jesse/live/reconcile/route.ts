import { decodeBase58 } from '@/lib/solana/catalog';
import { readSignatureStatuses } from '@/lib/solana/tx-status';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);
const MAX_SIGNATURES = 16;

/**
 * GET /api/desk/jesse/live/reconcile?signature=<b58>[&signature=…]
 * Read-only chain lookup for submitted orders — deliberately not gated by
 * the live flags: reconciling a signature must keep working even after the
 * desk's live settle is switched off.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();

  const signatures = new URL(req.url).searchParams.getAll('signature').slice(0, MAX_SIGNATURES);
  if (signatures.length === 0) {
    return Response.json(
      { error: 'invalid_signature', message: 'At least one transaction signature is required.' },
      { status: 400, headers },
    );
  }
  for (const signature of signatures) {
    const decoded = decodeBase58(signature);
    if (!decoded || decoded.length !== 64) {
      return Response.json(
        { error: 'invalid_signature', message: 'Signatures must be 64-byte base58 values.' },
        { status: 400, headers },
      );
    }
  }

  const result = await readSignatureStatuses({
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
    signatures,
  });
  return Response.json(result, { headers });
}
