'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import styles from './WorkingDesk.module.css';

export const DeskBoard = memo(function DeskBoard({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state, edit, watched, unwatch } = desk;
  if (watched.length === 0) return null;

  return (
    <section className={styles.board} aria-labelledby="board-title">
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>WORKING TRAY</p>
        <span className={styles.boardTally}>{watched.length === 1 ? '1 WATCHING' : `${watched.length} WATCHING`}</span>
      </div>
      <h2 id="board-title" className={styles.boardTitle}>Watched marks.</h2>
      <ul className={styles.boardList}>
        {watched.map(id => {
          const stock = DESK_INSTRUMENTS.find(s => s.id === id);
          if (!stock) return null;
          return (
            <li key={id}>
              <span className={styles.boardTag}>WATCHING</span>
              <strong>{stock.symbol} · {stock.name}</strong>
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
    </section>
  );
});
