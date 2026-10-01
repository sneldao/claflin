import { readRobinhoodEvidence, ROBINHOOD_EVIDENCE_DISCLAIMER } from '@/lib/robinhood/duplex';
import { isRobinhoodInstrumentId } from '@/lib/robinhood/contracts';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

/**
 * GET /api/desk/isabel/venue-duplex?instrumentId=rh:<contract>
 *
 * Three-way evidence: Robinhood issuer quote (rhj), onchain Chainlink mark,
 * and the Lighter domain venue book — labelled, never blended. Evidence
 * only — never files paper, never an order.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  const instrumentId = new URL(req.url).searchParams.get('instrumentId');
  if (!instrumentId || !isRobinhoodInstrumentId(instrumentId.toLowerCase())) {
    return Response.json(
      {
        version: 1,
        source: 'venue-triplex',
        status: 'unavailable',
        reasonCodes: ['unknown-instrument'],
        disclaimer: ROBINHOOD_EVIDENCE_DISCLAIMER,
      },
      { status: 400, headers },
    );
  }
  const evidence = await readRobinhoodEvidence({ instrumentId: instrumentId.toLowerCase() });
  return Response.json(evidence, { headers });
}
