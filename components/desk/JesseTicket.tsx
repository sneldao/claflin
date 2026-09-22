'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import { JESSE_LIVE_CLIENT_ENABLED } from '@/lib/solana/flags';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { mintFirstJessePaperSlip } from '@/lib/trading/desk-slips';
import { formatRecordedTime } from '@/lib/trading/desk-documents';
import { HouseMark } from '../desk/HouseMark';
import { EducationTopicTrigger } from './EducationTopic';
import { MarketEvidence } from '../solana/MarketEvidence';
import { PreStocksEvidence } from '../solana/PreStocksEvidence';
import { VenueDuplexEvidence } from '../solana/VenueDuplexEvidence';
import { JesseLiveSettle } from './JesseLiveSettle';
import type { JesseIntent, MarketComparison } from '@/lib/solana/contracts';
import { getEducationTopic } from '@/lib/education';
import { EVIDENCE_DISCLAIMER } from '@/lib/desk/ui-copy';
import styles from '../desk/WorkingDesk.module.css';
import evidence from "./EvidencePanel.module.css";

const AMOUNT_CHIPS = { buy: ['25', '100', '250'], sell: ['1', '5', '10'] } as const;

/** Reviewed catalog entry for the desk's "read the tape" education moment. */
const TAPE_TOPIC = getEducationTopic('the-tape');

function intentFromDraft(draft: {
  instrumentId: string | null;
  side: 'buy' | 'sell' | null;
  unit: 'USDC' | 'scaled-token' | null;
  amount: string | null;
}): JesseIntent | null {
  if (!draft.instrumentId || !draft.side || !draft.amount || !draft.unit) return null;
  if (draft.side === 'buy' && draft.unit === 'USDC') {
    return { instrumentId: draft.instrumentId as JesseIntent['instrumentId'], side: 'buy', unit: 'USDC', amount: draft.amount };
  }
  if (draft.side === 'sell' && draft.unit === 'scaled-token') {
    return { instrumentId: draft.instrumentId as JesseIntent['instrumentId'], side: 'sell', unit: 'scaled-token', amount: draft.amount };
  }
  return null;
}

