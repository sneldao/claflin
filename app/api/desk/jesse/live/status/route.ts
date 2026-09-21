import { loadLiveProposal } from '@/lib/solana/live-store';
import { JESSE_LIVE_LIMITS } from '@/lib/solana/live-prepare';
import { jesseLiveEnabled } from '@/lib/solana/flags';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/jesse/live/status
 * Without proposalId: capability probe `{ enabled, limits }` for the paper/live toggle.
 * With proposalId: stored proposal status.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const enabled = jesseLiveEnabled();
  const proposalId = new URL(req.url).searchParams.get('proposalId');
  if (!proposalId) {
    return Response.json({
      enabled,
      network: 'solana:mainnet',
      limits: enabled ? JESSE_LIVE_LIMITS : null,
      message: enabled
        ? 'Live Jupiter settle is open — paper filing stays available.'
        : 'Jesse live settle is not enabled on this deployment.',
    }, { status: enabled ? 200 : 403, headers });
  }
  if (!enabled) {
    return Response.json(
      { error: 'desk_unavailable', message: 'Jesse live settle is not enabled on this deployment.' },
      { status: 403, headers },
    );
  }
  if (!budget()) return busyResponse();
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
