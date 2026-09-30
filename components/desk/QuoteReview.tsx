'use client';

import type { SlipQuoteLike } from '@/lib/desk/written-slip';
import { formatAmount } from '@/lib/trading/domain';
import styles from './WorkingDesk.module.css';

export function QuoteReview({
  quote,
  scaled = false,
  sellUnit,
  issuer,
  productName,
  fees,
  slippage,
  minimum = null,
}: {
  quote: SlipQuoteLike & {
    inputAmount?: string;
  };
  scaled?: boolean;
  sellUnit?: string;
  issuer: string | null;
  productName: string | null;
  fees: string;
  slippage: string;
  minimum?: string | null;
}) {
  const selling = quote.intent.side === 'sell';
  const requested = quote.intent.amount;
  const sellUnitLabel = sellUnit ?? `${quote.inputSymbol} tokens`;
  return (
    <dl className={styles.quoteReview}>
      <div className={styles.quoteReviewRow}>
        <dt>{selling ? 'You sell' : 'You spend'}</dt>
        <dd>
          {selling
            ? `${requested} ${sellUnitLabel}`
            : `${quote.inputAmount ?? quote.intent.amount} ${quote.inputSymbol}`}
        </dd>
      </div>
      {selling && scaled && quote.inputAmount && (
        <div className={styles.quoteReviewRow}>
          <dt>Effective amount sold</dt>
          <dd>{quote.inputAmount} {quote.inputSymbol} (scaled units)</dd>
        </div>
      )}
      <div className={styles.quoteReviewRow}>
        <dt>{selling ? 'Estimated proceeds' : 'Estimated received'}</dt>
        <dd>
          {scaled && !selling
            ? `${quote.outputAmount} ${quote.outputSymbol} (scaled units)`
            : `${quote.outputAmount} ${quote.outputSymbol}`}
        </dd>
      </div>
      <div className={styles.quoteReviewRow}>
        <dt>Product</dt>
        <dd>{productName ?? 'Unavailable'}</dd>
      </div>
      <div className={styles.quoteReviewRow}>
        <dt>Issuer</dt>
        <dd>{issuer ?? 'Unavailable'}</dd>
      </div>
      <div className={styles.quoteReviewRow}>
        <dt>Fees</dt>
        <dd>{fees}</dd>
      </div>
      <div className={styles.quoteReviewRow}>
        <dt>Slippage</dt>
        <dd>{slippage}</dd>
      </div>
      {minimum && (
        <div className={styles.quoteReviewRow}>
          <dt>Minimum output</dt>
          <dd>{minimum}</dd>
        </div>
      )}
    </dl>
  );
}

function lamportsToSol(raw: string | null): string {
  if (raw === null || !/^\d+$/.test(raw)) return 'Unavailable';
  return `${formatAmount(BigInt(raw), 9)} SOL`;
}

export function SolanaProposalCosts({
  feeSummary,
}: {
  feeSummary: { networkFeeLamports: string | null; rentLamports: string | null };
}) {
  return (
    <dl className={styles.quoteReview}>
      <div className={styles.quoteReviewRow}>
        <dt>Network fee</dt>
        <dd>{lamportsToSol(feeSummary.networkFeeLamports)}</dd>
      </div>
      <div className={styles.quoteReviewRow}>
        <dt>Account rent</dt>
        <dd>{lamportsToSol(feeSummary.rentLamports)}</dd>
      </div>
    </dl>
  );
}
