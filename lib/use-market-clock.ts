'use client';

import { useEffect, useState } from 'react';
import { marketClock, nextBell, type MarketClock, type NextBell } from './market-clock';

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

/** The clock plus the next bell, read at the same instant — for the foyer
 *  kicker's countdown. Null on the server and first paint, like the clock. */
export function useMarketBell(): { clock: MarketClock; bell: NextBell | null } | null {
  const [state, setState] = useState<{ clock: MarketClock; bell: NextBell | null } | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setState({ clock: marketClock(now), bell: nextBell(now) });
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);
  return state;
}
