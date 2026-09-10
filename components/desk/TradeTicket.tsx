'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatEther } from 'viem';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import { estimateUsable } from '@/lib/trading/workflow';
import { LIVE_ASSUMPTIONS, LIVE_EXECUTION_ENABLED, PAPER_ASSUMPTIONS } from '@/lib/trading/domain';
import type { TradeIntent, QuoteEstimate } from '@/lib/trading/domain';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { useDeskExecution } from '@/lib/trading/useDeskExecution';
import { getBaseExplorerTxUrl } from '@/lib/base-chain';
import { formatRecordedTime, isUnfinishedWork } from '@/lib/trading/desk-documents';
import { liveEvidence, paperOutcomeCopy } from '@/lib/trading/outcomes';
import { shareRecord, shareText, shareUrl } from '@/lib/share';
import { HouseMark } from './HouseMark';
import { DeskTerm } from './DeskTerm';
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

function Drawer({ className, trigger, title, testId, children }: {
  className?: string;
  trigger: React.ReactNode;
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  /* Open modally where supported; fall back to a non-modal open panel so
     older browsers still get the disclosure, without crashing on a missing
     showModal. Focus always lands on Close, and always returns to the
     trigger — including Escape and backdrop dismiss. */
  const openDrawer = () => {
    const panel = ref.current;
    if (!panel) return;
    try {
      if (typeof panel.showModal === 'function') panel.showModal();
      else panel.setAttribute('open', '');
    } catch {
      try { panel.setAttribute('open', ''); } catch { /* panel stays shut */ }
    }
    setOpen(true);
    queueMicrotask(() => closeRef.current?.focus());
  };
  const closeDrawer = () => {
    const panel = ref.current;
    if (!panel) return;
    try {
      if (panel.hasAttribute('open') && typeof panel.close !== 'function') panel.removeAttribute('open');
      else panel.close();
    } catch {
      try { panel.removeAttribute('open'); } catch { /* already shut */ }
    }
    setOpen(false);
    triggerRef.current?.focus();
  };
  const focusables = () => {
    if (!ref.current) return [] as HTMLElement[];
    return Array.from(ref.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href]:not([aria-disabled="true"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.tabIndex >= 0);
  };
  const trapFocus = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const elements = focusables();
    if (elements.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const index = current ? elements.indexOf(current) : -1;
    if (index === -1) return;
    e.preventDefault();
    const next = e.shiftKey
      ? elements[(index - 1 + elements.length) % elements.length]
      : elements[(index + 1) % elements.length];
    next.focus();
  };
  return (
    <div className={className ? `${styles.drawer} ${className}` : styles.drawer} data-open={open ? 'true' : 'false'}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.drawerToggle}
        aria-expanded={open}
        onClick={openDrawer}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        className={styles.drawerPanel}
        aria-label={title}
        data-testid={testId}
        onClick={(e) => { if (e.target === ref.current) closeDrawer(); }}
        onClose={() => { setOpen(false); triggerRef.current?.focus(); }}
        onKeyDown={trapFocus}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.drawerClose}
          onClick={closeDrawer}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          ×
        </button>
        {children}
      </dialog>
    </div>
  );
}

const SLIPPAGE_OPTIONS = [50, 100, 200] as const;

