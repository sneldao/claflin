/**
 * Jupiter Swap V2 live order + execute — separate from the paper quote path.
 * Paper refuses any transaction payload; live requires taker + signed execute.
 */

import { TradingError } from '../trading/domain';
import { JUPITER_SLIPPAGE_BPS } from './jupiter';

export interface JupiterLiveOrderRequest {
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  /** Wallet that will sign — required for an assembled transaction. */
  taker: string;
}

export interface JupiterLiveOrder {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutputRaw: string;
  router: 'metis';
  providerRequestId: string;
  slippageBps: number | null;
  priceImpact: number | null;
  feeBps: number | null;
  feeMint: string | null;
  transactionBase64: string;
  lastValidBlockHeight: string | null;
}

export interface JupiterExecuteResult {
  status: 'Success' | 'Failed';
  signature: string;
  code: number;
  inputAmountResult: string | null;
  outputAmountResult: string | null;
  error: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function integerString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

const U64_MAX = 2n ** 64n - 1n;

/**
 * Strict parser for a live `/order` response. Metis-only (same paper policy);
 * `transaction` must be a non-empty base64 string.
 */
export function parseJupiterLiveOrder(body: unknown, expected: JupiterLiveOrderRequest): JupiterLiveOrder {
  const order = body as Record<string, unknown> | null;
  if (!order || typeof order !== 'object') {
    throw new TradingError('quote_unavailable', 'The venue returned an unreadable live order. Please retry.', 503);
  }
  if (order.inputMint !== expected.inputMint || order.outputMint !== expected.outputMint || order.inAmount !== expected.amountRaw) {
    throw new TradingError('route_mismatch', 'Venue identity verification failed. No live order is available.', 503);
  }
  if (order.router !== 'metis') {
    throw new TradingError('route_mismatch', 'The venue changed routing policy. No live order is available.', 503);
  }
  if (typeof order.transaction !== 'string' || order.transaction.length === 0) {
    const hint = typeof order.errorMessage === 'string' ? order.errorMessage : 'No executable transaction was returned.';
    throw new TradingError('no_route', hint, 422);
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
    throw new TradingError('quote_unavailable', 'The venue returned an unreadable live order. Please retry.', 503);
  }
  if (order.slippageBps !== undefined && order.slippageBps !== JUPITER_SLIPPAGE_BPS) {
    throw new TradingError('route_mismatch', 'The venue changed the slippage tolerance. No live order is available.', 503);
  }
  const priceImpact = typeof order.priceImpact === 'number' && Number.isFinite(order.priceImpact) ? order.priceImpact : null;
  const feeBps = typeof order.feeBps === 'number' && Number.isInteger(order.feeBps) && order.feeBps >= 0 ? order.feeBps : null;
  const feeMint = typeof order.feeMint === 'string' && order.feeMint.length > 0 ? order.feeMint : null;
  const slippageBps = typeof order.slippageBps === 'number' ? order.slippageBps : null;
  const lastValidBlockHeight = order.lastValidBlockHeight == null
    ? null
    : integerString(order.lastValidBlockHeight)
      ? order.lastValidBlockHeight
      : typeof order.lastValidBlockHeight === 'number' && Number.isFinite(order.lastValidBlockHeight)
        ? String(Math.trunc(order.lastValidBlockHeight))
        : null;
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
    transactionBase64: order.transaction,
    lastValidBlockHeight,
  };
}

export function createJupiterLiveOrderClient({
  apiKey = process.env.JUPITER_API_KEY,
  baseUrl = 'https://api.jup.ag/swap/v2',
  fetchImpl = fetch,
}: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
} = {}): (request: JupiterLiveOrderRequest) => Promise<JupiterLiveOrder> {
  return async (request: JupiterLiveOrderRequest): Promise<JupiterLiveOrder> => {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amountRaw,
      taker: request.taker,
      swapMode: 'ExactIn',
      slippageBps: String(JUPITER_SLIPPAGE_BPS),
      excludeRouters: 'jupiterz,dflow,okx',
    });
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/order?${params.toString()}`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new TradingError('quote_unavailable', 'The venue could not prepare a live order. Please retry.', 503);
    }
    if (res.status === 429) {
      throw new TradingError('rate_limited', 'The venue is busy — wait a few seconds, then retry.', 429);
    }
    if (!res.ok) {
      throw new TradingError('quote_unavailable', 'The venue could not prepare a live order. Please retry.', 503);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TradingError('quote_unavailable', 'The venue returned an unreadable live order. Please retry.', 503);
    }
    const payload = body as Record<string, unknown> | null;
    if (payload && typeof payload.error === 'string') {
      throw new TradingError('no_route', 'The venue found no live route for that pair and size.', 422);
    }
    return parseJupiterLiveOrder(body, request);
  };
}

export function createJupiterExecuteClient({
  apiKey = process.env.JUPITER_API_KEY,
  baseUrl = 'https://api.jup.ag/swap/v2',
  fetchImpl = fetch,
}: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
} = {}): (args: { signedTransactionBase64: string; requestId: string }) => Promise<JupiterExecuteResult> {
  return async ({ signedTransactionBase64, requestId }) => {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          signedTransaction: signedTransactionBase64,
          requestId,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new TradingError('quote_unavailable', 'Execute timed out or failed to reach the venue. Outcome is unknown — do not resign a different order.', 503);
    }
    if (res.status === 429) {
      throw new TradingError('rate_limited', 'The venue is busy — wait a few seconds, then retry the same signed transaction.', 429);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TradingError('quote_unavailable', 'Execute returned an unreadable result. Outcome is unknown.', 503);
    }
    const result = body as Record<string, unknown> | null;
    if (!result || typeof result !== 'object') {
      throw new TradingError('quote_unavailable', 'Execute returned an unreadable result. Outcome is unknown.', 503);
    }
    const status = result.status === 'Success' || result.status === 'Failed' ? result.status : null;
    const signature = typeof result.signature === 'string' ? result.signature : '';
    if (!status) {
      throw new TradingError('quote_unavailable', 'Execute returned an unreadable result. Outcome is unknown.', 503);
    }
    return {
      status,
      signature,
      code: typeof result.code === 'number' ? result.code : -1,
      inputAmountResult: typeof result.inputAmountResult === 'string' ? result.inputAmountResult : null,
      outputAmountResult: typeof result.outputAmountResult === 'string' ? result.outputAmountResult : null,
      error: typeof result.error === 'string' ? result.error : null,
    };
  };
}
