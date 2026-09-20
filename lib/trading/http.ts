import { TradingError } from './domain';
import type { QuoteEstimate } from './domain';

export function createQuoteHandler(quote: (input: unknown) => Promise<QuoteEstimate>, allow = () => true) {
  let active = 0;
  return async (req: Request): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store' };
    if (active >= 2 || !allow()) return Response.json({ error: 'busy', message: 'Too many quote requests. Please wait a moment.' }, { status: 429, headers: { ...headers, 'Retry-After': '10' } });
    const params = new URL(req.url).searchParams;
    if ([...params.keys()].some(key => !['instrumentId', 'side', 'amount', 'unit'].includes(key)) || [...params.keys()].some(key => params.getAll(key).length !== 1)) {
      return Response.json({ error: 'invalid_request', message: 'Use instrumentId, side, amount and unit. Legacy sizeUsd requests are not supported.' }, { status: 400, headers });
    }
    active++;
    try {
      const result = await quote(Object.fromEntries(params));
      return Response.json(result, { headers });
    } catch (error) {
      const known = error instanceof TradingError;
      return Response.json({ error: known ? error.code : 'quote_unavailable', message: known ? error.message : 'Quote service unavailable. Please retry.' }, { status: known ? error.status : 503, headers });
    } finally { active--; }
  };
}

/** Instance-local minute budget (quotes default to 60). */
export function quoteBudget(clock = Date.now) {
  return requestBudget(60, clock);
}

/** Sliding one-minute budget for expensive provider mints (voice, ConvAI). */
export function requestBudget(limitPerMinute: number, clock = Date.now) {
  let reset = 0;
  let count = 0;
  return () => {
    const now = clock();
    if (now >= reset) { count = 0; reset = now + 60_000; }
    return ++count <= limitPerMinute;
  };
}

/** Per-key minute budget (IP / user id). Map is bounded and cleared when oversized. */
export function keyedBudget(limitPerMinute: number, maxKeys = 5000, clock = Date.now) {
  const map = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = clock();
    const entry = map.get(key);
    if (!entry || entry.resetAt < now) {
      map.set(key, { count: 1, resetAt: now + 60_000 });
      if (map.size > maxKeys) map.clear();
      return true;
    }
    if (entry.count >= limitPerMinute) return false;
    entry.count += 1;
    return true;
  };
}

/** Best-effort client key for abuse budgets — not a security identity. */
export function clientKeyFromRequest(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return `ip:${forwarded}`;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return `ip:${realIp}`;
  return 'ip:unknown';
}

export function busyResponse(message = 'Too many requests. Please wait a moment.'): Response {
  return Response.json(
    { error: 'busy', message },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
  );
}