export const JesseTicket = memo(function JesseTicket({
  jesse,
  spokenLine = null,
  carriedNote = null,
}: {
  jesse: JesseDesk;
  spokenLine?: string | null;
  carriedNote?: string | null;
}) {
  const { state, foreground, inFlight, lastResult, edit, quote, compare, cancel, dismissRecord } = jesse;
  const draft = state.draft;
  const reviewNow = useReviewClock(foreground.kind === 'quotation');
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(JESSE_LIVE_CLIENT_ENABLED);
  const [liveMode, setLiveMode] = useState(false);

  const side = draft.side ?? 'buy';
  const unit = side === 'buy' ? 'USDC' : 'scaled-token';
  const quoteFresh = state.quote && state.quote.expiresAt > reviewNow;
  const secondsLeft = state.quote ? Math.max(0, Math.ceil((state.quote.expiresAt - reviewNow) / 1000)) : 0;
  const freezeSoon = secondsLeft > 0 && secondsLeft <= 5;

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/desk/jesse/live/status')
      .then(async (res) => {
        const body = await res.json() as { enabled?: boolean };
        if (!cancelled && body.enabled === true) setLiveAvailable(true);
      })
      .catch(() => { /* keep build-time flag */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (foreground.kind === 'quotation') reviewRef.current?.focus({ preventScroll: true });
  }, [foreground.kind, state.quote?.id]);

  const title = foreground.kind === 'missing'
    ? 'That record is no longer here.'
    : foreground.kind === 'receipt'
      ? 'Filed to your Solana paper ledger.'
      : foreground.kind === 'pending' || inFlight === 'quote'
        ? 'Jesse is pricing it.'
        : foreground.kind === 'quotation'
          ? 'Read it twice. Then it’s yours.'
          : 'Say it. I’ll write it.';

  const onFile = async () => {
    setLocalError(null);
    const result = await jesse.file();
    if (result.status !== 'applied') {
      setLocalError(result.spokenText || 'Not filed.');
      return;
    }
    try {
      const { loadJessePaperRecords } = await import('@/lib/solana/paper');
      const saved = loadJessePaperRecords(window.localStorage).find(r => r.id === result.quoteId);
      if (saved) mintFirstJessePaperSlip(window.localStorage, saved);
    } catch { /* keepsake must not block filing */ }
  };

  if (foreground.kind === 'missing') {
    return (
      <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="missing">
        <PaperChrome liveMode={false} />
        <div className={styles.ticketSurface} key="missing">
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
        <p className={styles.notice} role="status">This paper record is no longer in this browser.</p>
        <div className={styles.slipActions}>
          <button type="button" className={styles.secondary} onClick={dismissRecord}>Back to your instruction</button>
        </div>
        </div>
      </section>
    );
  }

  if (foreground.kind === 'archive' || foreground.kind === 'receipt') {
    const record = jesse.records.find(r => r.id === (foreground.kind === 'receipt' ? foreground.recordId : foreground.recordId));
    const q = record?.quote ?? state.quote;
    return (
      <section id="instruction" className={`${styles.ticket} ${styles.ticketRecorded}`} aria-labelledby="instruction-title" data-ticket-view="receipt" data-acknowledged={record ? 'true' : 'false'}>
        <PaperChrome liveMode={false} />
        {record && <span className={styles.stamp} aria-hidden="true"><span>FILED</span><small>PAPER · SOLANA</small></span>}
        <div className={styles.ticketSurface} key="receipt">
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
        {q && (
          <div className={styles.slipBody}>
            <p className={styles.reviewHeading}>{q.intent.side.toUpperCase()} · {record?.instrumentSnapshot.symbol ?? q.outputSymbol}</p>
            <p>Spend {q.inputAmount} {q.inputSymbol} → about {q.outputAmount} {q.outputSymbol}</p>
            <p className={styles.product}>Multiplier {q.scaling.multiplier} · Jupiter Metis · Solana</p>
            {record && <p className={styles.paperFoot}>Filed {formatRecordedTime(record.createdAt)} · kept in this browser</p>}
          </div>
        )}
        <div className={styles.slipActions}>
          <button type="button" className={styles.secondary} onClick={dismissRecord}>
            {foreground.kind === 'receipt' ? 'Start another instruction' : 'Back to your instruction'}
          </button>
        </div>
        {record?.comparison && (
          <>
            <MarketEvidence comparison={record.comparison} />
            <p className={evidence.evidenceCaveat}>{EVIDENCE_DISCLAIMER}</p>
          </>
        )}
        </div>
      </section>
    );
  }

  if (foreground.kind === 'quotation' && state.quote) {
    const q = state.quote;
    const instrument = SOLANA_INSTRUMENTS.find(s => s.id === q.intent.instrumentId);
    return (
      <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="review">
        <PaperChrome liveMode={liveMode && liveAvailable} />
        <div className={styles.ticketSurface} key="review">
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
        <div className={styles.slipBody}>
          <p className={styles.reviewHeading}>{q.intent.side.toUpperCase()} · {instrument?.symbol ?? q.outputSymbol}</p>
          <p>Spend {q.inputAmount} {q.inputSymbol} → about {q.outputAmount} {q.outputSymbol}</p>
          <p className={styles.product}>
            Multiplier {q.scaling.multiplier} · Jupiter Metis · Solana
            {liveMode && liveAvailable ? ' · live settle available' : ' · paper estimate'}
          </p>
          {(instrument ?? state.presentedInstrument) && (
            <p className={styles.assumptions}>
              {(instrument ?? state.presentedInstrument)!.issuer} · {(instrument ?? state.presentedInstrument)!.decimals} decimals · scaled display units
            </p>
          )}
          <p role="status" className={styles.notice} data-urgent={freezeSoon ? 'true' : undefined}>
            {quoteFresh
              ? `${secondsLeft}s left to file — then request a fresh estimate.`
              : 'This estimate has expired. Request a fresh one.'}
          </p>
          <p className={styles.assumptions}>{q.assumptions}</p>
        </div>
        {(localError || (lastResult && lastResult.status === 'rejected')) && (
          <p className={styles.notice} role="alert">{localError ?? lastResult?.spokenText}</p>
        )}

        {liveAvailable && (
          <div className={styles.liveBox}>
            <label className={styles.liveRowLabel}>
              <input
                type="checkbox"
                checked={liveMode}
                onChange={() => setLiveMode(!liveMode)}
                aria-label="Toggle live execution on Solana"
              />
              {' '}Live execution on Solana
            </label>
            {liveMode && (
              <p className={styles.liveMeta}>
                Real USDC and xStock move when you sign. Paper filing stays available.
              </p>
            )}
          </div>
        )}

        {liveMode && liveAvailable && (
          <JesseLiveSettle intent={q.intent} revision={state.revision} />
        )}

        <div className={styles.slipActions}>
          <button type="button" className={styles.primary} disabled={!quoteFresh} onClick={() => { void onFile(); }}>
            File paper record
          </button>
          <button type="button" className={styles.secondary} onClick={() => { void quote(); }}>Refresh estimate</button>
          <button type="button" className={styles.secondary} onClick={() => { void cancel(); }}>Set aside</button>
          <button type="button" className={styles.secondary} onClick={() => { void compare(); }}>Compare market</button>
        </div>
        <EvidenceModule
          comparison={state.comparison}
          loading={inFlight === 'compare'}
          instrumentId={q.intent.instrumentId}
          onCompare={() => { void compare(); }}
          compareDisabled={inFlight === 'compare'}
        />
        </div>
      </section>
    );
  }

  /* Draft / pending */
  const liveIntent = intentFromDraft(draft);
  const selectedStock = draft.instrumentId ? SOLANA_INSTRUMENTS.find(s => s.id === draft.instrumentId) : null;
  return (
    <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="draft">
      <PaperChrome liveMode={liveMode && liveAvailable} />
      <div className={styles.ticketSurface} key="draft">
      {carriedNote && <p className={styles.carriedNote}>{carriedNote}</p>}
      <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
      <p className={styles.dictationRail} data-active={inFlight === 'quote' ? 'true' : 'false'} role="status" aria-live="polite">
        {inFlight === 'quote'
          ? 'Getting a Jupiter paper estimate…'
          : spokenLine
            ? <>You said: <em>{spokenLine}</em></>
            : 'Speak or type an instruction, e.g. “buy 100 USDC of AAPLx”.'}
      </p>
      {(localError || lastResult?.status === 'clarify' || lastResult?.status === 'rejected') && (
        <p className={styles.notice} role="alert">{localError ?? lastResult?.spokenText}</p>
      )}
      <form onSubmit={e => { e.preventDefault(); void quote(); }}>
        <fieldset id="stock" className={styles.plaques} tabIndex={-1}>
          <legend>xStock</legend>
          {SOLANA_INSTRUMENTS.filter(s => s.quoteSupported).map(stock => (
            <label key={stock.id} className={styles.plaque}>
              <input
                type="radio"
                name="jesse-instrument"
                value={stock.id}
                checked={draft.instrumentId === stock.id}
                onChange={() => edit({ instrumentId: stock.id }, 'instrument')}
              />
              <span className={styles.plaqueSymbol}>{stock.symbol}</span>
              <span className={styles.plaqueName}>{stock.name}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.product}>
          {selectedStock
            ? `${selectedStock.symbol} · ${selectedStock.issuer} · mint ${selectedStock.mint.slice(0, 8)}…`
            : 'Backed xStocks on Solana · Token-2022 · Jupiter Metis routes'}
        </p>
        <div className={styles.row}>
          <label>
            Side
            <select
              value={side}
              onChange={e => {
                const next = e.target.value as 'buy' | 'sell';
                edit({ side: next, unit: next === 'buy' ? 'USDC' : 'scaled-token', amount: null }, 'side');
              }}
            >
              <option value="buy">Buy (spend USDC)</option>
              <option value="sell">Sell (scaled units)</option>
            </select>
          </label>
          <label>
            {side === 'buy' ? 'USDC to spend' : 'Scaled units to sell'}
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              value={draft.amount ?? ''}
              onChange={e => edit({ amount: e.target.value || null, side, unit }, 'amount')}
              placeholder={side === 'buy' ? '100' : '1'}
            />
          </label>
        </div>
        <div className={styles.amountChips} role="group" aria-label="Amount suggestions">
          {AMOUNT_CHIPS[side].map(chip => (
            <button key={chip} type="button" onClick={() => edit({ amount: chip, side, unit }, 'amount')}>
              {chip}
            </button>
          ))}
        </div>

        {liveAvailable && (
          <div className={styles.liveBox}>
            <label className={styles.liveRowLabel}>
              <input
                type="checkbox"
                checked={liveMode}
                onChange={() => setLiveMode(!liveMode)}
                aria-label="Toggle live execution on Solana"
              />
              {' '}Live execution on Solana
            </label>
            {liveMode && (
              <p className={styles.liveMeta}>
                Real Jupiter settlement on Solana after signing. Paper stays available.
              </p>
            )}
          </div>
        )}

        <div className={styles.slipActions}>
          <button type="submit" className={styles.primary} disabled={inFlight === 'quote'}>
            {inFlight === 'quote' ? 'Pricing…' : 'Get estimate'}
          </button>
          <button type="button" className={styles.secondary} disabled={!draft.instrumentId || inFlight === 'compare'} onClick={() => { void compare(); }}>
            Compare market
          </button>
        </div>
      </form>

      {liveMode && liveAvailable && (
        <JesseLiveSettle intent={liveIntent} revision={state.revision} />
      )}

      <EvidenceModule
        comparison={state.comparison}
        loading={inFlight === 'compare'}
        instrumentId={draft.instrumentId}
        onCompare={() => { void compare(); }}
        compareDisabled={!draft.instrumentId || inFlight === 'compare'}
      />
      </div>
    </section>
  );
});

/**
 * The three evidence sources as one module: collapsible source cards, then a
 * single trust line (the caveat is stated once for the module, not once per
 * source) with the house's on-demand tape explanation beside it.
 */
function EvidenceModule({
  comparison,
  loading,
  instrumentId,
  onCompare,
  compareDisabled,
}: {
  comparison: MarketComparison | null;
  loading: boolean;
  instrumentId: string | null;
  onCompare: () => void;
  compareDisabled: boolean;
}) {
  return (
    <>
      <MarketEvidence
        comparison={comparison}
        loading={loading}
        onCompare={onCompare}
        compareDisabled={compareDisabled}
      />
      <VenueDuplexEvidence instrumentId={instrumentId} />
      <PreStocksEvidence />
      <p className={evidence.evidenceCaveat}>
        {EVIDENCE_DISCLAIMER}
        {TAPE_TOPIC && <EducationTopicTrigger topic={TAPE_TOPIC} label="About the tape" />}
      </p>
    </>
  );
}

function PaperChrome({ liveMode }: { liveMode: boolean }) {
  return (
    <div className={styles.paperTop}>
      <HouseMark small />
      <span>
        CLAFLIN &amp; CO.
        <small>
          {liveMode ? 'JESSE · SOLANA DESK / LIVE INSTRUCTION' : 'JESSE · SOLANA DESK / PAPER INSTRUCTION'}
        </small>
      </span>
      <span className={styles.paperNumber}>SOL</span>
    </div>
  );
}
