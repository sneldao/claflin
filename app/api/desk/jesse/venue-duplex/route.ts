import { readVenueDuplex } from '@/lib/solana/market/venue-duplex';
import { isSolanaInstrumentId } from '@/lib/solana/contracts';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/jesse/venue-duplex?instrumentId=sol:<mint>
 *
 * Free duplex: Backed issuer quote (or Jupiter stockData fallback) vs
 * Jupiter venue USD. Evidence only — never files paper, never labelled Pyth.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  const instrumentId = new URL(req.url).searchParams.get('instrumentId');
  if (!instrumentId || !isSolanaInstrumentId(instrumentId)) {
    return Response.json(
      {
        version: 1,
        source: 'venue-duplex',
        status: 'unavailable',
        reasonCodes: ['unknown-instrument'],
        disclaimer: 'Issuer or xStocks stock reference versus Solana venue USD — not a Pyth Pro reading.',
      },
      { status: 400, headers },
    );
  }
  const duplex = await readVenueDuplex({ instrumentId });
  return Response.json(duplex, { headers });
}