function LiveExecution({ quote, execution, expired, expiringSoon, onApproved }: {
  quote: QuoteEstimate;
  execution: ReturnType<typeof useDeskExecution>;
  expired: boolean;
  expiringSoon: boolean;
  onApproved?: () => void;
}) {
  const auth = useDeskAuth();
  const { state, approve, execute, reset, needsApproval, insufficientBalance } = execution;
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const busy = state.stage === 'checking' || state.stage === 'approving' || state.stage === 'swapping' || state.stage === 'confirming';

  if (!auth.enabled) {
    return <p className={styles.slipNotice} role="status">Live execution requires an account.</p>;
  }
  if (!auth.authenticated) {
    return <button type="button" className={styles.primary} onClick={auth.login}>Sign in to trade live</button>;
  }
  if (!auth.walletAddress) {
    return <button type="button" className={styles.primary} onClick={auth.linkWallet}>Link a wallet to trade live</button>;
  }

  if (state.stage === 'done') {
    const { outcome } = state;
    const hash = outcome.hash && outcome.hash !== '0x' ? outcome.hash : null;
    return (
      <div className={styles.liveBox} data-outcome={outcome.status}>
        <p className={styles.liveTitle}>LIVE EXECUTION · BASE<span>{liveEvidence(outcome.status).label}</span></p>
        <p className={styles.slipNotice} role="status">{outcome.message}</p>
        {hash && (
          <p className={styles.liveMeta}>
            Transaction <code>{hash.slice(0, 10)}…{hash.slice(-6)}</code> · <a href={getBaseExplorerTxUrl(hash)} target="_blank" rel="noreferrer">View on BaseScan</a>
          </p>
        )}
        {outcome.status === 'failed' && (
          <button type="button" className={styles.secondary} onClick={reset}>Check the wallet and try again</button>
        )}
      </div>
    );
  }

  /* Approval is quote-independent (it grants the venue a spending allowance),
     so it stays available on a stale estimate — approval, then a fresh
     estimate, then the swap. Only the swap itself needs a live estimate. */
  const showApproveStep = needsApproval || state.stage === 'approving';
  const approveDisabled = state.stage !== 'ready' || !needsApproval || insufficientBalance;
  const executeDisabled = busy || state.stage !== 'ready' || needsApproval || insufficientBalance || expired || expiringSoon;

  return (
    <div className={styles.liveBox} data-live="true">
      <p className={styles.liveTitle}>LIVE EXECUTION · BASE<span>real funds move from your wallet</span></p>
      <div className={styles.liveRow}>
        <span className={styles.liveRowLabel}>Slippage tolerance</span>
        <div className={styles.amountChips} role="group" aria-label="Slippage tolerance">
          {SLIPPAGE_OPTIONS.map(bps => (
            <button
              key={bps}
              type="button"
              className={styles.amountChip}
              data-active={slippageBps === bps ? 'true' : 'false'}
              disabled={busy}
              aria-label={`Set slippage tolerance to ${bps / 100} percent`}
              onClick={() => setSlippageBps(bps)}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>
      <p className={styles.liveMeta}>
        {state.stage === 'ready' && state.gasCostWei !== null
          ? `Network gas ≈ ${formatEther(state.gasCostWei)} ETH on Base.`
          : state.stage === 'ready' && !needsApproval
            ? 'Gas estimate unavailable — Base network fees apply, typically a few cents.'
            : 'The gas estimate appears once approval is in place.'}
      </p>
      {state.stage === 'idle' && <p className={styles.slipNotice} role="status">Wallet status unavailable. Check your connection, then refresh the estimate.</p>}
      {insufficientBalance && <p className={styles.slipNotice} role="status">The connected wallet does not hold enough {quote.inputSymbol} for this instruction.</p>}
      {showApproveStep ? (
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={approveDisabled}
            onClick={() => { void approve().then(ok => { if (ok) onApproved?.(); }); }}
          >
            {state.stage === 'approving' ? 'Approving — confirm in your wallet…' : `Approve ${quote.inputSymbol} spending`}
            <span aria-hidden="true">1/2</span>
          </button>
          <p className={styles.slipNotice} role="status">Step 1 of 2. This lets the venue spend exactly this amount; the swap itself is a separate signature.</p>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={executeDisabled}
            onClick={() => { void execute(slippageBps); }}
          >
            {state.stage === 'swapping' ? 'Executing — confirm in your wallet…' : state.stage === 'confirming' ? 'Submitted — waiting for Base…' : 'Execute on Base'}
            <span aria-hidden="true">2/2</span>
          </button>
          <p className={styles.slipNotice} role="status">
            {state.stage === 'checking'
              ? 'Step 2 of 2. Reading the wallet…'
              : expired || expiringSoon
                ? 'Step 2 of 2. Refresh the estimate for fresh terms before executing.'
                : 'Step 2 of 2. One signature; the quoted minimum protects the fill.'}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The ticket: the caller's own surface. A `spokenLine` — the caller's words
 * captured live from the direct line — is captioned on the blotter so the
 * instruction exists in writing too, not only in the room's air. When the
 * line is live, `applied` carries what the voice actually resolved onto the
 * ticket: heard, said, and applied stay distinct.
 */
export const TradeTicket = memo(function TradeTicket({ desk, spokenLine, hettyLine, live, applied }: { desk: ReturnType<typeof useTradingDesk>; spokenLine?: string | null; hettyLine?: string | null; live?: boolean; applied?: string | null }) {
  const { state, records, historyReady, error, edit, requestQuote, save, cancel, watched, watch, unwatch, viewedRecordId, dismissRecord, foreground } = desk;
  const openedRecord = viewedRecordId ? records.find(record => record.id === viewedRecordId) : undefined;
  const filedRecord = openedRecord ?? (state.stage === 'saved' && state.quote
    ? records.find(record => record.id === state.quote!.id)
    : undefined);
  const missing = foreground.kind === 'missing';
  const quote = openedRecord?.quote ?? (foreground.kind === 'archive' || missing ? undefined : state.quote);
  const instrument = DESK_INSTRUMENTS.find(s => s.id === (quote?.intent.instrumentId ?? foreground.instrumentId ?? undefined));
  /* Live execution is ticket-level state so the slip can stamp the outcome
     the way a paper receipt is stamped — a fill is furniture, not a toast. */
  const [liveMode, setLiveMode] = useState(LIVE_EXECUTION_ENABLED);
  const liveQuote = LIVE_EXECUTION_ENABLED && liveMode && foreground.kind !== 'receipt' && foreground.kind !== 'archive' && !missing && quote ? quote : null;
  const execution = useDeskExecution(liveQuote);
  const liveOutcome = execution.state.stage === 'done' ? execution.state.outcome : null;
  const liveStamp = liveOutcome && liveOutcome.status !== 'failed'
    ? liveOutcome.status === 'filled' ? 'FILLED' : liveOutcome.status === 'submitted' ? 'SUBMITTED' : 'UNCONFIRMED'
    : null;
  const review = useRef<HTMLHeadingElement | null>(null);
  const previousFocus = useRef(`${state.stage}:${viewedRecordId ?? ''}:${foreground.kind}`);
  const recorded = foreground.kind === 'receipt' || foreground.kind === 'archive';
  const browsing = foreground.kind === 'archive' || missing;
  const pending = foreground.kind === 'pending';
  const now = useReviewClock(state.stage === 'review' && !openedRecord && !missing);
  const quoteElapsed = useQuoteElapsed(pending);
  const [shareFeedback, setShareFeedback] = useState<{ quoteId: string; text: string } | null>(null);
  const shareNote = shareFeedback?.quoteId === quote?.id ? shareFeedback?.text : null;
  const expired = quote ? !estimateUsable(quote, now) : false;
  const secondsLeft = quote && !recorded ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) : null;
  /* The last seconds are not for deciding: freeze recording so a click
     cannot race expiry. Five seconds of quiet beats an ambiguous file. */
  const expiringSoon = !recorded && !expired && secondsLeft !== null && secondsLeft <= 5;
  /* Typing while the line is live: Hetty holds, the ticket listens to keys. */
  const [typing, setTyping] = useState(false);
  /* While the line is live, a changed control pulses once — the caller sees
     Hetty's words land on the paper, not just hears them in the room. */
  const [flash, setFlash] = useState<'instrument' | 'side' | 'amount' | null>(null);
  const prevDraftRef = useRef(state.draft);
  /* The flash flag is intentionally synchronized to draft changes in an effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prev = prevDraftRef.current;
    prevDraftRef.current = state.draft;
    if (!live) return;
    const changed = state.draft.instrumentId !== prev.instrumentId ? 'instrument'
      : state.draft.side !== prev.side ? 'side'
      : state.draft.amount !== prev.amount ? 'amount'
      : null;
    if (!changed) return;
    setFlash(changed);
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
  }, [live, state.draft]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /* Freshness of the review window, 1 → just quoted, 0 → expired. Drives the
     draining brass rule on the slip header. Hidden once the trade is recorded. */
  const reviewFresh = quote ? Math.max(0, Math.min(1, (quote.expiresAt - now) / 30000)) : 1;
  const slipStyle = { '--review-fresh': reviewFresh } as CSSProperties;
  useEffect(() => {
    const focusKey = `${state.stage}:${viewedRecordId ?? ''}:${foreground.kind}`;
    if (previousFocus.current === focusKey) return;
    previousFocus.current = focusKey;
    const target = openedRecord || missing || state.stage === 'review' || state.stage === 'saved' || state.stage === 'loading'
      ? review.current
      : document.getElementById('amount');
    target?.focus({ preventScroll: true });
  }, [foreground.kind, missing, openedRecord, state.stage, viewedRecordId]);
  const date = (ms: number) => new Date(ms).toLocaleString();
  const slipActive = Boolean(quote) && (state.stage === 'review' || recorded);
  const view = missing ? 'missing' : openedRecord || recorded ? 'receipt' : pending ? 'pending' : slipActive ? 'review' : 'draft';
  const paperNumber = recorded ? 'REC' : view === 'draft' ? '01' : 'SLIP';
  const paperSub = missing ? 'PAPER RECORD / UNAVAILABLE' : recorded ? 'PAPER RECORD' : view === 'draft' ? 'BASE DESK / PAPER INSTRUCTION' : 'BASE DESK / QUOTATION';
  const filed = recorded ? paperOutcomeCopy() : null;
  const message = error || (view === 'draft' || view === 'pending' || view === 'review' ? state.message : null);
  const backLabel = isUnfinishedWork(state) ? 'Back to your instruction' : 'Back to the ticket';
  const title = missing ? 'That record is no longer here.' : recorded ? filed!.heading : pending ? 'Getting your quotation.' : slipActive ? 'Your quotation.' : 'Draft a paper trade.';

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
    data-foreground={foreground.kind}
    data-slip={slipActive ? 'true' : 'false'}
    data-acknowledged={recorded ? 'true' : 'false'}
  >
    {recorded && <span className={styles.stamp} aria-hidden="true"><span>RECORDED</span><small>{filed?.stamp ?? 'PAPER · FILED'}</small></span>}
    {liveStamp && <span className={`${styles.stamp} ${styles.stampLive}`} aria-hidden="true"><span>{liveStamp}</span><small>LIVE · BASE</small></span>}
    <div className={styles.paperTop}>
      <HouseMark small />
      <span>CLAFLIN &amp; CO.<small>{paperSub}</small></span>
      <span className={styles.paperNumber}>{paperNumber}</span>
    </div>
    <h1 id="instruction-title" ref={review} tabIndex={-1}>{title}</h1>
    {spokenLine && <p className={styles.spokenLine} role="status" aria-live="polite">You said: <em>{spokenLine}</em></p>}
    {live && hettyLine && <p className={styles.spokenLine} data-voice="hetty" role="status" aria-live="polite">Hetty: <em>{hettyLine}</em></p>}
    {live && applied && <p className={styles.spokenLine} data-voice="hetty" role="status" aria-live="polite">On the ticket: <em>{applied.replace(/^On the ticket:\s*/, '')}</em></p>}
    {live && typing && view === 'draft' && <p className={styles.slipNotice} role="status">Typing — Hetty holds the line.</p>}
    {message && <p role={error || state.stage === 'draft' ? 'alert' : 'status'} className={styles.notice}>{message}</p>}
    {browsing && (
      <div className={styles.slipActions}>
        <button type="button" className={styles.secondary} onClick={dismissRecord}>{backLabel}</button>
      </div>
    )}
    <div key={view} className={styles.ticketSurface}>
      {missing ? <div className={styles.pendingSlip}>
        <p className={styles.quoteBoundary} role="status">This paper record is no longer in this browser.<span>It may have been deleted in another tab, or storage could not be read. Nothing else on this desk was changed.</span></p>
      </div> : view === 'draft' ? <>
        <form onSubmit={e => { e.preventDefault(); void requestQuote(); }}>
          <fieldset id="stock" className={styles.plaques} tabIndex={-1}>
            <legend>Stock</legend>
            {DESK_INSTRUMENTS.filter(stock => stock.quoteSupported).map(stock => (
              <label key={stock.id} className={styles.plaque} data-flash={flash === 'instrument' && state.draft.instrumentId === stock.id ? 'true' : undefined}>
                <input type="radio" name="instrument" value={stock.id} checked={state.draft.instrumentId === stock.id} onChange={() => edit({ ...state.draft, instrumentId: stock.id })} />
                <span className={styles.plaqueSymbol}>{stock.symbol}</span>
                <span className={styles.plaqueName}>{stock.name}</span>
              </label>
            ))}
          </fieldset>
          <p className={styles.product}>{instrument ? `${instrument.symbol} · Coinbase-issued token on Base` : 'Coinbase Tokenized Stocks on Base.'}</p>
          <div className={styles.fields}>
            <div><label htmlFor="side">Instruction</label><select id="side" data-flash={flash === 'side' ? 'true' : undefined} value={state.draft.side} onChange={e => edit({ ...state.draft, side: e.target.value as 'buy' | 'sell', unit: e.target.value === 'buy' ? 'USDC' : 'token', amount: '' } as TradeIntent)}><option value="buy">Buy</option><option value="sell">Sell</option></select></div>
            <div><label htmlFor="amount">{state.draft.side === 'buy' ? 'USDC to spend' : `${instrument?.symbol || 'Stock'} tokens to sell`}</label><input id="amount" data-flash={flash === 'amount' ? 'true' : undefined} inputMode="decimal" autoComplete="off" placeholder={state.draft.side === 'buy' ? 'Amount in USDC' : 'Token quantity'} maxLength={40} value={state.draft.amount} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={e => edit({ ...state.draft, amount: e.target.value })} required /></div>
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
        <Drawer
          className={styles.productDetails}
          trigger="Product dossier"
          title="Product dossier"
          testId="product-dossier-panel"
        >
          <p className={styles.dossierHeading}>{instrument ? instrument.name : 'Coinbase Tokenized Stocks'}<span>PRODUCT INFORMATION · NOT PROOF OF OWNERSHIP</span></p>
          <ProductTerms instrument={instrument} />
        </Drawer>
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
        <p className={styles.quoteMeta}>
          <span>Aerodrome · Base</span>
          <time dateTime={new Date(quote.quotedAt).toISOString()} title={date(quote.quotedAt)}>Quoted {new Date(quote.quotedAt).toLocaleTimeString()}</time>
          {filedRecord && <time dateTime={new Date(filedRecord.createdAt).toISOString()}>Recorded {formatRecordedTime(filedRecord.createdAt)}</time>}
        </p>
        {recorded ? <p className={styles.quoteBoundary} role="status">{filed!.acknowledgement}<span>{filed!.boundary}</span></p> : <>
          {liveMode ? (
            <p className={styles.quoteBoundary} data-live="true">Live execution enabled.<span>This is a real onchain swap. Funds will move from the connected wallet.</span></p>
          ) : (
            <p className={styles.quoteBoundary}>Paper only. No funds move.<span>Pool fees included; gas and additional <DeskTerm term="slippage" definition="The gap between the price quoted and the price a real order fills at. On paper it is excluded; on a live desk it is the cost of the market moving while your instruction travels." /> excluded.</span></p>
          )}
          {expired && <p role="status" className={styles.slipNotice}>This estimate expired. Refresh to review new terms.</p>}
          {!historyReady && <p role="status" className={styles.slipNotice}>Browser storage is unavailable. Resolve it before recording.</p>}
        </>}
        <Drawer
          className={styles.quoteDetails}
          trigger="Quote &amp; product details"
          title="Quote and product details"
          testId="quote-details-panel"
        >
          <p>Estimate as of {date(quote.blockTimestamp * 1000)}. {recorded ? 'This record preserves the estimate you reviewed.' : `Review expires ${date(quote.expiresAt)}.`}</p>
          <p>This paper trade uses the quoted output, including pool swap fees. No additional slippage, gas or Claflin charges are applied. The estimate is not reserved; no real order will be placed.</p>
          <p>Underlying-share equivalent: {quote.shareEquivalent}. Token quantities are adjusted using the current corporate-action multiplier; a token does not permanently equal one share.</p>
          <p>Chainlink reference valuation: {quote.reference.priceUsdPerToken ? `$${quote.reference.priceUsdPerToken} per token` : 'unavailable'} · {quote.reference.status}.</p>
          {quote.reference.updatedAt && <p>Reference updated: {date(quote.reference.updatedAt * 1000)}</p>}
          <p>This is a token valuation, not an underlying-stock quote or current offer. Market session and oracle pause status are unverified. Older observations may reflect off-hours or a pause.</p>
          <p>{liveMode ? LIVE_ASSUMPTIONS : PAPER_ASSUMPTIONS}</p>
          <p>Base block {quote.blockNumber}<br />Token: <code>{quote.instrumentAddress}</code><br />Pool: <code>{quote.poolAddress}</code></p>
          <ProductTerms instrument={instrument} />
        </Drawer>
        <div className={styles.slipDecision}>
          {recorded ? <>
            <div className={styles.slipActions}>
              {!browsing && (
                <button type="button" className={styles.secondary} onClick={() => edit({ instrumentId: '', side: 'buy', amount: '', unit: 'USDC' })}>Start another instruction</button>
              )}
              <details className={styles.receiptTools}>
                <summary>Keep or share</summary>
                <div>
                  <button type="button" className={styles.secondary} onClick={share}>Share this paper trade</button>
                  {instrument && <button type="button" className={styles.secondary} onClick={() => watched.includes(instrument.id) ? unwatch(instrument.id) : watch(instrument.id)}>{watched.includes(instrument.id) ? 'Stop watching' : 'Watch'} {instrument.symbol}</button>}
                  {!browsing && <button type="button" className={styles.secondary} onClick={() => edit(quote.intent)}>Re-quote {instrument?.symbol ?? 'this mark'}</button>}
                  {shareNote && <p role="status" className={styles.shareFeedback}>{shareNote}</p>}
                </div>
              </details>
            </div>
          </> : <>
            {LIVE_EXECUTION_ENABLED && view === 'review' && !expired && (
              <div className={styles.liveBox}>
                <label className={styles.liveRowLabel}>
                  <input type="checkbox" checked={liveMode} onChange={() => setLiveMode(v => !v)} aria-label="Toggle live execution on Base" />
                  Live execution on Base
                </label>
                <p className={styles.liveMeta}>{liveMode ? 'Real tokens and USDC will move when you execute.' : 'Paper estimate only — no funds move.'}</p>
              </div>
            )}
            <p className={styles.slipConsent}>{liveMode ? 'Executing moves real funds on Base. Recording saves a simulation, visible to anyone using this browser profile.' : 'Recording saves a simulation, visible to anyone using this browser profile.'}</p>
            {liveMode && quote && <LiveExecution quote={quote} execution={execution} expired={expired} expiringSoon={expiringSoon} onApproved={() => void requestQuote()} />}
            {expired
              ? <button className={styles.primary} type="button" onClick={() => void requestQuote()}>Refresh estimate<span aria-hidden="true">↻</span></button>
              : expiringSoon
                ? <button className={styles.primary} type="button" disabled title="The estimate is expiring — refresh for fresh terms">Refresh needed — estimate expiring<span aria-hidden="true">↻</span></button>
                : <button className={styles.primary} type="button" disabled={!historyReady} onClick={save}>Record paper trade<span aria-hidden="true">→</span></button>}
            {expiringSoon && !expired && <p role="status" className={styles.slipNotice}>The estimate is expiring. Refresh for fresh terms — recording is held.</p>}
            <div className={styles.slipActions}>
              {expired
                ? <button className={styles.secondary} type="button" onClick={() => { edit(state.draft); document.getElementById('amount')?.focus({ preventScroll: true }); }}>Adjust amount</button>
                : <button className={styles.secondary} type="button" title="Editing clears this estimate" onClick={() => edit(state.draft)}>Edit instruction</button>}
              <button className={styles.secondary} type="button" onClick={cancel}>Cancel instruction</button>
            </div>
            {!expired && !expiringSoon && <p className={styles.slipNotice}>Editing clears this estimate.</p>}
          </>}
        </div>
      </>}
    </div>
  </section>;
});
