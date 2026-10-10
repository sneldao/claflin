import { HALLEY_LIVE_LIMITS } from '@/lib/meteora/live-prepare';
import { halleyLiveEnabled } from '@/lib/meteora/flags';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/halley/live/status
 * Capability probe `{ enabled, limits }` for the launch panel — the client
 * asks at runtime because build-time NEXT_PUBLIC_* flags do not reach every
 * frontend deployment. Always answers, like the reconcile route: a caller
 * must be able to learn whether live is armed even after flags turn off.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  const enabled = halleyLiveEnabled();
  return Response.json({
    enabled,
    network: 'solana:mainnet',
    limits: enabled ? HALLEY_LIVE_LIMITS : null,
    message: enabled
      ? 'Live Meteora launch is open — paper filing stays available.'
      : 'Halley live launch is not enabled on this deployment.',
  }, { status: enabled ? 200 : 403, headers });
}
