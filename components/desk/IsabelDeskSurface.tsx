'use client';

import { useEffect } from 'react';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { EvidenceDelta, EvidencePanel, EvidenceRow } from './EvidencePanel';
import { ModeStamp } from './ModeStamp';
import { TickerTape } from './TickerTape';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { offeringCoversDesk, offeringForId } from '@/lib/desk/offerings';
import { ROBINHOOD_INSTRUMENTS, getRobinhoodInstrument } from '@/lib/robinhood/catalog';
import type { RobinhoodEvidence } from '@/lib/robinhood/duplex';
import type { RobinhoodInstrument, RobinhoodInstrumentId } from '@/lib/robinhood/contracts';
import type { IsabelPaperRecord } from '@/lib/robinhood/paper';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import styles from './WorkingDesk.module.css';

type Desk = ReturnType<typeof useTradingDesk>;

function money(value: string | null | undefined): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n >= 100 ? n.toFixed(2) : n.toPrecision(4);
}

function mid(a: string | null, b: string | null): string | null {
  const x = a === null ? NaN : Number(a);
  const y = b === null ? NaN : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return String((x + y) / 2);
}

/** The three-way tape as presented at review or filed: issuer / onchain / venue. */
function TriplexEvidence({ evidence }: { evidence: RobinhoodEvidence }) {
  return (
    <EvidencePanel
      titleId="isabel-evidence"
      eyebrow="THREE-WAY TAPE"
      title="Issuer, onchain, venue"
      status={evidence.status === 'comparable' ? 'ready' : 'unavailable'}
      body={(
        <>
          <EvidenceRow
            label="Issuer"
            value={evidence.issuer
              ? `$${money(mid(evidence.issuer.tokenBid, evidence.issuer.tokenAsk))}`
              : 'No issuer reading'}
            source={`Robinhood rhj${evidence.issuer?.halted ? ' · trading halt' : ''}`}
          />
          <EvidenceRow
            label="Onchain"
            value={evidence.onchain ? `$${money(evidence.onchain.priceUsd)}` : 'No onchain reading'}
            source={`Chainlink on 4663${evidence.onchain?.status === 'stale' ? ' · stale' : ''}`}
          />
          <EvidenceRow
            label="Venue"
            value={evidence.venue ? `$${money(evidence.venue.midPriceUsd)}` : 'No venue reading'}
            source="Lighter book"
          />
          <EvidenceDelta bps={evidence.venueVsOnchainBps ?? evidence.onchainVsIssuerBps ?? evidence.venueVsIssuerBps} />
          {evidence.reasonCodes.length > 0 && (
            <p className={styles.notice}>{evidence.reasonCodes.join(' · ')}</p>
          )}
        </>
      )}
      about={<p>{evidence.disclaimer}</p>}
    />
  );
}

function recordLine(record: IsabelPaperRecord): string {
  const { quote, instrumentSnapshot } = record;
  const sym = instrumentSnapshot.symbol;
  return quote.intent.side === 'buy'
    ? `Bought ${money(quote.outputAmount)} ${sym} for ${money(quote.inputAmount)} USDG`
    : `Sold ${money(quote.inputAmount)} ${sym} for ${money(quote.outputAmount)} USDG`;
}

