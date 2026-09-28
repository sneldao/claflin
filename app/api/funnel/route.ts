import { getRedis } from '@/lib/redis';
import { parseBatch, recordBatch } from '@/lib/funnel/store';
import { clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

/**
 * Write-only funnel beacon (docs/FUNNEL_METRICS.md). Anonymous by design:
 * the body is enums and booleans only, the caller's IP is used for the
 * in-memory abuse budget and never stored, and there is no read endpoint —
 * reports are pulled with scripts/funnel-report.mts against Redis directly.
 */

const MAX_BODY_BYTES = 4_096;
const instanceBudget = requestBudget(1_200);
const ipBudget = keyedBudget(30);
const headers = { 'Cache-Control': 'no-store' };

export async function POST(req: Request): Promise<Response> {
  if (!instanceBudget() || !ipBudget(clientKeyFromRequest(req))) {
    return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413, headers });

  let batch;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413, headers });
    batch = parseBatch(JSON.parse(text));
  } catch {
    batch = null;
  }
  if (!batch) return new Response(null, { status: 400, headers });

  try {
    await recordBatch(getRedis().pipeline(), batch);
  } catch {
    /* No Redis on this deployment, or it is down: counting is best-effort
       and the beacon has nobody to tell. */
    return new Response(null, { status: 204, headers });
  }
  return new Response(null, { status: 202, headers });
}
