import { presetListings } from '@/lib/meteora/preset-catalog';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(30);

const HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

/**
 * GET /api/desk/halley/presets
 * Halley's DBC launch presets for builders: curve + fee schedule + liquidity
 * locks + post-graduation DAMM v2 terms, each with exact SDK-validated
 * ConfigParameters and — once published — the shared on-chain config address
 * to open pools against (pay-to-use via the config's pool creation fee).
 */
export async function GET(): Promise<Response> {
  if (!budget()) return busyResponse();
  return Response.json({ version: 1, presets: presetListings() }, { headers: HEADERS });
}
