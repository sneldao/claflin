'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import styles from './WorkingDesk.module.css';

export const DeskBoard = memo(function DeskBoard({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state, records, historyReady, edit, watched, watch, unwatch } = desk;
  const draftInstrument = DESK_INSTRUMENTS.find(s => s.id === state.draft.instrumentId);
  const latest = records[0];
  const hasDraft = Boolean(state.draft.instrumentId && state.draft.amount);
  const empty = historyReady && records.length === 0 && !hasDraft && watched.length === 0 && state.stage === 'draft';
  const pinned = watched.length + (hasDraft ? 1 : 0) + (latest ? 1 : 0);
  /* The first mark worth pinning: whatever is on the ticket, else the first
     quotable instrument on the desk. */
  const suggestion = draftInstrument ?? DESK_INSTRUMENTS.find(s => s.quoteSupported && !watched.includes(s.id));

  return (
    <section className={styles.board} aria-labelledby="board-title">
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>ON YOUR DESK</p>
        <span className={styles.boardTally}>{empty || pinned === 0 ? 'CLEAR' : `${pinned} PINNED`}</span>
      </div>
      <h2 id="board-title" className={styles.boardTitle}>Working surface.</h2>
      {empty && (
        <div className={styles.boardEmpty}>
          <span className={styles.boardPin} aria-hidden="true" />
          <p>Nothing pinned yet. Watched instruments and your last paper trade rest here, where you left them.</p>
          {suggestion && (
            <button type="button" onClick={() => watch(suggestion.id)}>
              Pin {suggestion.symbol} to the desk
            </button>
          )}
        </div>
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
