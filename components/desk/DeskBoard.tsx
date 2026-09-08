'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import styles from './WorkingDesk.module.css';

export const DeskBoard = memo(function DeskBoard({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state, records, historyReady, edit, watched, unwatch } = desk;
  const draftInstrument = DESK_INSTRUMENTS.find(s => s.id === state.draft.instrumentId);
  const latest = records[0];
  const hasDraft = Boolean(state.draft.instrumentId && state.draft.amount);
  const empty = historyReady && records.length === 0 && !hasDraft && watched.length === 0 && state.stage === 'draft';

  return (
    <section className={styles.board} aria-labelledby="board-title">
      <p className={styles.eyebrow}>ON YOUR DESK</p>
      <h2 id="board-title" className={styles.boardTitle}>Working surface.</h2>
      {empty && (
        <p className={styles.boardEmpty}>
          Nothing pinned yet. Your first watched instrument or paper record will appear here.
        </p>
      )}
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
        {hasDraft && (
          <li>
            <span className={styles.boardTag}>IN PROGRESS</span>
            <strong>
              {draftInstrument ? `${draftInstrument.symbol} · ${state.draft.side}` : 'Draft'}
              {state.draft.amount ? ` · ${state.draft.amount} ${state.draft.unit}` : ''}
            </strong>
            <button
              type="button"
              onClick={() => document.getElementById('instruction')?.scrollIntoView({ block: 'start' })}
            >
              Continue drafting
            </button>
          </li>
        )}
        {latest && (
          <li>
            <span className={styles.boardTag}>LAST PAPER</span>
            <strong>
              {latest.quote.inputAmount} {latest.quote.inputSymbol} → {latest.quote.outputAmount}{' '}
              {latest.quote.outputSymbol}
            </strong>
            <button
              type="button"
              onClick={() => {
                edit(latest.quote.intent);
                document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
                document.getElementById('stock')?.focus();
              }}
            >
              Use as a new draft
            </button>
          </li>
        )}
      </ul>
    </section>
  );
});
