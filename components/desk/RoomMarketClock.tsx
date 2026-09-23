'use client';

import type { MarketClock } from '@/lib/market-clock';
import styles from './WorkingDesk.module.css';

/** Live market clock line for Room overlays — weather, not a chapter. */
export function RoomMarketClock({ clock }: { clock: MarketClock | null }) {
  if (!clock) return null;
  return (
    <p className={styles.roomMarketClock} data-exchange={clock.exchange} role="status">
      <span className={styles.clockLamp} aria-hidden="true" />
      {clock.line}
    </p>
  );
}
