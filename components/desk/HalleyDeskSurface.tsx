'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { EvidencePanel, EvidenceRow } from './EvidencePanel';
import { ModeStamp } from './ModeStamp';
import { HalleyPlate } from './HalleyPlate';
import {
  CURVE_HINTS,
  HALLEY_EXAMPLE,
  isBlankDraft,
  missingLaunchFields,
  stageLabel,
} from '@/lib/meteora/plate';
import plate from './HalleyPlate.module.css';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { HALLEY_QUOTE_MINTS } from '@/lib/meteora/catalog';
import { LAUNCH_CURVE_PRESETS } from '@/lib/meteora/contracts';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import type { HalleyPaperRecord } from '@/lib/meteora/paper';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import styles from './WorkingDesk.module.css';

const HalleyCall = dynamic(() => import('./HalleyCall').then(m => m.HalleyCall), { ssr: false });

type Desk = ReturnType<typeof useTradingDesk>;

function money(value: string | null | undefined): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n >= 100 ? n.toFixed(2) : n.toPrecision(4);
}

function recordLine(record: HalleyPaperRecord): string {
  const i = record.estimate.intent;
  return `Launch ${i.symbol} · ${i.quoteSymbol} quote · ${i.curve}`;
}

/** The projected curve as inline SVG — sparkline of the estimate's path. */
function LaunchCurve({ path }: { path: readonly { progress: string; priceQuote: string }[] }) {
  const points = useMemo(() => {
    const ys = path.map(p => Number(p.priceQuote)).filter(Number.isFinite);
    if (ys.length < 2) return null;
    const min = Math.min(...ys), max = Math.max(...ys);
    const span = max - min || 1;
    return path.map((p, i) => {
      const x = (Number(p.progress) * 100).toFixed(1);
      const y = (28 - ((Number(p.priceQuote) - min) / span) * 24).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
  }, [path]);
  if (!points) return null;
  return (
    <svg viewBox="0 0 100 30" className={styles.launchCurve} role="img" aria-label="Projected curve path">
      <path d={points} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function HalleyRecordView({ record, onClose, onRemove }: {
  record: HalleyPaperRecord;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const e = record.estimate;
  return (
    <section className={styles.ticket} aria-labelledby="halley-record-title" data-ticket-view="record">
      <div className={styles.paperTop}>
        <span>FILED PAPER · HALLEY</span>
        <span className={styles.paperNumber}>{record.id.slice(0, 8)}</span>
      </div>
      <h1 id="halley-record-title">{recordLine(record)}</h1>
      <div className={styles.ticketSurface}>
        <p>Filed {new Date(record.createdAt).toLocaleString()} — a paper launch intent. No mint was created and nothing settled.</p>
        <LaunchCurve path={e.path} />
        <EvidencePanel
          titleId="halley-record-curve"
          eyebrow="CURVE"
          title="As filed"
          status="ready"
          body={(
            <>
              <EvidenceRow label="Opens" value={`${money(e.openingPriceQuote)} ${e.intent.quoteSymbol}`} source={e.anchor ? `Pyth ${e.anchor.symbol} anchor` : 'unanchored'} />
              <EvidenceRow label="Graduates" value={`${money(e.graduationPriceQuote)} ${e.intent.quoteSymbol}`} source={`${e.intent.graduationQuote} ${e.intent.quoteSymbol} collected → DAMM v2`} />
            </>
          )}
          about={<p>{e.assumptions}</p>}
        />
        <div className={styles.slipActions}>
          <button type="button" className={styles.primary} onClick={onClose}>Back to the desk</button>
          <button type="button" className={styles.secondary} onClick={() => onRemove(record.id)}>Remove this record</button>
        </div>
      </div>
    </section>
  );
}

/**
 * Halley's desk — Meteora DBC launches on Solana. Name a tracker token, pick
 * the anchor equity and the quote asset, see the projected curve, file a
 * paper launch. No live launch path is implemented.
 * Voice may draft and estimate; it never signs.
 */
export function HalleyDeskSurface({ desk }: { desk: Desk }) {
  const halley = desk.halley;
  const reviewNow = useReviewClock(halley.state.stage === 'review');

  const viewed = halley.viewedRecordId
    ? halley.records.find(record => record.id === halley.viewedRecordId) ?? null
    : null;

  const estimate = halley.state.stage === 'review' || halley.state.stage === 'saved' ? halley.state.estimate : null;
  const expired = halley.state.stage === 'review' && estimate !== null && reviewNow >= estimate.expiresAt;
  const secondsLeft = estimate ? Math.max(0, Math.ceil((estimate.expiresAt - reviewNow) / 1000)) : 0;

  const draft = halley.state.draft;
  const missing = missingLaunchFields(draft);
  const complete = missing.length === 0;
  const blank = halley.state.stage === 'draft' && isBlankDraft(draft);
  const curveHint = CURVE_HINTS[draft.curve ?? 'equity-pair'];

  return (
    <DeskRoom
      deskId="halley"
      activeDesk={desk.activeDesk}
      open={desk.open}
      onSwitchDesk={desk.switchDesk}
      onLeaveDesk={desk.leaveDesk}
    >
      <ModeStamp
        live={false}
        hint="Anchored launch curves on Meteora DBC — estimates are projections, never orders."
        market="SOLANA · HALLEY"
      />
      <div className={styles.grid}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        <aside className={styles.support} aria-label="The launch desk’s direct line">
          <HalleyCall halley={halley} />
          <HalleyPlate stage={viewed ? 'saved' : halley.state.stage} draft={draft} />
        </aside>
        {viewed ? (
          <HalleyRecordView record={viewed} onClose={halley.dismissRecord} onRemove={halley.removeRecord} />
        ) : (
        <section id="instruction" className={styles.ticket} aria-labelledby="halley-ticket-title" data-ticket-view="open" data-desk-open="true">
          <div className={styles.paperTop}>
            <span>METEORA LAUNCHES<small>DBC → DAMM V2</small></span>
            <span className={styles.paperNumber}>{stageLabel(halley.state.stage)}</span>
          </div>
          <h1 id="halley-ticket-title">The launch desk.</h1>
          <p className={styles.product}>
            Project a tracker-token launch curve on Meteora using an equity mark
            or an unanchored starting price. Paper only: no token is minted.
            A tracker is not stock ownership.
          </p>
          <details className={styles.productDetails}>
            <summary>What a launch is, and what it is not</summary>
            <p>
              A launch creates a new tracker token on a Meteora DBC curve anchored
              to an equity’s Pyth mark, quoted in USDC or an xStock. When the
              graduation line is reached the pool migrates to DAMM v2. The token
              is an exposure instrument — Backed issues the underlying xStocks;
              the house is venue, never issuer.
            </p>
          </details>

          <div className={styles.ticketSurface}>
            {halley.state.stage === 'review' && estimate ? (
              <div aria-live="polite">
                <h2>
                  {estimate.intent.symbol} opens at {money(estimate.openingPriceQuote)} {estimate.intent.quoteSymbol}
                </h2>
                <LaunchCurve path={estimate.path} />
                <EvidencePanel
                  titleId="halley-curve"
                  eyebrow="LAUNCH CURVE"
                  title="Projected path"
                  status="ready"
                  body={(
                    <>
                      <EvidenceRow
                        label="Anchor"
                        value={estimate.anchor ? `${estimate.anchor.symbol} at $${money(estimate.anchor.equityUsd)}` : 'Unanchored — opens at 1.0'}
                        source={estimate.anchor ? `Pyth Pro · ${estimate.anchor.status}` : 'no equity mark'}
                      />
                      {estimate.anchor?.pairRatio && estimate.anchor.quoteEquityUsd && (
                        <EvidenceRow label="Pair ratio" value={`${money(estimate.anchor.pairRatio)} ${estimate.intent.quoteSymbol}`} source={`$${money(estimate.anchor.equityUsd)} / $${money(estimate.anchor.quoteEquityUsd)}`} />
                      )}
                      <EvidenceRow label="Opens" value={`${money(estimate.openingPriceQuote)} ${estimate.intent.quoteSymbol}`} source="curve start" />
                      <EvidenceRow label="Graduates" value={`${money(estimate.graduationPriceQuote)} ${estimate.intent.quoteSymbol}`} source={`${estimate.intent.graduationQuote} ${estimate.intent.quoteSymbol} collected`} />
                      <EvidenceRow label="Migration" value="DAMM v2 · 10% locked" source={`fees ${estimate.tradingFeeBps}bps trade / ${estimate.migrationFeeBps}bps migrate`} />
                    </>
                  )}
                  about={<p>{estimate.assumptions}</p>}
                />
                <div className={styles.slipActions}>
                  {!expired ? (
                    <button type="button" className={styles.primary} onClick={() => { halley.file(); }}>
                      File a paper launch<span aria-hidden="true"> · {secondsLeft}s</span>
                    </button>
                  ) : (
                    <p className={styles.notice} role="status">This estimate has lapsed — request a fresh one.</p>
                  )}
                  <button type="button" className={styles.secondary} onClick={halley.cancel}>Discard</button>
                </div>
              </div>
            ) : halley.state.stage === 'saved' && estimate ? (
              <div aria-live="polite">
                <h2>Filed.</h2>
                <p className={styles.notice}>A paper launch intent — no mint was created, nothing settled.</p>
                <LaunchCurve path={estimate.path} />
                <div className={styles.slipActions}>
                  <button type="button" className={styles.primary} onClick={halley.cancel}>New instruction</button>
                </div>
              </div>
            ) : (
              <>
                {blank && (
                  <div className={plate.lead} id="halley-lead">
                    <p className={plate.leadText}>Name a tracker. Anchor it to an equity. See the curve.</p>
                    <div>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => {
                          halley.edit({ ...HALLEY_EXAMPLE });
                          document.getElementById('halley-name')?.focus({ preventScroll: true });
                        }}
                      >
                        Fill an example (NVDA tracker)
                      </button>
                    </div>
                  </div>
                )}
                <div className={styles.fields}>
                  <label htmlFor="halley-name">Tracker name</label>
                  <div className={plate.control}>
                    <input
                      id="halley-name"
                      autoComplete="off"
                      value={draft.name ?? ''}
                      placeholder="NVDA tracker"
                      aria-describedby="halley-name-hint"
                      onChange={event => halley.edit({ name: event.target.value || null })}
                    />
                    <p id="halley-name-hint" className={plate.hint}>The token’s display name, 2–40 characters.</p>
                  </div>

                  <label htmlFor="halley-symbol">Symbol</label>
                  <div className={plate.control}>
                    <input
                      id="halley-symbol"
                      autoComplete="off"
                      value={draft.symbol ?? ''}
                      placeholder="NVDAT"
                      aria-describedby="halley-symbol-hint"
                      onChange={event => halley.edit({ symbol: event.target.value.toUpperCase() || null })}
                    />
                    <p id="halley-symbol-hint" className={plate.hint}>The ticker, 2–10 letters or digits.</p>
                  </div>

                  <span id="halley-anchor-label">Anchor equity</span>
                  <div className={plate.control}>
                  <div role="group" aria-labelledby="halley-anchor-label" aria-describedby="halley-anchor-hint" className={styles.amountChips}>
                    {SOLANA_INSTRUMENTS.map(i => i.underlyingSymbol).map(sym => (
                      <button key={sym} type="button"
                        aria-pressed={draft.anchorSymbol === sym}
                        className={styles.amountChip} data-active={draft.anchorSymbol === sym}
                        onClick={() => halley.edit({ anchorSymbol: sym })}>{sym}</button>
                    ))}
                    <button type="button"
                      aria-pressed={draft.anchorSymbol === null}
                      className={styles.amountChip} data-active={draft.anchorSymbol === null}
                      onClick={() => halley.edit({ anchorSymbol: null })}>None</button>
                  </div>

                    <p id="halley-anchor-hint" className={plate.hint}>An observed equity mark sets the opening price. None, or an unavailable mark, uses 1 quote unit instead; the estimate discloses it.</p>
                  </div>

                  <span id="halley-quote-label">Quote in</span>
                  <div role="group" aria-labelledby="halley-quote-label" className={styles.amountChips}>
                    {HALLEY_QUOTE_MINTS.map(q => (
                      <button key={q.symbol} type="button"
                        aria-pressed={draft.quoteSymbol === q.symbol}
                        className={styles.amountChip} data-active={draft.quoteSymbol === q.symbol}
                        onClick={() => halley.edit({ quoteSymbol: q.symbol })}>{q.symbol}</button>
                    ))}
                  </div>

                  <span id="halley-curve-label">Curve</span>
                  <div className={plate.control}>
                  <div role="group" aria-labelledby="halley-curve-label" aria-describedby="halley-curve-hint" className={styles.amountChips}>
                    {LAUNCH_CURVE_PRESETS.map(c => (
                      <button key={c} type="button"
                        aria-pressed={(draft.curve ?? 'equity-pair') === c}
                        className={styles.amountChip} data-active={(draft.curve ?? 'equity-pair') === c}
                        title={CURVE_HINTS[c]}
                        onClick={() => halley.edit({ curve: c })}>{c === 'equity-pair' ? 'equity pair' : c}</button>
                    ))}
                  </div>

                    <p id="halley-curve-hint" className={plate.hint}>{curveHint}</p>
                  </div>

                  <label htmlFor="halley-supply">Supply</label>
                  <div className={plate.control}>
                  <input
                    id="halley-supply"
                    aria-describedby="halley-supply-hint"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.supply ?? ''}
                    placeholder="1000000"
                    onChange={event => halley.edit({ supply: event.target.value || null })}
                  />

                    <p id="halley-supply-hint" className={plate.hint}>Total tracker tokens in the projection. Enter a positive whole number.</p>
                  </div>

                  <label htmlFor="halley-grad">Graduation line ({draft.quoteSymbol ?? 'quote'})</label>
                  <div className={plate.control}>
                  <input
                    id="halley-grad"
                    aria-describedby="halley-grad-hint"
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.graduationQuote ?? ''}
                    placeholder="150"
                    onChange={event => halley.edit({ graduationQuote: event.target.value || null })}
                  />
                    <p id="halley-grad-hint" className={plate.hint}>The quote-asset threshold used to project migration to DAMM v2. This does not launch a pool.</p>
                  </div>
                </div>
                {halley.state.notice && <p className={styles.notice} role="alert">{halley.state.notice}</p>}
                {halley.storageError && <p className={styles.notice} role="alert">{halley.storageError}</p>}
                <div className={styles.slipActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={halley.state.stage === 'estimating' || !complete}
                    aria-describedby={!complete ? 'halley-needed' : undefined}
                    onClick={halley.estimate}
                  >
                    {halley.state.stage === 'estimating' ? 'Drawing the curve…' : 'See the launch'}
                  </button>
                </div>
                {!complete && <p id="halley-needed" className={plate.needed}>Still needed: {missing.join(', ')}.</p>
              </>
            )}
          </div>

          {halley.records.length > 0 && (
            <details className={styles.aboutHetty}>
              <summary>Filed paper ({halley.records.length})</summary>
              <div className={styles.popoverPanel}>
                <ul className={styles.ledgerLines}>
                  {halley.records.map(record => (
                    <li key={record.id}>
                      <button type="button" onClick={() => halley.openRecord(record.id)}>
                        <strong>{recordLine(record)}</strong>
                        <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          <p className={styles.paperFoot}>LAUNCH SLIP · TRACKER TOKENS ARE NOT STOCK OWNERSHIP · PAPER BY DEFAULT</p>
        </section>
        )}
      </div>
    </DeskRoom>
  );
}
