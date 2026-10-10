'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { EvidencePanel, EvidenceRow } from './EvidencePanel';
import { ModeStamp } from './ModeStamp';
import { HalleyPlate } from './HalleyPlate';
import { ReceiverShell } from './ReceiverShell';
import { useDeskPresentation } from '@/lib/desk/use-desk-presentation';
import { useLineHotkey } from '@/lib/desk/use-line-hotkey';
import type { DeskPresentation } from '@/lib/desk-presentation';
import { projectHalleyToRoom } from '@/lib/meteora/room-presentation';
import room from './HalleyRoom.module.css';
import {
  CURVE_HINTS,
  CURVE_WEIGHT_SHAPES,
  HALLEY_EXAMPLE,
  isBlankDraft,
  missingLaunchFields,
  stageLabel,
} from '@/lib/meteora/plate';
import plate from './HalleyPlate.module.css';
import { useReviewClock } from '@/lib/trading/useReviewClock';
import { HALLEY_QUOTE_MINTS } from '@/lib/meteora/catalog';
import { HALLEY_LIVE_CLIENT_ENABLED } from '@/lib/meteora/flags';
import { LAUNCH_CURVE_PRESETS, type LaunchCurvePreset } from '@/lib/meteora/contracts';
import { draftIntent } from '@/lib/meteora/useHalleyDesk';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import type { HalleyPaperRecord } from '@/lib/meteora/paper';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import styles from './WorkingDesk.module.css';

const RoomPresentation = dynamic(
  () => import('./RoomPresentation').then(module => module.RoomPresentation),
  { ssr: false },
);

const HalleyCall = dynamic(() => import('./HalleyCall').then(m => m.HalleyCall), { ssr: false });

const HalleyLiveLaunch = dynamic(
  () => import('./HalleyLiveLaunch').then(m => m.HalleyLiveLaunch),
  { ssr: false },
);

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

/** The projected curve as inline SVG — sparkline of the estimate's path.
    The path traces itself on arrival and a comet settles at graduation:
    the observatory's whole motif in one motion. */
