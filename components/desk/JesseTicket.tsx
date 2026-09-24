'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import { JESSE_LIVE_CLIENT_ENABLED } from '@/lib/solana/flags';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { mintFirstJessePaperSlip } from '@/lib/trading/desk-slips';
import { HouseMark } from '../desk/HouseMark';
import { EducationTopicTrigger } from './EducationTopic';
import { MarketEvidence } from '../solana/MarketEvidence';
import { PreStocksEvidence } from '../solana/PreStocksEvidence';
import { VenueDuplexEvidence } from '../solana/VenueDuplexEvidence';
import { JesseLiveSettle } from './JesseLiveSettle';
import { WrittenSlip } from './WrittenSlip';
import { GapStrip } from './GapStrip';
import { SignalCaption } from './SignalCaption';
import type { JesseDraft, JesseIntent, MarketComparison } from '@/lib/solana/contracts';
import type { SlipProvenance } from '@/lib/desk/slip-provenance';
import type { SupersededSlip } from '@/lib/desk/superseded';
import { draftComplete, JESSE_VOCAB, slipOneLine, slipValidity } from '@/lib/desk/written-slip';
import { comparisonTake } from '@/lib/desk/broker-take';
import { focusLedgerTitle, paperOutcomeCopy } from '@/lib/trading/outcomes';
import { getEducationTopic } from '@/lib/education';
import { EVIDENCE_DISCLAIMER, BLANK_SLIP_TITLE, SLIP_ACTIONS } from '@/lib/desk/ui-copy';
import type { DeskMark } from '@/lib/trading/marks-shared';
import styles from '../desk/WorkingDesk.module.css';
import evidence from "./EvidencePanel.module.css";

export { GapStrip } from './GapStrip';

