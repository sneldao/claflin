/**
 * Server-side Jupiter Swap V2 client — read-only `/order` quotes for Jesse's
 * paper estimates. Never import this from a client module: it may carry an
 * API key and speaks to an upstream provider.
 *
 * Routing policy is pinned (plan §4.2): Metis only, ExactIn, 50 bps
 * tolerance, no taker/receiver/referral — so no transaction is ever built
 * and nothing executable crosses this path. `excludeRouters=jupiterz,dflow,okx`
 * removes the RFQ engines: their short quote expiry and transaction-binding
 * variation belong to the separately reviewed live preparation, not to a
 * paper estimate. "Jupiter, Metis route" is the honest venue label — never
 * "best across all routers."
 */

import { TradingError } from '../trading/domain';

export const JUPITER_SLIPPAGE_BPS = 50;
const U64_MAX = 2n ** 64n - 1n;

export interface JupiterOrderRequest {
  inputMint: string;
  outputMint: string;
  /** Atomic input amount as a decimal string. */
  amountRaw: string;
}

/** The fields of a v2 `/order` response the desk relies on — validated, not
 *  trusted. */
export interface JupiterOrder {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutputRaw: string;
  router: 'metis';
  providerRequestId: string;
  slippageBps: number | null;
  /** Percentage points (the v2 `priceImpact` field) — negative means the
   *  route beat its own reference. The deprecated `priceImpactPct` ratio is
   *  deliberately not read. */
  priceImpact: number | null;
  feeBps: number | null;
  feeMint: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function integerString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

/**
 * Strict parser for a v2 `/order` response. The provider's payload is
 * validated against the exact request and the pinned routing policy; any
 * silent change (a different router, different mints, an echoed amount that
 * is not what was asked, or an executable payload on the paper path) fails
 * closed. Exported for tests.
 */
export function parseJupiterOrder(body: unknown, expected: JupiterOrderRequest): JupiterOrder {
  const order = body as Record<string, unknown> | null;
  if (!order || typeof order !== 'object') {
    throw new TradingError('quote_unavailable', 'The venue returned an unreadable estimate. Please retry.', 503);
  }
  if (order.inputMint !== expected.inputMint || order.outputMint !== expected.outputMint || order.inAmount !== expected.amountRaw) {
    throw new TradingError('route_mismatch', 'Venue identity verification failed. No estimate is available.', 503);
  }
  if (order.router !== 'metis') {
    /* excludeRouters pins Metis — anything else means the routing policy
       changed upstream and this response was not produced under it. */
    throw new TradingError('route_mismatch', 'The venue changed routing policy. No estimate is available.', 503);
  }
  if (order.swapMode !== undefined && order.swapMode !== 'ExactIn') {
    throw new TradingError('route_mismatch', 'The venue changed swap mode. No estimate is available.', 503);
  }
  if (order.transaction !== null && order.transaction !== undefined) {
    /* The paper path asks for no taker, so no transaction may come back. */
    throw new TradingError('route_mismatch', 'The venue returned an executable payload on a paper request. No estimate is available.', 503);
  }
  if (order.slippageBps !== undefined && order.slippageBps !== JUPITER_SLIPPAGE_BPS) {
    throw new TradingError('route_mismatch', 'The venue changed the slippage tolerance. No estimate is available.', 503);
  }
  if (!integerString(order.outAmount) || !integerString(order.otherAmountThreshold)) {
    throw new TradingError('invalid_quote', 'The venue returned invalid units or no output for this size.', 503);
  }
  const outAmount = BigInt(order.outAmount);
  const minOutput = BigInt(order.otherAmountThreshold);
  if (outAmount <= 0n || outAmount > U64_MAX || minOutput < 0n || minOutput > outAmount) {
    throw new TradingError('invalid_quote', 'The venue returned invalid units or no output for this size.', 503);
  }
  if (typeof order.requestId !== 'string' || order.requestId.length === 0) {
    throw new TradingError('quote_unavailable', 'The venue returned an unreadable estimate. Please retry.', 503);
  }
  const priceImpact = typeof order.priceImpact === 'number' && Number.isFinite(order.priceImpact) ? order.priceImpact : null;
  const feeBps = typeof order.feeBps === 'number' && Number.isInteger(order.feeBps) && order.feeBps >= 0 ? order.feeBps : null;
  const feeMint = typeof order.feeMint === 'string' && order.feeMint.length > 0 ? order.feeMint : null;
  const slippageBps = typeof order.slippageBps === 'number' ? order.slippageBps : null;
  return {
    inputMint: expected.inputMint,
    outputMint: expected.outputMint,
    inAmount: expected.amountRaw,
    outAmount: order.outAmount,
    minOutputRaw: order.otherAmountThreshold,
    router: 'metis',
    providerRequestId: order.requestId,
    slippageBps,
    priceImpact,
    feeBps,
    feeMint,
  };
}

/**
 * Production client: one GET to `/swap/v2/order` under the pinned policy.
 * The API key is sent only when the deployment configures one — Jupiter
 * serves a keyless tier, and an absent key must never become a fabricated
 * header. Provider failures map to honest errors: 429 is a rate limit,
 * "Failed to get quotes" is no route, everything else is unavailable.
 */
export function createJupiterClient({
  apiKey = process.env.JUPITER_API_KEY,
  baseUrl = 'https://api.jup.ag/swap/v2',
  fetchImpl = fetch,
}: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
} = {}): (request: JupiterOrderRequest) => Promise<JupiterOrder> {
  return async (request: JupiterOrderRequest): Promise<JupiterOrder> => {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amountRaw,
      swapMode: 'ExactIn',
      slippageBps: String(JUPITER_SLIPPAGE_BPS),
      excludeRouters: 'jupiterz,dflow,okx',
    });
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/order?${params.toString()}`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new TradingError('quote_unavailable', 'The venue could not provide a verified estimate. Please retry.', 503);
    }
    if (res.status === 429) {
      throw new TradingError('rate_limited', 'The venue is busy — wait a few seconds, then retry.', 429);
    }
    if (!res.ok) {
      throw new TradingError('quote_unavailable', 'The venue could not provide a verified estimate. Please retry.', 503);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TradingError('quote_unavailable', 'The venue returned an unreadable estimate. Please retry.', 503);
    }
    const payload = body as Record<string, unknown> | null;
    if (payload && typeof payload.error === 'string') {
      throw new TradingError('no_route', 'The venue found no route for that pair and size.', 422);
    }
    return parseJupiterOrder(body, request);
  };
}
