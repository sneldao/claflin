'use client';

import { memo, useEffect, useState } from 'react';
import type { DeskMark, MarksResult } from '@/lib/trading/marks-shared';
import { markPrice } from '@/lib/trading/marks-shared';
import styles from './WorkingDesk.module.css';

const REFRESH_MS = 90_000;

/**
 * The house tape — indicative Chainlink reference marks for the
 * quote-supported instruments. Clicking a mark loads that stock into the
 * ticket; the tape never displays executable prices.
 */
export const TickerTape = memo(function TickerTape({ onSelect, disabled }: { onSelect: (instrumentId: string) => void; disabled?: boolean }) {
  const [result, setResult] = useState<MarksResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/stocks/marks', { cache: 'no-store' });
        if (!response.ok) throw new Error('marks_unavailable');
        const body = (await response.json()) as MarksResult;
        if (!cancelled) { setResult(body); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const marks = result?.marks ?? [];

  return (
    <div className={styles.tape} role="region" aria-label="Indicative reference marks">
      <span
        className={styles.tapeLabel}
        title="Indicative reference marks from Chainlink feeds on Base — never offers. The estimate you review comes from the venue, not the tape."
      >
        HOUSE TAPE · RUNNING
      </span>
      {marks.length === 0 ? (
        <p className={styles.tapeNote} role={failed ? 'status' : undefined}>
          {failed ? 'Reference marks are unavailable — estimates are unaffected.' : 'Reading the tape…'}
        </p>
      ) : (
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
