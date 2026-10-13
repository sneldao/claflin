'use client';

/**
 * Halley's watch screen — the reason to come back after a launch is filed.
 * The projected curve fills toward the open market; on paper the tape is a
 * simulated replay and is always labelled as one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HalleyPaperRecord } from '../../lib/meteora/paper';
import { watchPaperLaunch } from '../../lib/meteora/watch';
import { deskChime } from './desk-chime';
import styles from './HalleyWatch.module.css';

const TICK_MS = 15_000;

export interface HalleyWatchProps {
  record: HalleyPaperRecord;
  onBack?: () => void;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function HalleyWatch({ record, onBack }: HalleyWatchProps) {
  const [now, setNow] = useState<number | null>(() => (typeof window === 'undefined' ? null : Date.now()));
  const chimed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const tape = useMemo(
    () => (now === null ? null : watchPaperLaunch(record, now)),
    [record, now],
  );

  useEffect(() => {
    if (!tape?.crossedMilestone) return;
    const key = `${record.id}:${tape.crossedMilestone}`;
    if (chimed.current.has(key)) return;
    chimed.current.add(key);
    deskChime(tape.crossedMilestone === 1 ? 880 : 660);
  }, [tape, record.id]);

  const estimate = record.estimate;
  const pct = tape ? Math.round(tape.progress * 100) : 0;

  const W = 320;
  const H = 120;
  const prices = estimate.path.map(p => Number(p.priceQuote));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const toXY = (progress: number, price: number): [number, number] => [
    progress * W,
    H - ((price - min) / span) * (H - 12) - 6,
  ];
  const curve = estimate.path
    .map(p => toXY(Number(p.progress), Number(p.priceQuote)).map(v => v.toFixed(1)).join(','))
    .join(' ');
  const fillPath = tape
    ? `0,${H} ${estimate.path
      .map(p => toXY(Math.min(Number(p.progress), tape.progress), Number(p.priceQuote)).map(v => v.toFixed(1)).join(','))
      .join(' ')} ${Math.min(tape.progress * W, W).toFixed(1)},${H}`
    : '';
  const comet = tape ? toXY(tape.progress, tape.currentPriceQuote) : null;

  if (!tape) return null;

  const pace = tape.hoursToGraduation === null
    ? null
    : tape.hoursToGraduation >= 1
      ? `~${Math.round(tape.hoursToGraduation)} h`
      : `~${Math.max(1, Math.round(tape.hoursToGraduation * 60))} min`;

  return (
    <section className={styles.watch} aria-label={`Watching ${estimate.intent.symbol}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Watch · {record.mode === 'paper' ? 'paper launch' : 'launch'}</p>
          <h3 className={styles.name}>{estimate.intent.name} <span className={styles.ticker}>{estimate.intent.symbol}</span></h3>
          {estimate.intent.anchorSymbol && (
            <p className={styles.tracks}>Tracks {estimate.intent.anchorSymbol} · opens at {formatPrice(tape.openingPriceQuote)} {tape.quoteSymbol}</p>
          )}
        </div>
        {onBack && <button type="button" className={styles.back} onClick={onBack}>Back to desk</button>}
      </header>

      <div className={styles.stage}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.curve} role="img" aria-label={`Curve ${pct}% of the way to the open market`}>
          <line x1={0} y1={H - 1} x2={W} y2={H - 1} className={styles.axis} />
          <text x={4} y={H - 6} className={styles.priceTag}>{formatPrice(min)}</text>
          <text x={W - 4} y={12} textAnchor="end" className={styles.priceTag}>{formatPrice(max)}</text>
          {fillPath && <polygon points={fillPath} className={styles.fill} />}
          <polyline points={curve} className={styles.line} fill="none" />
          <line x1={W - 1} y1={0} x2={W - 1} y2={H} className={styles.goal} />
          {comet && (
            <g className={tape.graduated ? styles.cometDone : styles.comet}>
              <circle cx={comet[0]} cy={comet[1]} r={4} className={styles.cometHead} />
              <circle cx={comet[0]} cy={comet[1]} r={8} className={styles.cometHalo} />
            </g>
          )}
        </svg>
        <p className={styles.goalLabel}>Open market</p>
      </div>

      <div className={styles.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.readout}>
        {tape.graduated
          ? 'The tape has filled the projected curve — graduation, on this replay.'
          : `${pct}% of the way to the open market`}
        {!tape.graduated && pace && <span className={styles.pace}> · at this pace, {pace}</span>}
      </p>

      <dl className={styles.stats}>
        <div><dt>Collected</dt><dd>{formatPrice(tape.collectedQuote)} {tape.quoteSymbol}</dd></div>
        <div><dt>Price now</dt><dd>{formatPrice(tape.currentPriceQuote)} {tape.quoteSymbol}</dd></div>
        <div><dt>At open market</dt><dd>{formatPrice(tape.graduationPriceQuote)} {tape.quoteSymbol}</dd></div>
      </dl>

      <p className={styles.stamp}>
        {record.mode === 'paper'
          ? 'Paper launch · the tape is a simulated replay of the projected curve. Nothing was minted.'
          : 'Estimate replay — see the live pool for real fills.'}
      </p>
    </section>
  );
}
