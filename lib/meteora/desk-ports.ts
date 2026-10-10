/**
 * Halley desk ports — client-safe fetch adapters only. The estimate port
 * calls the server launch-estimate route; failures surface as thrown
 * Error messages the controller renders as a notice.
 */
import { fetchJson } from '../api-client';
import type { HalleyLaunchEstimate, HalleyLaunchIntent } from './contracts';
import { parseHalleyEstimate } from './paper';

export function createHalleyEstimatePort(fetch = fetchJson): (intent: HalleyLaunchIntent) => Promise<HalleyLaunchEstimate> {
  return async (intent) => {
    const params = new URLSearchParams({
      name: intent.name,
      symbol: intent.symbol,
      quote: intent.quoteSymbol,
      curve: intent.curve,
      supply: intent.supply,
      graduation: intent.graduationQuote,
    });
    if (intent.anchorSymbol) params.set('anchor', intent.anchorSymbol);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch<unknown>(`/api/desk/halley/estimate?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      /* Throw the typed error itself — its message is the server's specific
         wording (e.g. "drop the anchor") and its code drives recovery
         actions in the surface. */
      if (!response.ok) throw response.error;
      return parseHalleyEstimate(response.data);
    } finally {
      clearTimeout(timeout);
    }
  };
}
