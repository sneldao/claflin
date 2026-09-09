'use client';

import { memo } from 'react';
import type { DeskMark } from '@/lib/trading/marks-shared';
import { markPrice, formatMarkAge } from '@/lib/trading/marks-shared';
import styles from './WorkingDesk.module.css';

/**
 * The house tape — indicative Chainlink reference marks for the
 * quote-supported instruments. Clicking a mark loads that stock into the
 * ticket; the tape never displays executable prices. Marks arrive from the
 * desk's single shared fetch (WorkingDesk) so the tape and the tray always
 * show the same reading.
 */
export const TickerTape = memo(function TickerTape({ marks, failed, onSelect, disabled, asOf, stale }: { marks: DeskMark[]; failed: boolean; onSelect: (instrumentId: string) => void; disabled?: boolean; asOf?: number; stale?: boolean }) {
  const hasStale = stale ?? marks.some(mark => mark.reference.status !== 'observed');

  return (
    <div className={styles.tape} role="region" aria-label="Indicative reference marks">
      <span
        className={styles.tapeLabel}
        title="Indicative reference marks from Chainlink feeds on Base — never offers. The estimate you review comes from the venue, not the tape."
      >
        REFERENCE TAPE
      </span>
      {marks.length === 0 ? (
        <p className={styles.tapeNote} role={failed ? 'status' : undefined}>
          {failed ? 'Reference marks are unavailable — estimates are unaffected.' : 'Reading the tape…'}
        </p>
      ) : (
        <>
          {hasStale && asOf && (
            <p className={styles.tapeNote} role="status">
              Reference marks are stale — last known {formatMarkAge(asOf)} ago.
            </p>
          )}
          <div className={styles.tapeWindow}>
            <div className={styles.tapeTrack}>
              {[0, 1].map(copy => (
                <div key={copy} className={styles.tapeCopy} aria-hidden={copy === 1}>
                  {marks.map(mark => (
                    <TapeItem key={mark.instrumentId} mark={mark} onSelect={onSelect} disabled={disabled || copy === 1} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

function TapeItem({ mark, onSelect, disabled }: { mark: DeskMark; onSelect: (id: string) => void; disabled?: boolean }) {
  const price = markPrice(mark);
  const stale = mark.reference.status === 'stale';
  return (
    <button
      type="button"
      className={styles.tapeItem}
      data-stale={stale}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => onSelect(mark.instrumentId)}
      title={`${mark.name} — ${price ? `$${price} reference` : 'reference unavailable'}${stale ? ' (stale)' : ''}. Load into the ticket.`}
    >
      <span className={styles.tapeSymbol}>{mark.symbol}</span>
      {/* key on the price re-mounts the digit on each new mark — the tape ticks. */}
      <span key={price ?? 'none'} className={styles.tapePrice}>{price ? `$${price}` : '—'}</span>
      {stale && <span className={styles.tapeStale}>STALE</span>}
    </button>
  );
}
