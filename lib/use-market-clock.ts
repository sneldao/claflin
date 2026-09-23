'use client';

import { useEffect, useState } from 'react';
import { marketClock, type MarketClock } from './market-clock';

/** Wall-clock market status: null on the server and first paint (so SSR can
 *  render a neutral fallback), then the ET exchange state refreshed every 30s. */
export function useMarketClock(): MarketClock | null {
  const [clock, setClock] = useState<MarketClock | null>(null);
  useEffect(() => {
    const update = () => setClock(marketClock(new Date()));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);
  return clock;
}