function LaunchCurve({ path }: { path: readonly { progress: string; priceQuote: string }[] }) {
  const drawn = useMemo(() => {
    const ys = path.map(p => Number(p.priceQuote)).filter(Number.isFinite);
    if (ys.length < 2) return null;
    const min = Math.min(...ys), max = Math.max(...ys);
    const span = max - min || 1;
    const pts = path.map(p => ({
      x: Number((Number(p.progress) * 100).toFixed(1)),
      y: Number((28 - ((Number(p.priceQuote) - min) / span) * 24).toFixed(1)),
    }));
    return {
      d: pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '),
      end: pts[pts.length - 1],
    };
  }, [path]);
  if (!drawn) return null;
  return (
    /* key on the path so each fresh estimate re-runs the transit */
    <svg key={drawn.d} viewBox="0 0 100 30" className={styles.launchCurve} role="img" aria-label="Projected curve path">
      <path d={drawn.d} fill="none" stroke="currentColor" strokeWidth="1.2" pathLength={1} />
      <circle className={styles.launchCurveComet} cx={drawn.end.x} cy={drawn.end.y} r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The preset's liquidity profile in miniature — the shape the curve
    actually carries, shown before the estimate runs. */
function CurveGlyph({ preset }: { preset: LaunchCurvePreset }) {
  const shape = CURVE_WEIGHT_SHAPES[preset];
  const max = Math.max(...shape);
  return (
    <svg viewBox="0 0 32 12" className={plate.curveGlyph} aria-hidden="true" focusable="false">
      {shape.map((w, i) => {
        const h = 2 + (w / max) * 8;
        return <rect key={i} x={i * 2} y={12 - h} width="1.4" height={h} fill="currentColor" />;
      })}
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
 * paper launch. When live flags are on, a wallet-signed launch ceremony
 * mounts below the slip.
 * Voice may draft and estimate; it never signs.
 */
export function HalleyDeskSurface({ desk }: { desk: Desk }) {
  const halley = desk.halley;
  const reviewNow = useReviewClock(halley.state.stage === 'review');
  // Bootstrap still; the shared preference hook applies Room only after hydration.
  const [presentationMode, applyMode] = useState<DeskPresentation>('compact');
  const [lineLive, setLineLive] = useState(false);
  /* The build flag only seeds this — the API probe is the honest answer on
     deployments whose bundle never received NEXT_PUBLIC_* (Jesse's pattern). */
  const [liveEnabled, setLiveEnabled] = useState(HALLEY_LIVE_CLIENT_ENABLED);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/desk/halley/live/status')
      .then(async res => {
        const body = await res.json() as { enabled?: boolean };
        if (!cancelled && body.enabled === true) setLiveEnabled(true);
      })
      .catch(() => { /* keep build-time flag */ });
    return () => { cancelled = true; };
  }, []);
  const setMode = useDeskPresentation('halley', applyMode, halley.historyReady);
  const roomView = presentationMode === 'room';
  const [viewNotice, setViewNotice] = useState<string | null>(null);
  const changeView = (mode: DeskPresentation) => {
    if (mode === presentationMode) return;
    const panel = document.getElementById('halley-line');
    if (lineLive || panel?.getAttribute('data-call') === 'connecting') {
      setViewNotice('End or cancel the call before changing views. Your launch instruction stays here.');
      return;
    }
    setViewNotice(null);
    setLineLive(false);
    setMode(mode);
  };
  useLineHotkey();
  const projection = projectHalleyToRoom({
    stage: halley.state.stage,
    foreground: halley.foreground.kind,
    live: lineLive,
  });
  const reviewing = halley.foreground.kind === 'quotation';
  const receiverStage = reviewing || halley.foreground.readonly
    ? 'confirmation' as const
    : lineLive || halley.inFlight ? 'conversation' as const : 'arrival' as const;

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
  /* Live launch uses the reviewed estimate's intent when one exists — the
     terms the caller actually reviewed — else the current draft's. */
  const liveIntent = liveEnabled
    ? (estimate?.intent ?? draftIntent(draft))
    : null;

  const work = (
    <div className={room.work} data-halley-presentation={presentationMode}>
      {roomView && (
        <div className={room.sky} aria-hidden="true">
          <svg viewBox="0 0 1000 340" fill="none" preserveAspectRatio="xMidYMin slice" focusable="false">
            <path d="M-80 285 Q360 -160 1040 190" stroke="currentColor" strokeWidth=".7" strokeDasharray="2 9" />
            <path d="M640 132 L810 38 M640 132 L792 62 M640 132 L765 80" stroke="currentColor" strokeWidth="1" />
            <circle cx="640" cy="132" r="3" fill="currentColor" />
            <g fill="currentColor">
              <circle cx="90" cy="95" r="1" /><circle cx="300" cy="36" r="1.5" />
              <circle cx="490" cy="74" r="1" /><circle cx="860" cy="140" r="1.2" />
              <circle cx="940" cy="58" r="1" /><circle cx="420" cy="188" r="1" />
            </g>
          </svg>
        </div>
      )}
      <ModeStamp
        live={liveEnabled}
        presentation={presentationMode}
        hint="Anchored launch curves on Meteora DBC — estimates are projections, never orders."
        market="SOLANA · HALLEY"
      >
        {!roomView && (
          <div className={styles.presentationToggle} role="group" aria-label="Desk presentation">
            <button type="button" className={styles.presentationButton} aria-pressed={false} onClick={() => changeView('room')}>Room</button>
            <button type="button" className={styles.presentationButton} aria-pressed={true} onClick={() => changeView('compact')}>Compact</button>
          </div>
        )}
      </ModeStamp>
      {viewNotice && <p className={room.caption} role="status">{viewNotice}</p>}
      {roomView && <p className={room.caption}>The observatory · projected curves, not orders</p>}
      <div className={`${styles.grid} ${roomView ? room.roomGrid : ''}`} data-presentation={presentationMode} data-foreground={halley.foreground.kind}>
        {!roomView && <>
          <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
          <DeskObjects />
        </>}
        <aside className={styles.support} aria-label="The launch desk’s direct line">
          <HalleyCall halley={halley} onLiveChange={setLineLive} />
          <ReceiverShell
            stage={receiverStage}
            label={reviewing ? 'REVIEW PAPER CURVE' : liveEnabled ? 'LAUNCH DESK / WALLET SIGNS' : 'PAPER LAUNCH / NO MINT'}
            reviewing={reviewing}
            brokerName="Halley"
            lineTargetId="halley-line"
            live={lineLive}
            hideCue={roomView}
            eager={roomView}
          />
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
            or an unanchored starting price.
            {liveEnabled
              ? ' Paper by default; a live launch deploys from your own wallet — you are the token’s creator.'
              : ' Paper only: no token is minted.'}
            {' '}A tracker is not stock ownership.
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
                    <button type="button" className={styles.primary} onClick={halley.estimate}>
                      Fresh estimate<span aria-hidden="true"> ↻</span>
                    </button>
                  )}
                  <button type="button" className={styles.secondary} onClick={halley.revise}>Adjust the slip</button>
                  <button type="button" className={styles.secondary} onClick={halley.cancel}>Discard</button>
                </div>
                {expired && <p className={styles.notice} role="status">This estimate has lapsed — the figures above are its last reading.</p>}
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

                    <p id="halley-anchor-hint" className={plate.hint}>An observed equity mark sets the opening price — marks rest while the market sleeps. None, or an unavailable mark, uses 1 quote unit instead; the estimate discloses it.</p>
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
                        onClick={() => halley.edit({ curve: c })}>
                        <CurveGlyph preset={c} />
                        {c === 'equity-pair' ? 'equity pair' : c}
                      </button>
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
                {(halley.state.noticeCode === 'anchor_stale' || halley.state.noticeCode === 'anchor_unavailable') && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={halley.state.stage === 'estimating'}
                    onClick={halley.estimateUnanchored}
                  >
                    Drop the anchor — redraw unanchored
                  </button>
                )}
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
                {!complete && <p id="halley-needed" className={plate.needed}>Still needed: {missing.join(', ')}.</p>}
              </>
            )}
          </div>

          {liveEnabled && !viewed && (
            <HalleyLiveLaunch intent={liveIntent} revision={estimate?.quotedAt ?? 0} />
          )}
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
    </div>
  );

  if (roomView) {
    return (
      <RoomPresentation
        desk={desk.activeDesk}
        stage={projection.stage}
        view={projection.view}
        presentation={presentationMode}
        onPresentation={changeView}
        onSwitchDesk={desk.switchDesk}
        onLeaveDesk={desk.leaveDesk}
      >
        {work}
      </RoomPresentation>
    );
  }
  return (
    <DeskRoom
      deskId="halley"
      activeDesk={desk.activeDesk}
      open={desk.open}
      lineLive={lineLive}
      deskStage={halley.state.stage}
      onSwitchDesk={desk.switchDesk}
      onLeaveDesk={desk.leaveDesk}
    >
      {work}
    </DeskRoom>
  );
}
