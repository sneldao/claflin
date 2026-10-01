/**
 * HTTP ports for Isabel's session — quote and evidence over the desk APIs.
 * Client-safe: fetch only, no env, no React. Unavailable evidence returns as
 * data (honest legs); transport failure yields null.
 */
import { fetchJson } from '../api-client';
import type { IsabelIntent, RobinhoodInstrumentId, RobinhoodPaperEstimate } from './contracts';
import { parseRobinhoodEstimate, parseRobinhoodEvidence } from './paper';
import type { RobinhoodEvidence } from './duplex';

export function createIsabelQuotePort(fetch = fetchJson): (intent: IsabelIntent) => Promise<RobinhoodPaperEstimate> {
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
      const response = await fetch<unknown>(`/api/desk/isabel/quote?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(response.error.friendlyMessage || response.error.message);
      return parseRobinhoodEstimate(response.data);
    } finally {
      clearTimeout(timeout);
    }
  };
}

/**
 * Returns the evidence object even when status is `unavailable` — that is
 * data, not failure. Returns null only when the request fails or the payload
 * cannot be parsed.
 */
export function createIsabelEvidencePort(fetch = fetchJson): (instrumentId: RobinhoodInstrumentId) => Promise<RobinhoodEvidence | null> {
  return async (instrumentId) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch<unknown>(
        `/api/desk/isabel/venue-duplex?${new URLSearchParams({ instrumentId })}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) return null;
      try {
        return parseRobinhoodEvidence(response.data);
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
