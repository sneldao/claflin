'use client';

import { useBpsTick } from '@/lib/desk/use-bps-tick';
import { formatBps } from '@/lib/desk/format-bps';
import { markPrice, type DeskMark } from '@/lib/trading/marks-shared';
import styles from './WorkingDesk.module.css';

/**
 * The onchain-versus-reference gap as the slip's headline — the venue mark
 * and its stock reference from the same duplex reading. A flash marks a
 * real change between successive readings; nothing renders without both legs.
 */
export function GapStrip({ mark }: { mark: DeskMark | null }) {
  const bps = mark?.stockReference?.differenceBps ?? null;
  const tick = useBpsTick(mark?.instrumentId ?? null, bps);

  const price = mark ? markPrice(mark) : null;
  if (!mark || mark.reference.status !== 'observed' || !mark.stockReference || !price) return null;
  return (
    <div className={styles.gapStrip} data-tick={tick ?? undefined} aria-label={`${mark.symbol} on Solana $${price}, stock reference $${mark.stockReference.priceUsd}, ${formatBps(bps)}`}>
      <p className={styles.gapLegs}>
        <span>ON SOLANA <strong>${price}</strong></span>
        <span>STOCK REF <strong>${mark.stockReference.priceUsd}</strong></span>
        <span className={styles.gapBps}>{formatBps(bps)}{tick && <i aria-hidden="true">{tick === 'up' ? ' ▲' : ' ▼'}</i>}</span>
      </p>
      <p className={styles.gapSource}>
        Jupiter venue vs {mark.stockReference.source === 'backed' ? 'Backed issuer indicative' : 'Jupiter stock data'}
      </p>
    </div>
  );
}
