'use client';

import { memo, useEffect, useRef } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import type { DeskMark } from '@/lib/trading/marks-shared';
import { markPrice, formatMarkAge } from '@/lib/trading/marks-shared';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import { readSeenSnapshot, writeSeenSnapshot, trayDeltas, deltaLine, seenDayLabel, marksToPoints } from '@/lib/trading/tray-deltas';
import styles from './WorkingDesk.module.css';

/**
 * The working tray: watched marks with what the Chainlink reference did since
 * the caller last sat at this desk. The snapshot is written only while the
 * caller is on the desk, so the delta survives refreshes within a session and
 * lands fresh on the next visit. Reference marks only — labelled, never
 * offers, never advice.
 */
export const DeskBoard = memo(function DeskBoard({ desk, marks, asOf, stale }: { desk: ReturnType<typeof useTradingDesk>; marks: DeskMark[]; asOf?: number; stale?: boolean }) {
  const { state, edit, watched, unwatch, deskId } = desk;
  const points = marksToPoints(marks);

  // Session continuity: capture the tray's first reading once per mount —
  // before it can be overwritten by an in-session refresh — and record what
  // the caller saw on the way out. Reduced to a ref so a snapshot write never
  // re-renders the tray.
  const firstSeenRef = useRef<ReturnType<typeof readSeenSnapshot>>(null);
  if (firstSeenRef.current === null && typeof window !== 'undefined') {
    firstSeenRef.current = readSeenSnapshot(window.localStorage, deskId);
  }
  useEffect(() => {
    if (points.length === 0) return;
    const onLeave = () => writeSeenSnapshot(window.localStorage, deskId, points);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      writeSeenSnapshot(window.localStorage, deskId, points);
    };
  }, [deskId, points]);

  if (watched.length === 0) return null;

  const snapshot = firstSeenRef.current;
  const deltas = trayDeltas(snapshot, points);
  const deltaFor = (id: string) => deltas.find(d => d.instrumentId === id);
  const dayLabel = seenDayLabel(snapshot?.seenAt ?? Date.now());
  const hasStale = stale ?? marks.some(mark => mark.reference.status !== 'observed');

  return (
    <section className={styles.board} aria-labelledby="board-title">
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>WORKING TRAY</p>
        <span className={styles.boardTally}>{watched.length === 1 ? '1 WATCHING' : `${watched.length} WATCHING`}</span>
      </div>
      <h2 id="board-title" className={styles.boardTitle}>Watched marks.</h2>
      {hasStale && asOf && (
        <p className={styles.boardSince} role="status">Reference marks are stale — last known {formatMarkAge(asOf)} ago.</p>
      )}
      {snapshot && deltas.length > 0 && (
        <p className={styles.boardSince} role="status">Reference movement since you last sat down ({dayLabel}):</p>
      )}
      <ul className={styles.boardList}>
        {watched.map(id => {
          const stock = DESK_INSTRUMENTS.find(s => s.id === id);
          if (!stock) return null;
          const delta = deltaFor(id);
          const mark = marks.find(m => m.instrumentId === id);
          return (
            <li key={id}>
              <span className={styles.boardTag}>WATCHING</span>
              <strong>{stock.symbol} · {stock.name}</strong>
              {mark ? <span className={styles.boardRef}>Reference ${markPrice(mark)}{mark.reference.status === 'stale' ? ' · stale' : ''}</span> : <span className={styles.boardRef}>Reference unavailable</span>}
              {delta && <span className={styles.boardDelta} data-direction={delta.direction}>{deltaLine(delta, dayLabel)}</span>}
              <span className={styles.boardActions}>
                <button
                  type="button"
                  onClick={() => {
                    edit({ ...state.draft, instrumentId: stock.id });
                    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
                    document.getElementById('amount')?.focus();
                  }}
                >
                  Quote it
                </button>
                <button type="button" onClick={() => unwatch(id)}>Unwatch</button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.boardFoot}>Chainlink reference marks on Base. Movement is context, not advice.</p>
    </section>
  );
});
