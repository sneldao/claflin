import { NextRequest } from 'next/server';
import { checkEligibility } from '@/lib/eligibility';
import { quoteBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/eligibility?address=0x…
 *
 * Read-only onchain check of Coinbase Verifications attestations on Base.
 * Eligibility is a signal for the future live desk — it does not authorize
 * anything today and never moves funds.
 */

const budget = quoteBudget();

export async function GET(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) {
    return Response.json({ error: 'busy' }, { status: 429, headers: { ...headers, 'Retry-After': '10' } });
  }
  const address = req.nextUrl.searchParams.get('address') ?? '';
  const result = await checkEligibility(address).catch(() => null);
  if (!result) {
    return Response.json({ error: 'unavailable', message: 'Eligibility check is unavailable right now.' }, { status: 502, headers });
  }
  return Response.json(result, { headers });
}
