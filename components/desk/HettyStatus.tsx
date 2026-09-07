'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { estimateUsable } from '@/lib/trading/workflow';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import styles from './WorkingDesk.module.css';

export const HettyStatus = memo(function HettyStatus({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state } = desk;
  const quote = state.quote;
  const now = useReviewClock(state.stage === 'review');
  const expired = quote ? !estimateUsable(quote, now) : false;
  const remaining = quote ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) : 0;
  const symbol = quote?.outputSymbol && quote.intent.side === 'buy' ? quote.outputSymbol : quote?.inputSymbol;

  let line: string;
  switch (state.stage) {
    case 'loading':
      line = 'Preparing your estimate…';
      break;
    case 'review':
      line = expired
        ? 'That estimate expired — refresh when you are ready.'
        : `For your review${symbol ? ` — ${symbol}` : ''}, ${remaining}s remaining on this estimate.`;
      break;
    case 'saved':
      line = 'Paper trade recorded in this browser. Nothing moved onchain.';
      break;
    default:
      line = state.draft.instrumentId
        ? 'Draft on the desk. Request an estimate when the amount is set.'
        : 'The desk is clear. Choose a stock to begin.';
  }

  return (
    <p className={styles.hettyStatus} role="status" aria-live="polite" data-stage={state.stage}>
      <span className={styles.hettyStatusLabel}>HETTY</span>
      {line}
    </p>
  );
});
