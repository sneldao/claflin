'use client';

import type { DeskMark } from '@/lib/trading/marks-shared';
import { markPrice } from '@/lib/trading/marks-shared';
import styles from './WorkingDesk.module.css';

/**
 * Premium-vs-stock readout — raised by the show_premium client tool.
 * Token mark beside the stock reference, with the difference in basis
 * points. Context only: the two readings are different moments and
 * venues, never an executable spread.
 */
export function ScenePremiumPanel({ marks }: { marks: DeskMark[] }) {
  const comparable = marks.filter(mark => mark.stockReference?.differenceBps != null);
  return (
    <section className={styles.scenePremium} aria-label="Premium readout" data-premium="true">
      <p className={styles.eyebrow}>PREMIUM READOUT</p>
      <p className={styles.scenePremiumNote}>Token mark beside the stock reference. Different moments, not a spread.</p>
      {comparable.length === 0 ? (
        <p className={styles.scenePremiumEmpty}>No comparable second leg on this reading.</p>
      ) : (
        <ul className={styles.scenePremiumList}>
          {comparable.map(mark => (
            <li key={mark.instrumentId}>
              <strong>{mark.symbol}</strong>
              <span>Token {markPrice(mark) ?? '—'}</span>
              <span>Stock {mark.stockReference!.priceUsd}</span>
              <span data-premium-bps={mark.stockReference!.differenceBps}>{mark.stockReference!.differenceBps} bps</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