const SLIP_INSTRUMENTS = SOLANA_INSTRUMENTS.filter(s => s.quoteSupported);

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
  mark = null,
  blankSlip = false,
  quietEvidence = false,
  roomView = false,
  provenance,
  superseded,
  onSlipEdit,
  handEdit,
}: {
  jesse: JesseDesk;
  spokenLine?: string | null;
  carriedNote?: string | null;
  /** The venue mark for the drafted instrument — its stock-reference gap heads the slip. */
  mark?: DeskMark | null;
  /** Room first paint: blank blotter until the line (or hand) puts work on it. */
  blankSlip?: boolean;
  /** Room: keep market evidence behind one disclosure until asked. */
  quietEvidence?: boolean;
  /** Room: the written sentence leads; Compact keeps the DraftForm. */
  roomView?: boolean;
  /** Where each value on the slip came from — marks only render while the
      slip still holds the recorded value. */
  provenance?: SlipProvenance;
  /** Earlier prices struck through on this same slip. */
  superseded?: SupersededSlip[];
  /** Inline sentence edits — the surface decides edit-versus-reprice. */
  onSlipEdit?: (partial: Partial<JesseDraft>, field: 'instrument' | 'side' | 'amount' | 'units') => void;
  /** Plain hand edits (Compact DraftForm) — edit plus hand provenance. */
  handEdit?: JesseDesk['edit'];
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
          : BLANK_SLIP_TITLE.jesse;

  const onFile = async () => {
    setLocalError(null);
    const result = await jesse.file();
    if (result.status !== 'applied') {
      setLocalError(result.spokenText || 'Not filed.');
      return;
    }
    /* The paper record exists now — land the stamp's thud with its slam. */
    void import('@/lib/sounds').then(({ playStampThud }) => playStampThud()).catch(() => {});
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
    const receiptInstrument = record?.instrumentSnapshot
      ?? (q ? SOLANA_INSTRUMENTS.find(s => s.id === q.intent.instrumentId) : null)
      ?? state.presentedInstrument;
    const filed = paperOutcomeCopy({
      sentence: q ? slipOneLine(q, JESSE_VOCAB) : null,
      place: 'jesse-browser',
    });
    const gapTake = record?.comparison && record.comparison.status !== 'unavailable'
      ? comparisonTake(record.comparison.referenceDifferenceBps)
      : null;
    return (
      <section id="instruction" className={`${styles.ticket} ${styles.ticketRecorded}`} aria-labelledby="instruction-title" data-ticket-view="receipt" data-acknowledged={record ? 'true' : 'false'}>
        <PaperChrome liveMode={false} />
        {record && <span className={styles.stamp} aria-hidden="true"><span>FILED</span><small>PAPER · SOLANA</small></span>}
        <div className={styles.ticketSurface} key="receipt">
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{filed.heading}</h1>
        {foreground.kind === 'receipt' && <SignalCaption captionKey="stampThud" />}
        <WrittenSlip
          mode="receipt"
          draft={draft}
          vocab={JESSE_VOCAB}
          instruments={SLIP_INSTRUMENTS}
          quote={q}
          instrument={receiptInstrument}
          terms={q ? <>Multiplier {q.scaling.multiplier} · {receiptInstrument?.issuer ?? 'Backed'} · Token-2022 · Jupiter Metis · Solana</> : null}
          filedAt={record?.createdAt ?? null}
          actions={
            <>
              {foreground.kind === 'receipt' && (
                <button type="button" className={styles.secondary} onClick={focusLedgerTitle}>Read it in your record</button>
              )}
              <button type="button" className={styles.secondary} onClick={dismissRecord}>
                {foreground.kind === 'receipt' ? 'Start another instruction' : 'Back to your instruction'}
              </button>
            </>
          }
          receiptExtra={
            <>
              <p className={styles.quoteBoundary} role="status">{filed.acknowledgement}<span>{filed.place} {filed.boundary}</span></p>
              {gapTake && <p className={styles.receiptTake}>{gapTake}</p>}
              {record?.comparison ? (
                <>
                  <MarketEvidence comparison={record.comparison} />
                  <p className={evidence.evidenceCaveat}>{EVIDENCE_DISCLAIMER}</p>
                </>
              ) : null}
            </>
          }
        />
        </div>
      </section>
    );
  }

  if (foreground.kind === 'quotation' && state.quote) {
    const q = state.quote;
    const instrument = SOLANA_INSTRUMENTS.find(s => s.id === q.intent.instrumentId) ?? state.presentedInstrument;
    /* The last seconds are not for deciding — filing freezes so a click
       cannot race the lapse. */
    const validity = slipValidity(q.expiresAt, reviewNow);
    return (
      <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="review">
        <PaperChrome liveMode={liveMode && liveAvailable} />
        <div className={styles.ticketSurface} key="review">
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
        <SignalCaption captionKey="fuseDrain" />
        <WrittenSlip
          mode="review"
          draft={draft}
          vocab={JESSE_VOCAB}
          instruments={SLIP_INSTRUMENTS}
          quote={q}
          instrument={instrument}
          spokenLine={spokenLine}
          provenance={provenance}
          superseded={superseded}
          now={reviewNow}
          freshness={Math.max(0, Math.min(1, (q.expiresAt - reviewNow) / 30000))}
          pending={inFlight === 'quote'}
          pendingLabel="Jesse is pricing it at Jupiter…"
          notice={localError ?? (lastResult && lastResult.status === 'rejected' ? lastResult.spokenText : null)}
          headline={<GapStrip mark={mark} />}
          terms={<>Multiplier {q.scaling.multiplier} · {instrument?.issuer ?? 'Backed'} · Token-2022 · Jupiter Metis · Solana · {liveMode && liveAvailable ? 'live settle available' : 'paper estimate'}</>}
          actions={<>
            <button
              type="button"
              className={`${styles.primary} ${styles.stampAction}`}
              disabled={validity.state !== 'open'}
              onClick={() => { void onFile(); }}
            >
              {SLIP_ACTIONS.file}
            </button>
            <button type="button" className={styles.secondary} onClick={() => { void quote(); }}>{SLIP_ACTIONS.fresh}</button>
            <button type="button" className={styles.secondary} onClick={() => { void cancel(); }}>{SLIP_ACTIONS.setAside}</button>
            <button type="button" className={styles.secondary} onClick={() => { void compare(); }}>{SLIP_ACTIONS.compare}</button>
          </>}
          trailing={
            <EvidenceModule
              comparison={state.comparison}
              loading={inFlight === 'compare'}
              instrumentId={q.intent.instrumentId}
              onCompare={() => { void compare(); }}
              compareDisabled={inFlight === 'compare'}
              quiet={quietEvidence}
            />
          }
          onEdit={onSlipEdit}
        >
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
        </WrittenSlip>
        </div>
      </section>
    );
  }

  /* Draft / pending */
  const liveIntent = intentFromDraft(draft);
  const selectedStock = draft.instrumentId ? SOLANA_INSTRUMENTS.find(s => s.id === draft.instrumentId) : null;

  /* Room first paint: the slip is a sentence with blanks, not a form. */
  if (blankSlip) {
    return (
      <section
        id="instruction"
        className={`${styles.ticket} ${styles.blankSlip}`}
        aria-labelledby="instruction-title"
        data-ticket-view="blank"
      >
        <PaperChrome liveMode={false} />
        <div className={styles.ticketSurface} key="blank">
          <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{BLANK_SLIP_TITLE.jesse}</h1>
          <WrittenSlip
            mode="blank"
            draft={draft}
            vocab={JESSE_VOCAB}
            instruments={SLIP_INSTRUMENTS}
            instrument={selectedStock}
            spokenLine={spokenLine}
            provenance={provenance}
            superseded={superseded}
            pending={inFlight === 'quote' || foreground.kind === 'pending'}
            pendingLabel="Jesse is pricing it at Jupiter…"
            notice={localError ?? (lastResult?.status === 'clarify' || lastResult?.status === 'rejected' ? lastResult.spokenText : null)}
            actions={draftComplete(draft) && inFlight !== 'quote' && foreground.kind !== 'pending' ? (
              <button type="button" className={styles.primary} onClick={() => { void quote(); }}>{SLIP_ACTIONS.price}</button>
            ) : null}
            onEdit={onSlipEdit}
          />
        </div>
      </section>
    );
  }

  /* Room draft: the written sentence leads; Compact keeps the DraftForm. */
  if (roomView) {
    return (
      <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="draft">
        <PaperChrome liveMode={liveMode && liveAvailable} />
        <div className={styles.ticketSurface} key="draft">
        {carriedNote && <p className={styles.carriedNote}>{carriedNote}</p>}
        <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
        <WrittenSlip
          mode="draft"
          draft={draft}
          vocab={JESSE_VOCAB}
          instruments={SLIP_INSTRUMENTS}
          instrument={selectedStock}
          spokenLine={spokenLine}
          provenance={provenance}
          superseded={superseded}
          pending={inFlight === 'quote' || foreground.kind === 'pending'}
          pendingLabel="Jesse is pricing it at Jupiter…"
          notice={localError ?? (lastResult?.status === 'clarify' || lastResult?.status === 'rejected' ? lastResult.spokenText : null)}
          actions={draftComplete(draft) && inFlight !== 'quote' && foreground.kind !== 'pending' ? (
            <button type="button" className={styles.primary} onClick={() => { void quote(); }}>{SLIP_ACTIONS.price}</button>
          ) : null}
          onEdit={onSlipEdit}
        />
        </div>
      </section>
    );
  }

  return (
    <section id="instruction" className={styles.ticket} aria-labelledby="instruction-title" data-ticket-view="draft">
      <PaperChrome liveMode={liveMode && liveAvailable} />
      <div className={styles.ticketSurface} key="compact-draft">
      {carriedNote && <p className={styles.carriedNote}>{carriedNote}</p>}
      <h1 id="instruction-title" ref={reviewRef} tabIndex={-1}>{title}</h1>
      <p className={styles.dictationRail} data-active={inFlight === 'quote' ? 'true' : 'false'} role="status" aria-live="polite">
        {inFlight === 'quote'
          ? 'Getting a Jupiter paper estimate…'
          : spokenLine
            ? <>You said: <em>{spokenLine}</em></>
            : 'Speak or type an instruction, e.g. “buy 100 USDC of AAPLx”.'}
      </p>
      <DraftForm
        draft={draft}
        side={side}
        unit={unit}
        inFlight={inFlight}
        liveAvailable={liveAvailable}
        liveMode={liveMode}
        setLiveMode={setLiveMode}
        selectedStock={selectedStock}
        localError={localError}
        lastSpoken={lastResult?.status === 'clarify' || lastResult?.status === 'rejected' ? lastResult.spokenText : null}
        edit={handEdit ?? edit}
        quote={quote}
        compare={compare}
        liveIntent={liveIntent}
        revision={state.revision}
        comparison={state.comparison}
        quietEvidence={quietEvidence}
      />
      </div>
    </section>
  );
});

