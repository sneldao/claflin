import { loadLiveProposal } from '@/lib/solana/live-store';
import { jesseLiveEnabled } from '@/lib/solana/flags';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/jesse/live/status?proposalId=...
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!jesseLiveEnabled()) {
    return Response.json(
      { error: 'desk_unavailable', message: 'Jesse live settle is not enabled on this deployment.' },
      { status: 403, headers },
    );
  }
  if (!budget()) return busyResponse();
  const proposalId = new URL(req.url).searchParams.get('proposalId');
  if (!proposalId) {
    return Response.json({ error: 'invalid_request', message: 'proposalId required.' }, { status: 400, headers });
  }
  const stored = await loadLiveProposal(proposalId);
  if (!stored) {
    return Response.json({ status: 'expired', proposalId }, { headers });
  }
  return Response.json({
    proposalId,
    status: stored.status,
    signature: stored.signature,
    wallet: stored.proposal.wallet,
    expiresAt: stored.proposal.expiresAt,
    solscanUrl: stored.signature ? `https://solscan.io/tx/${stored.signature}` : null,
  }, { headers });
}
