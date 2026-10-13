'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { EvidenceDelta, EvidencePanel, EvidenceRow } from './EvidencePanel';
import { ModeStamp } from './ModeStamp';
import { TickerTape } from './TickerTape';
import { BlotterHearables } from './BlotterHearables';
import { LastFilingLine } from './LastFilingLine';
import { useLatestFiling } from '@/lib/trading/useLatestFiling';
import { RING_EXAMPLES } from '@/lib/desk/ui-copy';
import { countRetrieval } from '@/lib/funnel/client';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { offeringCoversDesk, offeringForId } from '@/lib/desk/offerings';
import { ROBINHOOD_INSTRUMENTS, getRobinhoodInstrument } from '@/lib/robinhood/catalog';
import type { RobinhoodEvidence } from '@/lib/robinhood/duplex';
import type { RobinhoodInstrument, RobinhoodInstrumentId } from '@/lib/robinhood/contracts';
import type { TenniePaperRecord } from '@/lib/robinhood/paper';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import styles from './WorkingDesk.module.css';

type Desk = ReturnType<typeof useTradingDesk>;

const TennieCall = dynamic(() => import('./TennieCall').then(m => m.TennieCall), { ssr: false });

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

/** Issuer-declared session board, as one short source suffix. */
function sessionNote(sessions: RobinhoodEvidence['issuerSessions']): string {
  if (!sessions) return '';
  const { market, extended, overnight } = sessions;
  if (market === 'tradable' && extended === 'tradable' && overnight === 'tradable') return ' · all sessions tradable';
  if (market === 'untradable' && extended === 'untradable' && overnight === 'untradable') return ' · issuer: untradable this session';
  return ` · market ${market} · extended ${extended} · overnight ${overnight}`;
}

