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

function ProductTerms({ instrument }: { instrument: (typeof DESK_INSTRUMENTS)[number] | undefined }) {
  return <>
    <p>These are Coinbase-issued tokenized products on Base, not an order on a traditional stock exchange. Live access is restricted to eligible users in permitted jurisdictions outside the US.</p>
    <p>This release is paper-only. Account eligibility, funding and holdings are not checked. Paper requests are capped at 10,000 USDC per buy or 1,000 tokens per sell; these caps are not a measure of safe liquidity.</p>
    {instrument && <p>{instrument.name} · {instrument.decimals} decimal places<br /><code>{instrument.contractAddress}</code></p>}
  </>;
}

export const TradeTicket = memo(function TradeTicket({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { state, historyReady, error, edit, requestQuote, save, cancel, watched, watch, unwatch } = desk;
  const instrument = DESK_INSTRUMENTS.find(s => s.id === state.draft.instrumentId);
  const quote = state.quote;
  const review = useRef<HTMLHeadingElement | null>(null);
  const previousStage = useRef(state.stage);
  const recorded = state.stage === 'saved' && Boolean(quote);
  const pending = state.stage === 'loading';
  const now = useReviewClock(state.stage === 'review');
  const quoteElapsed = useQuoteElapsed(pending);
  const [shareFeedback, setShareFeedback] = useState<{ quoteId: string; text: string } | null>(null);
  const shareNote = shareFeedback?.quoteId === quote?.id ? shareFeedback?.text : null;
  const expired = quote ? !estimateUsable(quote, now) : false;
  /* Freshness of the review window, 1 → just quoted, 0 → expired. Drives the
     draining brass rule on the slip header. Hidden once the trade is recorded. */
  const reviewFresh = quote ? Math.max(0, Math.min(1, (quote.expiresAt - now) / 30000)) : 1;
  const slipStyle = { '--review-fresh': reviewFresh } as CSSProperties;
  useEffect(() => {
    if (previousStage.current === state.stage) return;
    previousStage.current = state.stage;
    const target = state.stage === 'draft' || state.stage === 'cancelled'
      ? document.getElementById('amount')
      : review.current;
    target?.focus({ preventScroll: true });
    const bounds = target?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) target?.scrollIntoView({ block: 'nearest' });
  }, [state.stage]);
  const date = (ms: number) => new Date(ms).toLocaleString();
  const slipActive = Boolean(quote) && (state.stage === 'review' || recorded);
  const view = pending ? 'pending' : recorded ? 'receipt' : slipActive ? 'review' : 'draft';
  const paperNumber = recorded ? 'REC' : view === 'draft' ? '01' : 'SLIP';
  const paperSub = recorded ? 'PAPER RECORD' : view === 'draft' ? 'BASE DESK / PAPER INSTRUCTION' : 'BASE DESK / QUOTATION';
  const message = error || (!recorded ? state.message : null);

  const share = () => {
    if (!instrument || !quote) return;
    void shareRecord(shareText(quote.intent, quote), shareUrl(quote.intent, instrument.symbol)).then(result => {
      setShareFeedback({ quoteId: quote.id, text: result === 'failed' ? 'Could not share. Please try again.' : result === 'copied' ? 'Link copied.' : 'Shared.' });
    });
  };

  return <section
    id="instruction"
    className={`${styles.ticket}${slipActive ? ` ${styles.quotationSlip}` : ''}${recorded ? ` ${styles.ticketRecorded}` : ''}`}
    aria-labelledby="instruction-title"
    data-ticket-view={view}
    data-slip={slipActive ? 'true' : 'false'}
    data-acknowledged={recorded ? 'true' : 'false'}
  >
    {recorded && <span className={styles.stamp} aria-hidden="true"><span>RECORDED</span><small>PAPER · THIS BROWSER</small></span>}
    <div className={styles.paperTop}>
      <HouseMark small />
      <span>CLAFLIN &amp; CO.<small>{paperSub}</small></span>
      <span className={styles.paperNumber}>{paperNumber}</span>
    </div>
    <h1 id="instruction-title" ref={review} tabIndex={-1}>{recorded ? 'Paper recorded.' : pending ? 'Getting your quotation.' : slipActive ? 'Your quotation.' : 'Draft a paper trade.'}</h1>
    {message && <p role={error || state.stage === 'draft' ? 'alert' : 'status'} className={styles.notice}>{message}</p>}
    <div key={view} className={styles.ticketSurface}>
      {view === 'draft' ? <>
        <form onSubmit={e => { e.preventDefault(); void requestQuote(); }}>
          <fieldset id="stock" className={styles.plaques} tabIndex={-1}>
            <legend>Stock</legend>
            {DESK_INSTRUMENTS.filter(stock => stock.quoteSupported).map(stock => (
              <label key={stock.id} className={styles.plaque}>
                <input type="radio" name="instrument" value={stock.id} checked={state.draft.instrumentId === stock.id} onChange={() => edit({ ...state.draft, instrumentId: stock.id })} />
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
              <button key={value} type="button" className={styles.amountChip} data-active={state.draft.amount === value ? 'true' : 'false'} aria-label={`Set amount to ${value} ${state.draft.unit}`} onClick={() => edit({ ...state.draft, amount: value })}>
                {state.draft.side === 'buy' ? `$${value}` : value}
              </button>
            ))}
          </div>
          <p className={styles.product}>{state.draft.side === 'buy' ? 'You choose the spend. The estimate shows how many tokens you would receive.' : 'You choose the token quantity. The estimate shows how much USDC you would receive.'}</p>
          <button className={styles.primary} type="submit">Review estimate<span aria-hidden="true">→</span></button>
        </form>
        <details className={`${styles.productDetails} ${styles.productDossier}`}><summary>Product dossier</summary>
          <p className={styles.dossierHeading}>{instrument ? instrument.name : 'Coinbase Tokenized Stocks'}<span>PRODUCT INFORMATION · NOT PROOF OF OWNERSHIP</span></p>
          <ProductTerms instrument={instrument} />
        </details>
        <p className={styles.paperFoot}>YOUR INSTRUCTION. YOUR DECISION.</p>
      </> : pending ? <div className={styles.pendingSlip}>
        <p className={styles.quoteInstrument}>{state.draft.side === 'buy' ? 'Buy' : 'Sell'} {instrument?.symbol}<span>{instrument?.name}</span></p>
        <p className={styles.pendingAmount}>{state.draft.amount} <span>{state.draft.side === 'buy' ? 'USDC to spend' : `${instrument?.symbol ?? ''} tokens to sell`}</span></p>
        <div className={styles.pendingRule} aria-hidden="true"><i /></div>
        <p role="status" className={styles.pendingStatus}>Requesting a venue estimate…</p>
        <p className={styles.quoteMeta}><span>Aerodrome · Base</span><span aria-live="off">{quoteElapsed.toFixed(1)}s elapsed</span></p>
        <p className={styles.quoteBoundary}>Nothing to approve yet. No funds move.</p>
        <button className={styles.secondary} type="button" onClick={cancel}>Cancel instruction</button>
      </div> : quote && <>
        <div className={`${styles.reviewHeading} ${styles.slipHeading}`} style={slipStyle} data-expired={!recorded && expired}>
          <p className={styles.quoteInstrument}>{quote.intent.side === 'buy' ? 'Buy' : 'Sell'} {instrument?.symbol}<span>{quote.instrumentName} · Coinbase-issued token</span></p>
          {!recorded && <span className={styles.quoteValidity} aria-live="off">{expired ? 'Expired' : `${Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))}s to review`}</span>}
        </div>
        <dl className={styles.quoteExchange}>
          <div><dt>{recorded ? 'Simulated spend' : 'You would spend'}</dt><dd>{quote.inputAmount} <span>{quote.inputSymbol}</span></dd></div>
          <div><dt>{recorded ? 'Simulated receipt' : 'You would receive'}</dt><dd>{quote.outputAmount} <span>{quote.outputSymbol}</span></dd></div>
        </dl>
        <p className={styles.quoteMeta}><span>Aerodrome · Base</span><time dateTime={new Date(quote.blockTimestamp * 1000).toISOString()} title={date(quote.blockTimestamp * 1000)}>As of {new Date(quote.blockTimestamp * 1000).toLocaleTimeString()}</time></p>
        {recorded ? <p className={styles.quoteBoundary} role="status">Saved in this browser. No funds moved.</p> : <>
          <p className={styles.quoteBoundary}>Paper only. No funds move.<span>Pool fees included; gas and additional slippage excluded.</span></p>
          {expired && <p role="status" className={styles.slipNotice}>This estimate expired. Refresh to review new terms.</p>}
          {!historyReady && <p role="status" className={styles.slipNotice}>Browser storage is unavailable. Resolve it before recording.</p>}
        </>}
        <details className={styles.quoteDetails}>
          <summary>Quote &amp; product details</summary>
          <p>Estimate as of {date(quote.blockTimestamp * 1000)}. {recorded ? 'This record preserves the estimate you reviewed.' : `Review expires ${date(quote.expiresAt)}.`}</p>
          <p>This paper trade uses the quoted output, including pool swap fees. No additional slippage, gas or Claflin charges are applied. The estimate is not reserved; no real order will be placed.</p>
          <p>Underlying-share equivalent: {quote.shareEquivalent}. Token quantities are adjusted using the current corporate-action multiplier; a token does not permanently equal one share.</p>
          <p>Chainlink reference valuation: {quote.reference.priceUsdPerToken ? `$${quote.reference.priceUsdPerToken} per token` : 'unavailable'} · {quote.reference.status}.</p>
          {quote.reference.updatedAt && <p>Reference updated: {date(quote.reference.updatedAt * 1000)}</p>}
          <p>This is a token valuation, not an underlying-stock quote or current offer. Market session and oracle pause status are unverified. Older observations may reflect off-hours or a pause.</p>
          <p>{quote.assumptions}</p>
          <p>Base block {quote.blockNumber}<br />Token: <code>{quote.instrumentAddress}</code><br />Pool: <code>{quote.poolAddress}</code></p>
          <ProductTerms instrument={instrument} />
        </details>
        <div className={styles.slipDecision}>
          {recorded ? <>
            <button className={styles.primary} type="button" onClick={() => edit({ ...state.draft, amount: '' })}>New instruction<span aria-hidden="true">→</span></button>
            <div className={styles.slipActions}>
              <a href="#paper-history" className={styles.secondary}>Your record</a>
              <details className={styles.receiptTools}>
                <summary>Keep or share</summary>
                <div>
                  <button type="button" className={styles.secondary} onClick={share}>Share this paper trade</button>
                  {instrument && <button type="button" className={styles.secondary} onClick={() => watched.includes(instrument.id) ? unwatch(instrument.id) : watch(instrument.id)}>{watched.includes(instrument.id) ? 'Stop watching' : 'Watch'} {instrument.symbol}</button>}
                  <button type="button" className={styles.secondary} onClick={() => void requestQuote()}>Re-quote {instrument?.symbol ?? 'this mark'}</button>
                  {shareNote && <p role="status" className={styles.shareFeedback}>{shareNote}</p>}
                </div>
              </details>
            </div>
          </> : <>
            {!expired && <p className={styles.slipConsent}>Recording saves a simulation, visible to anyone using this browser profile.</p>}
            {expired
              ? <button className={styles.primary} type="button" onClick={() => void requestQuote()}>Refresh estimate<span aria-hidden="true">↻</span></button>
              : <button className={styles.primary} type="button" disabled={!historyReady} onClick={save}>Record paper trade<span aria-hidden="true">→</span></button>}
            <div className={styles.slipActions}>
              <button className={styles.secondary} type="button" onClick={() => edit(state.draft)}>Edit instruction</button>
              <button className={styles.secondary} type="button" onClick={cancel}>Cancel instruction</button>
            </div>
          </>}
        </div>
      </>}
    </div>
  </section>;
});
