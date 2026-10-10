import { busyResponse, requestBudget } from '@/lib/trading/http';
import { resolveAnchor } from '@/lib/meteora/anchor';
import { quoteMintForSymbol } from '@/lib/meteora/catalog';
import { estimateLaunch } from '@/lib/meteora/dbc';
import { isHalleyLaunchIntent, type HalleyLaunchIntent } from '@/lib/meteora/contracts';
import { HALLEY_PAPER_ENABLED } from '@/lib/meteora/flags';

export const dynamic = 'force-dynamic';

const budget = requestBudget(40);

function intentFromParams(params: URLSearchParams): HalleyLaunchIntent | null {
  const intent = {
    name: params.get('name') ?? '',
    symbol: (params.get('symbol') ?? '').toUpperCase(),
    anchorSymbol: params.get('anchor') ? (params.get('anchor') as string).toUpperCase() : null,
    quoteSymbol: (params.get('quote') ?? 'USDC').toUpperCase(),
    curve: (params.get('curve') ?? 'equity-pair'),
    supply: params.get('supply') ?? '1000000',
    graduationQuote: params.get('graduation') ?? '150',
  } as HalleyLaunchIntent;
  return isHalleyLaunchIntent(intent) ? intent : null;
}

/**
 * GET /api/desk/halley/estimate?name=…&symbol=NVDA&anchor=NVDA&quote=AAPLx&curve=equity-pair&supply=1000000&graduation=150
 *
 * A projected DBC launch curve anchored to the equity's Pyth mark. Estimate
 * only — it prepares nothing onchain and is never an executable figure.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  if (!HALLEY_PAPER_ENABLED) {
    return Response.json({ error: 'desk_unavailable', message: 'Halley’s launch desk is not open on this deployment.' }, { status: 422, headers });
  }
  const intent = intentFromParams(new URL(req.url).searchParams);
  if (!intent) {
    return Response.json(
      { error: 'invalid_request', message: 'A launch needs a name, a symbol, a quote asset, a curve, a supply, and a graduation line.' },
      { status: 400, headers },
    );
  }
  if (!quoteMintForSymbol(intent.quoteSymbol)) {
    return Response.json(
      { error: 'invalid_request', message: `Quote asset ${intent.quoteSymbol} is not in the verified launch catalog.` },
      { status: 400, headers },
    );
  }
  try {
    const anchor = await resolveAnchor(intent.anchorSymbol, intent.quoteSymbol);
    /* Fail closed: a requested anchor that cannot be evidenced on EITHER
       basis — equity mark stale or missing AND the onchain venue mark
       unread — refuses the estimate rather than repricing the opening at
       1.0 under a false sense of anchoring. Omitting the anchor parameter
       remains an allowed, disclosed unanchored launch. */
    if (intent.anchorSymbol && anchor?.status !== 'observed') {
      const stale = anchor?.status === 'stale';
      return Response.json(
        {
          error: stale ? 'anchor_stale' : 'anchor_unavailable',
          message: stale
            ? `The ${intent.anchorSymbol} mark could not be evidenced — the equity tape rests and the onchain mark did not answer either. Try again, or drop the anchor.`
            : `No live ${intent.anchorSymbol} mark is available — no equity reading and no onchain venue price on this deployment.`,
        },
        { status: 422, headers },
      );
    }
    const estimate = estimateLaunch(intent, anchor, Date.now(), 'mainnet');
    return Response.json(estimate, { headers });
  } catch (error) {
    return Response.json(
      { error: 'estimate_unavailable', message: error instanceof Error ? error.message : 'The launch curve could not be estimated.' },
      { status: 503, headers },
    );
  }
}