function DraftForm({
  draft,
  side,
  unit,
  inFlight,
  liveAvailable,
  liveMode,
  setLiveMode,
  selectedStock,
  localError,
  lastSpoken,
  edit,
  quote,
  compare,
  liveIntent,
  revision,
  comparison,
  quietEvidence = false,
}: {
  draft: JesseDesk['state']['draft'];
  side: 'buy' | 'sell';
  unit: 'USDC' | 'scaled-token';
  inFlight: JesseDesk['inFlight'];
  liveAvailable: boolean;
  liveMode: boolean;
  setLiveMode: (next: boolean) => void;
  selectedStock: (typeof SOLANA_INSTRUMENTS)[number] | null | undefined;
  localError: string | null;
  lastSpoken: string | null;
  edit: JesseDesk['edit'];
  quote: JesseDesk['quote'];
  compare: JesseDesk['compare'];
  liveIntent: JesseIntent | null;
  revision: number;
  comparison: MarketComparison | null;
  quietEvidence?: boolean;
}) {
  return (
    <>
      {(localError || lastSpoken) && (
        <p className={styles.notice} role="alert">{localError ?? lastSpoken}</p>
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

        {liveAvailable && !quietEvidence && (
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

      {liveMode && liveAvailable && !quietEvidence && (
        <JesseLiveSettle intent={liveIntent} revision={revision} />
      )}

      <EvidenceModule
        comparison={comparison}
        loading={inFlight === 'compare'}
        instrumentId={draft.instrumentId}
        onCompare={() => { void compare(); }}
        compareDisabled={!draft.instrumentId || inFlight === 'compare'}
        quiet={quietEvidence}
      />
    </>
  );
}

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
  quiet = false,
}: {
  comparison: MarketComparison | null;
  loading: boolean;
  instrumentId: string | null;
  onCompare: () => void;
  compareDisabled: boolean;
  quiet?: boolean;
}) {
  const body = (
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
  if (!quiet) return body;
  return (
    <details className={styles.evidenceDrawer}>
      <summary>The two markets</summary>
      {body}
    </details>
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
