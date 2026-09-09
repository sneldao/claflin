import { quoteAdapterFor } from '@/lib/trading/adapters';
import { createQuoteHandler, quoteBudget } from '@/lib/trading/http';
import { TradingError } from '@/lib/trading/domain';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desk/[deskId]/quote?instrumentId=…&side=buy&amount=100&unit=USDC
 *
 * Desk-routed paper estimates. The desk resolves to its market, instruments,
 * and venue adapter; a planned desk refuses with `desk_unavailable` rather
 * than borrowing another desk's venue. Each desk gets its own request budget.
 */

type Handler = ReturnType<typeof createQuoteHandler>;
const handlers = new Map<string, Handler>();

function handlerFor(deskId: string): Handler {
  const key = deskId.toLowerCase();
  let handler = handlers.get(key);
  if (!handler) {
    const adapter = quoteAdapterFor(key); // throws desk_unavailable for planned desks
    handler = createQuoteHandler((input) => adapter.quote(input), quoteBudget());
    handlers.set(key, handler);
  }
  return handler;
}

export async function GET(req: Request, ctx: { params: Promise<{ deskId: string }> }): Promise<Response> {
  const { deskId } = await ctx.params;
  try {
    return await handlerFor(deskId)(req);
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json(
      { error: known ? error.code : 'quote_unavailable', message: known ? error.message : 'Quote service unavailable. Please retry.' },
      { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
