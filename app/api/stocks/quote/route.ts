import { OPEN_DESK_ID } from '@/lib/house';
import { quoteAdapterFor } from '@/lib/trading/adapters';
import { createQuoteHandler, quoteBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stocks/quote?instrumentId=8453:0x...&side=buy&amount=100&unit=USDC
 *
 * Legacy path — delegates to Hetty's desk adapter. Prefer
 * /api/desk/[deskId]/quote, which resolves the venue per desk.
 *
 * Returns a paper-only estimate, honestly labelled:
 *   - reference: Chainlink total-return observation (session/pause not verified)
 *   - venue:     verified single-hop Aerodrome pool, pinned to a recent block
 *   - estimate:  exact input and quoted output, not reserved or executable
 *
 * The estimate is for paper review only. No transaction is
 * constructed, signed, or submitted by this endpoint.
 */
// Reference price is optional and is never an execution gate for a paper estimate.
// Buy amounts are USDC spend. Sell amounts are token quantities.
// No USD-to-token sell conversion is performed.
export const GET = createQuoteHandler((input) => quoteAdapterFor(OPEN_DESK_ID).quote(input), quoteBudget());