function IsabelRecordView({ record, onClose, onRemove }: {
  record: IsabelPaperRecord;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { quote } = record;
  return (
    <section className={styles.ticket} aria-labelledby="isabel-record-title" data-ticket-view="record">
      <div className={styles.paperTop}>
        <span>FILED PAPER · ISABEL</span>
        <span className={styles.paperNumber}>{record.id.slice(0, 8)}</span>
      </div>
      <h1 id="isabel-record-title">{recordLine(record)}</h1>
      <div className={styles.ticketSurface}>
        <p>Filed {new Date(record.createdAt).toLocaleString()} — a paper record, never a live order.</p>
        <p>Venue: Lighter book {quote.book.marketId} on Robinhood Chain · filled {quote.book.filledFully ? 'in full' : 'partly'} across {quote.book.levelsConsumed} {quote.book.levelsConsumed === 1 ? 'level' : 'levels'}.</p>
        {quote.shareEquivalent && <p>Share equivalent at filing: {quote.shareEquivalent} underlying {record.instrumentSnapshot.underlyingSymbol}.</p>}
        {record.evidence && <TriplexEvidence evidence={record.evidence} />}
        <p className={styles.notice}>{quote.assumptions}</p>
        <div className={styles.slipActions}>
          <button type="button" className={styles.primary} onClick={onClose}>Back to the desk</button>
          <button type="button" className={styles.secondary} onClick={() => { onRemove(record.id); }}>Remove this record</button>
        </div>
      </div>
    </section>
  );
}

/**
 * Isabel's desk — Robinhood Chain stock tokens, paper only. Pick a token,
 * size it in USDG (or tokens to sell), get a Lighter orderbook estimate,
 * review the three-way tape, file a paper record. No voice line, no live
 * path — by design (docs/ELIGIBILITY.md §5).
 */
export function IsabelDeskSurface({ desk }: { desk: Desk }) {
  const isabel = desk.isabel;
  const marks = useReferenceMarks('isabel');
  const reviewNow = useReviewClock(isabel.state.stage === 'review');

  const viewed = isabel.viewedRecordId
    ? isabel.records.find(record => record.id === isabel.viewedRecordId) ?? null
    : null;

  /* Entry context applies once per entry: an offering names the instrument;
     a carried instruction names side and amount. */
  const entryOffering = desk.entryOfferingId ? offeringForId(desk.entryOfferingId) : null;
  const entryInstrumentId = entryOffering
    && offeringCoversDesk(entryOffering, 'isabel')
    && ROBINHOOD_INSTRUMENTS.some(instrument => instrument.id === entryOffering.instrumentId)
    ? entryOffering.instrumentId as RobinhoodInstrumentId
    : null;
  const entryIntent = desk.entryIntent;
  const entryGen = desk.entryGen;
  const edit = isabel.edit;
  useEffect(() => {
    if (!entryInstrumentId && !entryIntent?.side && !entryIntent?.amount) return;
    edit({
      ...(entryInstrumentId ? { instrumentId: entryInstrumentId } : {}),
      ...(entryIntent?.side ? { side: entryIntent.side } : {}),
      ...(entryIntent?.amount ? { amount: entryIntent.amount } : {}),
    });
  }, [entryGen, entryInstrumentId, entryIntent, edit]);

  const instrument: RobinhoodInstrument | null = isabel.state.draft.instrumentId
    ? (() => { try { return getRobinhoodInstrument(isabel.state.draft.instrumentId); } catch { return null; } })()
    : null;

  const quote = isabel.state.stage === 'review' || isabel.state.stage === 'saved' ? isabel.state.quote : null;
  const expired = isabel.state.stage === 'review' && quote !== null && reviewNow >= quote.expiresAt;
  const secondsLeft = quote ? Math.max(0, Math.ceil((quote.expiresAt - reviewNow) / 1000)) : 0;

  const buy = isabel.state.draft.side !== 'sell';
  const complete = Boolean(isabel.state.draft.instrumentId && isabel.state.draft.side && isabel.state.draft.amount);

  return (
    <DeskRoom
      deskId="isabel"
      activeDesk={desk.activeDesk}
      open={desk.open}
      onSwitchDesk={desk.switchDesk}
      onLeaveDesk={desk.leaveDesk}
      tape={marks.result ? (marks.result.marks.some(m => m.reference.status === 'observed') ? 'fresh' : 'stale') : undefined}
      tapeAt={marks.result?.asOf ?? null}
    >
      <ModeStamp
        live={false}
        hint="Lighter estimates · no funds move · kept in this browser. Stock tokens carry issuer eligibility terms."
        market="ROBINHOOD CHAIN · ISABEL"
      />
      <div className={styles.grid}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        {viewed ? (
          <IsabelRecordView record={viewed} onClose={isabel.dismissRecord} onRemove={isabel.removeRecord} />
        ) : (
        <section id="instruction" className={styles.ticket} aria-labelledby="isabel-ticket-title" data-ticket-view="open" data-desk-open="true">
          <div className={styles.paperTop}>
            <span>ROBINHOOD STOCK TOKENS<small>CHAIN 4663</small></span>
            <span className={styles.paperNumber}>—</span>
          </div>
          <h1 id="isabel-ticket-title">The Robinhood Chain desk.</h1>
          <p className={styles.product}>
            Stock tokens issued by Robinhood Assets (Jersey) Limited — ERC-20 debt securities with
            issuer eligibility terms (not for US persons). This desk reads the tape and files paper
            records only. An estimate is never an order, and nothing here determines eligibility.
          </p>

          <TickerTape
            marks={marks.result?.marks ?? []}
            failed={marks.failed}
            stale={marks.stale}
            asOf={marks.result?.asOf}
            disabled={isabel.state.stage === 'quoting'}
            onSelect={id => isabel.edit({ instrumentId: id as RobinhoodInstrumentId })}
          />

          <div className={styles.ticketSurface}>
            {isabel.state.stage === 'review' && quote ? (
              <div aria-live="polite">
                <h2>
                  {quote.intent.side === 'buy'
                    ? `${money(quote.inputAmount)} USDG → ${money(quote.outputAmount)} ${instrument?.symbol ?? ''}`
                    : `${money(quote.inputAmount)} ${instrument?.symbol ?? ''} → ${money(quote.outputAmount)} USDG`}
                </h2>
                <EvidencePanel
                  titleId="isabel-book"
                  eyebrow="VENUE"
                  title="Lighter order book"
                  status="ready"
                  body={(
                    <>
                      <EvidenceRow label="Best" value={`${money(quote.book.bestBid)} / ${money(quote.book.bestAsk)} USDG`} source={`mid ${money(quote.book.midPrice)}${quote.book.spreadBps ? ` · ${quote.book.spreadBps} bps` : ''}`} />
                      <EvidenceRow label="Fill" value={quote.book.filledFully ? 'Covered by visible depth' : 'Partly — the book could not cover the whole size'} source={`${quote.book.levelsConsumed} ${quote.book.levelsConsumed === 1 ? 'level' : 'levels'} consumed`} />
                      {quote.shareEquivalent && <EvidenceRow label="Share equivalent" value={`${quote.shareEquivalent} ${instrument?.underlyingSymbol ?? 'underlying'}`} source="onchain multiplier" />}
                    </>
                  )}
                  about={<p>{quote.assumptions}</p>}
                />
                {isabel.state.evidence && <TriplexEvidence evidence={isabel.state.evidence} />}
                <div className={styles.slipActions}>
                  {!expired ? (
                    <button type="button" className={styles.primary} onClick={() => { isabel.file(); }}>
                      File a paper record<span aria-hidden="true"> · {secondsLeft}s</span>
                    </button>
                  ) : (
                    <p className={styles.notice} role="status">This estimate has lapsed — request a fresh one.</p>
                  )}
                  <button type="button" className={styles.secondary} onClick={isabel.cancel}>Discard</button>
                </div>
              </div>
            ) : isabel.state.stage === 'saved' && isabel.state.quote ? (
              <div aria-live="polite">
                <h2>Filed.</h2>
                <p className={styles.notice}>A paper record of the estimate — nothing moved onchain.</p>
                {isabel.state.evidence && <TriplexEvidence evidence={isabel.state.evidence} />}
                <div className={styles.slipActions}>
                  <button type="button" className={styles.primary} onClick={isabel.cancel}>New instruction</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.fields}>
                  <label htmlFor="isabel-instrument">Instrument</label>
                  <select
                    id="isabel-instrument"
                    value={isabel.state.draft.instrumentId ?? ''}
                    onChange={event => isabel.edit({ instrumentId: (event.target.value || null) as RobinhoodInstrumentId | null })}
                  >
                    <option value="">Choose a stock token…</option>
                    {ROBINHOOD_INSTRUMENTS.map(i => (
                      <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>
                    ))}
                  </select>

                  <span id="isabel-side-label">Side</span>
                  <div role="group" aria-labelledby="isabel-side-label">
                    <button type="button" aria-pressed={isabel.state.draft.side === 'buy'} className={isabel.state.draft.side === 'buy' ? styles.primary : styles.secondary}
                      onClick={() => isabel.edit({ side: 'buy' })}>Buy</button>
                    <button type="button" aria-pressed={isabel.state.draft.side === 'sell'} className={isabel.state.draft.side === 'sell' ? styles.primary : styles.secondary}
                      onClick={() => isabel.edit({ side: 'sell' })}>Sell</button>
                  </div>

                  <label htmlFor="amount">{buy ? 'USDG to spend' : `${instrument?.symbol ?? 'Token'} quantity`}</label>
                  <input
                    id="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={isabel.state.draft.amount ?? ''}
                    placeholder={buy ? '25' : '0.5'}
                    onChange={event => isabel.edit({ amount: event.target.value || null })}
                  />
                </div>
                {isabel.state.notice && <p className={styles.notice} role="alert">{isabel.state.notice}</p>}
                {isabel.storageError && <p className={styles.notice} role="alert">{isabel.storageError}</p>}
                <div className={styles.slipActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={isabel.state.stage === 'quoting' || !complete}
                    onClick={isabel.quote}
                  >
                    {isabel.state.stage === 'quoting' ? 'Reading the book…' : 'Get an estimate'}
                  </button>
                </div>
              </>
            )}
          </div>

          {isabel.records.length > 0 && (
            <details className={styles.aboutHetty}>
              <summary>Filed paper ({isabel.records.length})</summary>
              <div className={styles.popoverPanel}>
                <ul className={styles.ledgerLines}>
                  {isabel.records.map(record => (
                    <li key={record.id}>
                      <button type="button" onClick={() => isabel.openRecord(record.id)}>
                        <strong>{recordLine(record)}</strong>
                        <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          <p className={styles.paperFoot}>PAPER ONLY · ESTIMATES ARE NOT OFFERS · NOTHING SETTLES</p>
        </section>
        )}
      </div>
    </DeskRoom>
  );
}