/** The three-way tape as presented at review or filed: issuer / onchain / venue. */
function TriplexEvidence({ evidence }: { evidence: RobinhoodEvidence }) {
  return (
    <EvidencePanel
      titleId="tennie-evidence"
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
            source={`Robinhood rhj${evidence.issuer?.halted ? ' · trading halt' : ''}${sessionNote(evidence.issuerSessions)}`}
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

function recordLine(record: TenniePaperRecord): string {
  const { quote, instrumentSnapshot } = record;
  const sym = instrumentSnapshot.symbol;
  return quote.intent.side === 'buy'
    ? `Bought ${money(quote.outputAmount)} ${sym} for ${money(quote.inputAmount)} USDG`
    : `Sold ${money(quote.inputAmount)} ${sym} for ${money(quote.outputAmount)} USDG`;
}

function TennieRecordView({ record, onClose, onRemove }: {
  record: TenniePaperRecord;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { quote } = record;
  return (
    <section className={styles.ticket} aria-labelledby="tennie-record-title" data-ticket-view="record">
      <div className={styles.paperTop}>
        <span>FILED PAPER · TENNIE</span>
        <span className={styles.paperNumber}>{record.id.slice(0, 8)}</span>
      </div>
      <h1 id="tennie-record-title">{recordLine(record)}</h1>
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

const PICK_SUGGESTIONS = 6;

/**
 * Type a ticker or a company — the book narrows to a short list. One field
 * replaces a 24-row dropdown: the tape below stays for browsing.
 */
function TennieInstrumentField({ instrumentId, onPick }: {
  instrumentId: RobinhoodInstrumentId | null;
  onPick: (id: RobinhoodInstrumentId | null) => void;
}) {
  const selected = instrumentId
    ? (() => { try { return getRobinhoodInstrument(instrumentId); } catch { return null; } })()
    : null;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [openList, setOpenList] = useState(false);
  const listId = 'tennie-instrument-list';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROBINHOOD_INSTRUMENTS.slice(0, PICK_SUGGESTIONS);
    return ROBINHOOD_INSTRUMENTS
      .filter(i => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      .slice(0, PICK_SUGGESTIONS);
  }, [query]);

  const type = (text: string) => { setQuery(text); setActive(0); setOpenList(true); };

  const choose = (instrument: RobinhoodInstrument) => {
    onPick(instrument.id);
    setQuery('');
    setOpenList(false);
  };

  if (selected) {
    return (
      <>
        <span id="tennie-instrument-label">Instrument</span>
        <div className={styles.pickedInstrument} role="group" aria-labelledby="tennie-instrument-label">
          <span className={styles.pickedSymbol}>{selected.symbol}</span>
          <span className={styles.pickedName}>{selected.name.replace(/ • Robinhood Token$/, '')}</span>
          <button type="button" className={styles.secondary} onClick={() => onPick(null)}>
            Change
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <label htmlFor="tennie-instrument">Instrument</label>
      <div className={styles.instrumentPick}>
        <input
          id="tennie-instrument"
          role="combobox"
          aria-expanded={openList && matches.length > 0}
          aria-controls={listId}
          aria-activedescendant={openList && matches[active] ? `${listId}-${matches[active].symbol}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Ticker or company — e.g. NVDA"
          value={query}
          onChange={event => type(event.target.value)}
          onFocus={() => setOpenList(true)}
          onBlur={() => setOpenList(false)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpenList(true); setActive(i => Math.min(i + 1, matches.length - 1)); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
            else if (event.key === 'Enter' && openList && matches[active]) { event.preventDefault(); choose(matches[active]); }
            else if (event.key === 'Escape') { setQuery(''); setOpenList(false); }
          }}
        />
        {openList && matches.length > 0 && (
          <ul id={listId} role="listbox" className={styles.instrumentList} aria-label="Matching stock tokens">
            {matches.map((instrument, index) => (
              <li key={instrument.id} role="option" id={`${listId}-${instrument.symbol}`} aria-selected={index === active}>
                <button
                  type="button"
                  className={styles.instrumentOption}
                  data-active={index === active}
                  /* mousedown beats blur so the pick registers before the list closes. */
                  onMouseDown={event => { event.preventDefault(); choose(instrument); }}
                >
                  <strong>{instrument.symbol}</strong>
                  <span>{instrument.name.replace(/ • Robinhood Token$/, '')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Tennie's desk — Robinhood Chain stock tokens, paper only. Pick a token,
 * size it in USDG (or tokens to sell), get a Lighter orderbook estimate,
 * review the three-way tape, file a paper record. No voice line, no live
 * path — by design (docs/ELIGIBILITY.md §5).
 */
export function TennieDeskSurface({ desk }: { desk: Desk }) {
  const tennie = desk.tennie;
  const marks = useReferenceMarks('tennie');
  const reviewNow = useReviewClock(tennie.state.stage === 'review');

  const viewed = tennie.viewedRecordId
    ? tennie.records.find(record => record.id === tennie.viewedRecordId) ?? null
    : null;

  /* Entry context applies once per entry: an offering names the instrument;
     a carried instruction names side and amount. */
  const entryOffering = desk.entryOfferingId ? offeringForId(desk.entryOfferingId) : null;
  const entryInstrumentId = entryOffering
    && offeringCoversDesk(entryOffering, 'tennie')
    && ROBINHOOD_INSTRUMENTS.some(instrument => instrument.id === entryOffering.instrumentId)
    ? entryOffering.instrumentId as RobinhoodInstrumentId
    : null;
  const entryIntent = desk.entryIntent;
  const entryGen = desk.entryGen;
  const edit = tennie.edit;
  useEffect(() => {
    if (!entryInstrumentId && !entryIntent?.side && !entryIntent?.amount) return;
    edit({
      ...(entryInstrumentId ? { instrumentId: entryInstrumentId } : {}),
      ...(entryIntent?.side ? { side: entryIntent.side } : {}),
      ...(entryIntent?.amount ? { amount: entryIntent.amount } : {}),
    });
  }, [entryGen, entryInstrumentId, entryIntent, edit]);

  const instrument: RobinhoodInstrument | null = tennie.state.draft.instrumentId
    ? (() => { try { return getRobinhoodInstrument(tennie.state.draft.instrumentId); } catch { return null; } })()
    : null;

  const quote = tennie.state.stage === 'review' || tennie.state.stage === 'saved' ? tennie.state.quote : null;
  const expired = tennie.state.stage === 'review' && quote !== null && reviewNow >= quote.expiresAt;
  const secondsLeft = quote ? Math.max(0, Math.ceil((quote.expiresAt - reviewNow) / 1000)) : 0;

  const buy = tennie.state.draft.side !== 'sell';
  const complete = Boolean(tennie.state.draft.instrumentId && tennie.state.draft.side && tennie.state.draft.amount);
  const venueGap = Number(tennie.state.evidence?.venueVsOnchainBps ?? NaN);
  const showCrossDesk = Number.isFinite(venueGap) && Math.abs(venueGap) >= 50;
  const filing = useLatestFiling();
  const tennieBlank = tennie.state.stage === 'draft' && !tennie.state.draft.instrumentId && !tennie.state.draft.amount;
  const [hearNote, setHearNote] = useState<string | null>(null);
  const tennieSlipLine = `${instrument?.symbol ?? '—'} · ${tennie.state.draft.side ?? '—'} · ${tennie.state.draft.amount ?? '—'} USDG-side`;
  const applyTennieHearable = (line: string) => {
    const lower = line.toLowerCase();
    const byUnderlying = (sym: string) => ROBINHOOD_INSTRUMENTS.find(i => i.underlyingSymbol === sym) ?? null;
    if (lower.includes('apple')) {
      const found = byUnderlying('AAPL');
      if (found) tennie.edit({ instrumentId: found.id });
      setHearNote('Picked Apple — size it below and read the three-way tape.');
      document.getElementById('amount')?.focus({ preventScroll: true });
    } else if (lower.includes('tesla')) {
      const found = byUnderlying('TSLA');
      if (found) tennie.edit({ instrumentId: found.id, side: 'buy', amount: '100' });
      setHearNote('Drafted 100 USDG of Tesla — request the estimate when ready.');
      document.getElementById('instruction')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      setHearNote('The three-way tape is below — issuer, onchain, venue side by side.');
      document.getElementById('tennie-ticket-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <DeskRoom
      deskId="tennie"
      activeDesk={desk.activeDesk}
      open={desk.open}
      onSwitchDesk={desk.switchDesk}
      onLeaveDesk={desk.leaveDesk}
      tape={marks.result ? (marks.result.marks.some(m => m.reference.status === 'observed') ? 'fresh' : 'stale') : undefined}
      tapeAt={marks.result?.asOf ?? null}
      filedAt={tennie.foreground.kind === 'receipt'
        ? tennie.records.find(record => record.id === tennie.foreground.recordId)?.createdAt ?? null
        : null}
    >
      <ModeStamp
        live={false}
        hint="Lighter estimates · no funds move · kept in this browser. Stock tokens carry issuer eligibility terms."
        market="ROBINHOOD CHAIN · TENNIE"
      />
      <div className={styles.grid}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        <aside className={styles.support} aria-label="Tennie’s direct line">
          <TennieCall tennie={tennie} />
        </aside>
        {viewed ? (
          <TennieRecordView record={viewed} onClose={tennie.dismissRecord} onRemove={tennie.removeRecord} />
        ) : (
        <section id="instruction" className={styles.ticket} aria-labelledby="tennie-ticket-title" data-ticket-view="open" data-desk-open="true">
          <div className={styles.paperTop}>
            <span>ROBINHOOD STOCK TOKENS<small>CHAIN 4663</small></span>
            <span className={styles.paperNumber}>—</span>
          </div>
          <h1 id="tennie-ticket-title">Tennie’s desk.</h1>
          <p className={styles.product}>
            Stock tokens issued by Robinhood Assets (Jersey) Limited. Paper estimates and
            records only — an estimate is never an order.
          </p>
          <details className={styles.productDetails}>
            <summary>What these tokens are and who may hold them</summary>
            <p>
              ERC-20 debt securities carrying issuer eligibility terms — not for US persons.
              This desk reads the tape and files paper records; nothing here determines
              eligibility, and nothing moves onchain.
            </p>
          </details>

          <TickerTape
            marks={marks.result?.marks ?? []}
            failed={marks.failed}
            stale={marks.stale}
            asOf={marks.result?.asOf}
            disabled={tennie.state.stage === 'quoting'}
            onSelect={id => tennie.edit({ instrumentId: id as RobinhoodInstrumentId })}
          />

          <div className={styles.ticketSurface}>
            {tennieBlank && filing?.deskId === 'tennie' && (
              <LastFilingLine filing={filing} className={styles.returnFiling} onOpen={() => { countRetrieval('tennie', 'last_filing'); tennie.openRecord(filing.recordId); }} />
            )}
            {tennieBlank && (
              <BlotterHearables
                lines={RING_EXAMPLES.tennie}
                onSay={applyTennieHearable}
                note={hearNote ? <p className={styles.callNote} role="status">{hearNote}</p> : null}
              />
            )}
            {!tennieBlank && tennie.state.stage === 'draft' && (
              <p className={styles.slipLine} aria-live="polite" title="Your instruction in one line">
                {tennieSlipLine}
              </p>
            )}
            {tennie.state.stage === 'review' && quote ? (
              <div aria-live="polite">
                <h2>
                  {quote.intent.side === 'buy'
                    ? `${money(quote.inputAmount)} USDG → ${money(quote.outputAmount)} ${instrument?.symbol ?? ''}`
                    : `${money(quote.inputAmount)} ${instrument?.symbol ?? ''} → ${money(quote.outputAmount)} USDG`}
                </h2>
                <EvidencePanel
                  titleId="tennie-book"
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
                {tennie.state.evidence && <TriplexEvidence evidence={tennie.state.evidence} />}
                {showCrossDesk ? (
                  <p className={styles.crossDesk}>
                    <Link href="/?desk=jesse">Compare on Solana</Link>
                  </p>
                ) : null}
                <div className={styles.slipActions}>
                  {!expired ? (
                    <button type="button" className={styles.primary} onClick={() => { void import('@/lib/sounds').then(({ playStampThud }) => playStampThud()).catch(() => {}); tennie.file(); }}>
                      File a paper record<span aria-hidden="true"> · {secondsLeft}s</span>
                    </button>
                  ) : (
                    <button type="button" className={styles.primary} onClick={tennie.quote}>
                      Fresh estimate<span aria-hidden="true"> ↻</span>
                    </button>
                  )}
                  <button type="button" className={styles.secondary} onClick={tennie.revise}>Adjust the slip</button>
                  <button type="button" className={styles.secondary} onClick={tennie.cancel}>Discard</button>
                </div>
                {expired && <p className={styles.notice} role="status">This estimate has lapsed — the figures above are its last reading.</p>}
              </div>
            ) : tennie.state.stage === 'saved' && tennie.state.quote ? (
              <div aria-live="polite">
                <h2>Filed.</h2>
                <p className={styles.notice}>A paper record of the estimate — nothing moved onchain.</p>
                {tennie.state.evidence && <TriplexEvidence evidence={tennie.state.evidence} />}
                <div className={styles.slipActions}>
                  <button type="button" className={styles.primary} onClick={tennie.cancel}>New instruction</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.fields}>
                  <TennieInstrumentField
                    instrumentId={tennie.state.draft.instrumentId}
                    onPick={id => tennie.edit({ instrumentId: id })}
                  />

                  <span id="tennie-side-label">Side</span>
                  <div role="group" aria-labelledby="tennie-side-label">
                    <button type="button" aria-pressed={tennie.state.draft.side === 'buy'} className={tennie.state.draft.side === 'buy' ? styles.primary : styles.secondary}
                      onClick={() => tennie.edit({ side: 'buy' })}>Buy</button>
                    <button type="button" aria-pressed={tennie.state.draft.side === 'sell'} className={tennie.state.draft.side === 'sell' ? styles.primary : styles.secondary}
                      onClick={() => tennie.edit({ side: 'sell' })}>Sell</button>
                  </div>

                  <label htmlFor="amount">{buy ? 'USDG to spend' : `${instrument?.symbol ?? 'Token'} quantity`}</label>
                  <input
                    id="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={tennie.state.draft.amount ?? ''}
                    placeholder={buy ? '25' : '0.5'}
                    onChange={event => tennie.edit({ amount: event.target.value || null })}
                  />
                </div>
                {tennie.state.notice && <p className={styles.notice} role="alert">{tennie.state.notice}</p>}
                {tennie.storageError && <p className={styles.notice} role="alert">{tennie.storageError}</p>}
                <div className={`${styles.slipActions} ${styles.stickyCta}`}>

                  <button
                    type="button"
                    className={styles.primary}
                    disabled={tennie.state.stage === 'quoting' || !complete}
                    onClick={tennie.quote}
                  >
                    {tennie.state.stage === 'quoting' ? 'Reading the book…' : 'Get an estimate'}
                  </button>
                </div>
              </>
            )}
          </div>

          {tennie.records.length > 0 && (
            <details className={styles.aboutHetty}>
              <summary>Filed paper ({tennie.records.length})</summary>
              <div className={styles.popoverPanel}>
                <ul className={styles.ledgerLines}>
                  {tennie.records.map(record => (
                    <li key={record.id}>
                      <button type="button" onClick={() => tennie.openRecord(record.id)}>
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
