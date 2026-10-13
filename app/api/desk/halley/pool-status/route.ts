import { decodeBase58 } from '@/lib/solana/catalog';
import { HALLEY_PAPER_ENABLED } from '@/lib/meteora/flags';
import { resolveAnchor } from '@/lib/meteora/anchor';
import { quoteMintForSymbol, HALLEY_QUOTE_MINTS } from '@/lib/meteora/catalog';
import { readHalleyPool, summarizePoolStatus } from '@/lib/meteora/pool-reader';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);

/* Public read-only market data — terminals and other launchpads may read it
   cross-origin. It never builds a transaction. */
const HEADERS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

/**
 * GET /api/desk/halley/pool-status?pool=<b58>[&anchor=NVDA]
 * The launch's whole life in one read: DBC curve progress, quote raised,
 * live price, the config's fee schedule and migration terms, unclaimed
 * curve fees, the DAMM v2 pool once graduated, and — with `anchor` — the
 * venue's premium or discount to the equity reference.
 * Not gated by the live flags: a launched pool stays watchable even with
 * live launches switched off.
 */
export async function GET(req: Request): Promise<Response> {
  if (!budget()) return busyResponse();
  if (!HALLEY_PAPER_ENABLED) {
    return Response.json({ error: 'desk_unavailable', message: 'Halley’s launch desk is not open on this deployment.' }, { status: 422, headers: HEADERS });
  }
  const params = new URL(req.url).searchParams;
  const poolParam = params.get('pool') ?? '';
  const decoded = decodeBase58(poolParam);
  if (!decoded || decoded.length !== 32) {
    return Response.json({ error: 'invalid_request', message: 'A pool address is required.' }, { status: 400, headers: HEADERS });
  }
  const anchorParam = params.get('anchor');
  if (anchorParam !== null && !/^[A-Z0-9.]{1,10}$/.test(anchorParam)) {
    return Response.json({ error: 'invalid_request', message: 'anchor must be an equity symbol like NVDA.' }, { status: 400, headers: HEADERS });
  }
  try {
    const read = await readHalleyPool(poolParam);
    if (!read) {
      return Response.json({ error: 'pool_not_found', message: 'No DBC pool at this address on the configured cluster.' }, { status: 404, headers: HEADERS });
    }
    const quoteSymbol = HALLEY_QUOTE_MINTS.find(q => q.mint === read.quoteMint)?.symbol ?? null;
    const anchor = anchorParam && quoteSymbol && quoteMintForSymbol(quoteSymbol)
      ? await resolveAnchor(anchorParam, quoteSymbol).catch(() => null)
      : null;
    return Response.json(summarizePoolStatus(read, anchor), { headers: HEADERS });
  } catch {
    return Response.json(
      { error: 'pool_unavailable', message: 'That pool could not be read — it may not exist on this network.' },
      { status: 503, headers: HEADERS },
    );
  }
}
