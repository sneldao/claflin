/**
 * HTTP ports for Jesse's controller — quote and compare over the desk APIs.
 * Client-safe: fetch only, no env, no React. Unavailable comparisons are
 * returned as objects (honest data); transport failure yields null.
 */
import { fetchJson } from '../api-client';
import type { JesseIntent, MarketComparison, SolanaInstrumentId, SolanaPaperEstimate } from './contracts';
import { parseJesseEstimate, parseMarketComparison } from './paper';

export function createJesseQuotePort(fetch = fetchJson): (intent: JesseIntent) => Promise<SolanaPaperEstimate> {
  return async (intent) => {
    const params = new URLSearchParams({
      instrumentId: intent.instrumentId,
      side: intent.side,
      amount: intent.amount,
      unit: intent.unit,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch<unknown>(`/api/desk/jesse/quote?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(response.error.friendlyMessage || response.error.message);
      return parseJesseEstimate(response.data);
    } finally {
      clearTimeout(timeout);
    }
  };
}

/**
 * Returns the comparison object even when status is `unavailable` — that is
 * data, not failure. Returns null only when the request fails or the payload
 * cannot be parsed.
 */
export function createJesseComparePort(fetch = fetchJson): (instrumentId: SolanaInstrumentId) => Promise<MarketComparison | null> {
  return async (instrumentId) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch<unknown>(
        `/api/desk/jesse/comparison?${new URLSearchParams({ instrumentId })}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) return null;
      try {
        return parseMarketComparison(response.data);
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}
