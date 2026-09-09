'use client';

import { memo, useEffect, useState } from 'react';
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
  const { state, edit, watched, watch, unwatch, deskId, foreground } = desk;
  const points = marksToPoints(marks);

  // Session continuity: the "last sat down" snapshot lives in localStorage.
  // Reading it during render would mismatch the server HTML, so it arrives
  // one paint after mount — until then the tray shows position only, no
  // movement lines. What the caller saw is recorded again on the way out.
  const [firstSeen, setFirstSeen] = useState<ReturnType<typeof readSeenSnapshot>>(null);
  /* The snapshot is intentionally synchronized from localStorage in an effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setFirstSeen(readSeenSnapshot(window.localStorage, deskId));
  }, [deskId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (points.length === 0) return;
    const onLeave = () => writeSeenSnapshot(window.localStorage, deskId, points);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      writeSeenSnapshot(window.localStorage, deskId, points);
    };
  }, [deskId, points]);

  if (watched.length === 0) {
    const suggestion = DESK_INSTRUMENTS.find(s => s.symbol === 'NVDAc' && s.quoteSupported)
      ?? DESK_INSTRUMENTS.find(s => s.quoteSupported);
    return (
      <section className={styles.board} aria-labelledby="board-title" data-foreground={foreground.kind}>
        <div className={styles.boardHead}>
          <p className={styles.eyebrow}>WORKING TRAY</p>
          <span className={styles.boardTally}>CLEAR</span>
        </div>
        <h2 id="board-title" className={styles.boardTitle}>Watched marks.</h2>
        <div className={styles.boardEmpty}>
          <span className={styles.boardPin} aria-hidden="true" />
          <p>Nothing pinned. Pin a mark to keep it on the desk for next visit.</p>
          {suggestion && <button type="button" onClick={() => watch(suggestion.id)}>Pin {suggestion.symbol}</button>}
        </div>
      </section>
    );
  }

  const snapshot = firstSeen;
  const deltas = trayDeltas(snapshot, points);
  const deltaFor = (id: string) => deltas.find(d => d.instrumentId === id);
  const dayLabel = seenDayLabel(snapshot?.seenAt ?? Date.now());
  const hasStale = stale ?? marks.some(mark => mark.reference.status !== 'observed');
  /* Deltas from stale data read as advice. When the room is stale, the
     tray reports position only — no movement lines. */
  const showDeltas = !hasStale && snapshot !== null && deltas.length > 0;

  const quoteIt = (id: string) => {
    /* Carry the side forward, clear the amount: a fresh quantity in the
       right unit beats a stale figure in the wrong one. */
    if (state.draft.side === 'sell') {
      edit({ instrumentId: id, side: 'sell', unit: 'token', amount: '' });
    } else {
      edit({ instrumentId: id, side: 'buy', unit: 'USDC', amount: '' });
    }
    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
    document.getElementById('amount')?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.board} aria-labelledby="board-title" data-foreground={foreground.kind}>
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>WORKING TRAY</p>
        <span className={styles.boardTally}>{watched.length === 1 ? '1 WATCHING' : `${watched.length} WATCHING`}</span>
      </div>
      <h2 id="board-title" className={styles.boardTitle}>Watched marks.</h2>
      {hasStale && asOf && (
        <p className={styles.boardSince} role="status">Reference marks are stale — last known {formatMarkAge(asOf)} ago.</p>
      )}
      {showDeltas && (
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
              {showDeltas && delta && <span className={styles.boardDelta} data-direction={delta.direction}>{deltaLine(delta, dayLabel)}</span>}
              <span className={styles.boardActions}>
                <button
                  type="button"
                  onClick={() => quoteIt(id)}
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
