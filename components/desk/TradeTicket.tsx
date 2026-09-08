'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import { estimateUsable } from '@/lib/trading/workflow';
import type { TradeIntent } from '@/lib/trading/domain';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { shareRecord, shareText, shareUrl } from '@/lib/share';
import { HouseMark } from './HouseMark';
import styles from './WorkingDesk.module.css';

/** Honest quote status — the real elapsed wait. The venue does not expose
 *  granular steps to the client, so we show the actual time spent, not staged
 *  copy. Ticks at 5Hz — smooth enough for a seconds readout, cheap on the tree. */
function useQuoteElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  /* The clock state is intentionally synchronized to wall time in an effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(timer);
  }, [active]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return elapsed;
}

const AMOUNT_CHIPS = { buy: ['10', '25', '100'], sell: ['1', '5', '10'] } as const;

export const TradeTicket = memo(function TradeTicket({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state, historyReady, error, edit, requestQuote, save, cancel, watched, watch, unwatch } = desk;
  const instrument = DESK_INSTRUMENTS.find(s => s.id === state.draft.instrumentId);
  const quote = state.quote;
  const review = useRef<HTMLElement | null>(null);
  const recorded = state.stage === 'saved';
  const now = useReviewClock(state.stage === 'review');
  const quoteElapsed = useQuoteElapsed(state.stage === 'loading');
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => { if (state.stage !== 'saved') setShareNote(null); }, [state.stage]);
  const expired = quote ? !estimateUsable(quote, now) : false;
  /* Freshness of the review window, 1 → just quoted, 0 → expired. Drives the
     draining brass rule on the slip header. Hidden once the trade is recorded. */
  const reviewFresh = quote ? Math.max(0, Math.min(1, (quote.expiresAt - now) / 30000)) : 1;
  const slipStyle = { '--review-fresh': reviewFresh } as CSSProperties;
  useEffect(() => { if (state.stage === 'review' || recorded) review.current?.focus(); }, [state.stage, recorded]);
  const date = (ms: number) => new Date(ms).toLocaleString();

  const slipActive = Boolean(quote) && (state.stage === 'review' || recorded || state.stage === 'loading');
  const paperNumber = recorded ? 'REC' : slipActive ? 'SLIP' : '01';
  const paperSub = recorded
    ? 'PAPER RECORD / THIS BROWSER'
    : slipActive
      ? 'QUOTATION / FOR YOUR REVIEW'
      : 'HETTY’S DESK / BASE';

  return <section
    id="instruction"
    className={`${styles.ticket}${slipActive ? ` ${styles.quotationSlip}` : ''}${recorded ? ` ${styles.ticketRecorded}` : ''}`}
    aria-labelledby="instruction-title"
    data-slip={slipActive ? 'true' : 'false'}
    data-acknowledged={recorded ? 'true' : 'false'}
  >
    {recorded && <span className={styles.stamp} aria-hidden="true"><span>RECORDED</span><small>PAPER · THIS BROWSER</small></span>}
    <div className={styles.paperTop}>
      <HouseMark small />
      <span>CLAFLIN &amp; CO.<small>{paperSub}</small></span>
      <span className={styles.paperNumber}>{paperNumber}</span>
    </div>
    <h2 id="instruction-title">{recorded ? 'Paper recorded.' : slipActive ? 'Quotation slip.' : 'What would you like to trade?'}</h2>
    <form onSubmit={e => { e.preventDefault(); void requestQuote(); }}>
      <fieldset id="stock" className={styles.plaques} tabIndex={-1}>
        <legend>Stock</legend>
        {DESK_INSTRUMENTS.filter(stock => stock.quoteSupported).map(stock => (
          <label key={stock.id} className={styles.plaque}>
            <input type="radio" name="instrument" value={stock.id} checked={state.draft.instrumentId === stock.id} disabled={state.stage === 'loading' || recorded} onChange={() => edit({ ...state.draft, instrumentId: stock.id })} />
            <span className={styles.plaqueSymbol}>{stock.symbol}</span>
            <span className={styles.plaqueName}>{stock.name}</span>
          </label>
        ))}
      </fieldset>
      <p className={styles.product}>{instrument ? `${instrument.symbol} · Coinbase-issued token on Base` : 'Coinbase Tokenized Stocks on Base.'}</p>
      <div className={styles.fields}>
        <div><label htmlFor="side">Instruction</label><select id="side" value={state.draft.side} onChange={e => edit({ ...state.draft, side: e.target.value as 'buy' | 'sell', unit: e.target.value === 'buy' ? 'USDC' : 'token', amount: '' } as TradeIntent)}><option value="buy">Buy</option><option value="sell">Sell</option></select></div>
        <div><label htmlFor="amount">{state.draft.side === 'buy' ? 'USDC to spend' : `${instrument?.symbol || 'Stock'} tokens to sell`}</label><input id="amount" inputMode="decimal" autoComplete="off" placeholder={state.draft.side === 'buy' ? 'Amount in USDC' : 'Token quantity'} maxLength={40} value={state.draft.amount} onChange={e => edit({ ...state.draft, amount: e.target.value })} required /></div>
      </div>
      <div className={styles.amountChips} role="group" aria-label="Quick amounts">
        {AMOUNT_CHIPS[state.draft.side].map(value => (
          <button key={value} type="button" className={styles.amountChip} data-active={state.draft.amount === value ? 'true' : 'false'} aria-label={`Set amount to ${value} ${state.draft.unit}`} disabled={state.stage === 'loading' || recorded} onClick={() => edit({ ...state.draft, amount: value })}>
            {state.draft.side === 'buy' ? `$${value}` : value}
          </button>
        ))}
      </div>
      <p className={styles.product}>{state.draft.side === 'buy' ? 'You choose the spend. The estimate shows how many tokens you would receive.' : 'You choose the token quantity. The estimate shows how much USDC you would receive.'}</p>
      <button className={styles.primary} type="submit" disabled={state.stage === 'loading' || recorded}>{state.stage === 'loading' ? 'Preparing your estimate…' : quote && !recorded ? 'Refresh estimate' : recorded ? 'Estimate locked to this record' : 'Review estimate'}<span aria-hidden="true">→</span></button>
    </form>
    {state.stage === 'loading' && <p role="status" className={styles.quoteProgress}>Calling the venue on Base · {quoteElapsed.toFixed(1)}s</p>}
    {(state.stage === 'loading' || state.stage === 'review') && <button className={styles.secondary} type="button" onClick={cancel}>Cancel instruction</button>}
    {(error || state.message) && <p role={error || state.stage === 'draft' ? 'alert' : 'status'} className={styles.notice}>{error || state.message}</p>}
    {quote && <section ref={review} tabIndex={-1} className={`${styles.review} ${styles.slipBody}`} style={slipStyle} aria-labelledby="review-title">
      <div className={styles.reviewHeading}><h3 id="review-title">{recorded ? 'Acknowledged.' : 'For your review.'}</h3><span>{recorded ? 'RECORDED / PAPER TRADE' : expired ? 'EXPIRED' : 'PAPER ESTIMATE'}</span></div>
      <dl className={styles.slipLedger}>
        <div className={styles.slipHighlight}><dt>You would spend</dt><dd>{quote.inputAmount} {quote.inputSymbol}</dd></div>
        <div className={styles.slipHighlight}><dt>You would receive</dt><dd>{quote.outputAmount} {quote.outputSymbol}</dd></div>
        <div><dt>Venue</dt><dd>Aerodrome · Base</dd></div>
        <div><dt>As of</dt><dd>{date(quote.blockTimestamp * 1000)}</dd></div>
        <div><dt>Review window</dt><dd>{recorded ? 'Recorded estimate' : expired ? 'Expired — refresh to record' : <span aria-live="off">{Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))}s remaining</span>}</dd></div>
      </dl>
      {expired && state.stage === 'review' && <p role="status" className={styles.notice}>This estimate has expired. Refresh it before recording.</p>}
      <p className={styles.assumptions}>This paper trade uses the quoted output, including pool swap fees. No additional slippage, gas or Claflin charges are applied. The estimate is not reserved; no real order will be placed.</p>
      <details><summary>Pricing, product and simulation details</summary>
        <p>Underlying-share equivalent: {quote.shareEquivalent}. Token quantities are adjusted using the current corporate-action multiplier; a token does not permanently equal one share.</p>
        <p>Chainlink reference valuation: {quote.reference.priceUsdPerToken ? `$${quote.reference.priceUsdPerToken} per token` : 'unavailable'} · {quote.reference.status}.</p>
        {quote.reference.updatedAt && <p>Reference updated: {date(quote.reference.updatedAt * 1000)}</p>}
        <p>This is a token valuation, not an underlying-stock quote or current offer. Market session and oracle pause status are unverified. Older observations may reflect off-hours or a pause.</p>
        <p>{quote.assumptions}</p>
        <p>Base block {quote.blockNumber}<br />Token: <code>{quote.instrumentAddress}</code><br />Pool: <code>{quote.poolAddress}</code></p>
      </details>
      {state.stage === 'review' && <>
        <p className={styles.localConsent}>Recording saves this simulation in this browser, visible to anyone using this browser profile. It does not sync to an account.</p>
        <button type="button" className={styles.primary} disabled={expired || !historyReady} onClick={save}>Record paper trade<span aria-hidden="true">→</span></button>
      </>}
      {recorded && <>
        <button type="button" className={`${styles.primary} ${styles.acknowledgedAction}`} disabled>
          <span className={styles.checkMark} aria-hidden="true">✓</span>
          <span>Paper recorded</span>
        </button>
        <p className={styles.receiptStatus} role="status">
          {quote.intent.side === 'buy' ? 'Buy' : 'Sell'} recorded in this browser only. Nothing moved onchain.
        </p>
        <div className={styles.recordNext}>
          <p className={styles.recordNextLabel}>What next?</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              if (!instrument || !quote) return;
              void shareRecord(shareText(quote.intent, quote), shareUrl(quote.intent, instrument.symbol))
                .then(result => setShareNote(result === 'failed' ? 'Could not share — copy the address bar instead.' : result === 'copied' ? 'Link copied — paste it anywhere.' : 'Shared.'));
            }}
          >
            {shareNote ?? 'Share this paper trade'}
          </button>
          {instrument && (watched.includes(instrument.id) ? (
            <button type="button" className={styles.secondary} onClick={() => unwatch(instrument.id)}>Stop watching {instrument.symbol}</button>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => { watch(instrument.id); document.getElementById('on-desk')?.scrollIntoView({ block: 'start' }); }}
            >
              Watch {instrument.symbol} on your desk
            </button>
          ))}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => { edit({ ...state.draft, amount: '' }); document.getElementById('amount')?.focus(); }}
          >
            Re-quote {instrument?.symbol ?? 'this mark'}
          </button>
          <button className={styles.secondary} type="button" onClick={cancel}>Clear the ticket</button>
        </div>
      </>}
    </section>}
    <details className={styles.productDetails}><summary>About these products</summary>
      <p>These are Coinbase-issued tokenized products on Base, not an order on a traditional stock exchange. Live access is restricted to eligible users in permitted jurisdictions outside the US.</p>
      <p>This release is paper-only. Account eligibility, funding and holdings are not checked. Paper requests are capped at 10,000 USDC per buy or 1,000 tokens per sell; these caps are not a measure of safe liquidity.</p>
      {instrument && <p>{instrument.name} · {instrument.decimals} decimal places<br /><code>{instrument.contractAddress}</code></p>}
    </details>
    <p className={styles.paperFoot}>{recorded ? 'RECORDED. YOUR DECISION STOOD.' : 'YOUR INSTRUCTION. YOUR DECISION.'}</p>
  </section>;
});
