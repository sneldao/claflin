'use client';

/**
 * Halley's live curve preview — the launch card's play surface. The sketch
 * redraws as the caller drags the graduation marker along the curve; the
 * desk's verified projection still arrives, unhedged, at review.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { LaunchCurvePreset } from '../../lib/meteora/contracts';
import { graduationQuoteFor, previewCurve } from '../../lib/meteora/preview';
import styles from './HalleyCurvePreview.module.css';

const W = 320;
const H = 120;

export interface HalleyCurvePreviewProps {
  openingPrice: number | null;
  supply: number | null;
  preset: LaunchCurvePreset;
  quoteSymbol: string;
  graduationQuote: number;
  minGraduationQuote?: number;
  maxGraduationQuote?: number;
  onGraduationChange?: (quote: number) => void;
  label?: string;
}

function roundQuote(q: number): number {
  if (q >= 1000) return Math.round(q / 10) * 10;
  if (q >= 100) return Math.round(q);
  if (q >= 10) return Math.round(q * 10) / 10;
  return Math.round(q * 100) / 100;
}

export function HalleyCurvePreview({
  openingPrice, supply, preset, quoteSymbol, graduationQuote,
  minGraduationQuote = 1, maxGraduationQuote, onGraduationChange, label,
}: HalleyCurvePreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [grabbed, setGrabbed] = useState(false);

  const ready = openingPrice !== null && supply !== null && openingPrice > 0 && supply > 0;
  const maxQuote = maxGraduationQuote ?? Math.max(minGraduationQuote * 10, (openingPrice ?? 1) * (supply ?? 1));

  const points = useMemo(
    () => (ready ? previewCurve({ openingPrice: openingPrice!, graduationQuote, supply: supply!, preset }) : []),
    [ready, openingPrice, supply, preset, graduationQuote],
  );

  const prices = points.map(p => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const span = max - min || 1;
  const toXY = (progress: number, price: number): [number, number] => [
    progress * W,
    H - ((price - min) / span) * (H - 16) - 8,
  ];
  const polyline = points.map(p => toXY(p.progress, p.price).map(v => v.toFixed(1)).join(',')).join(' ');
  const end = points.length ? points[points.length - 1] : null;
  const marker = end ? toXY(end.progress, end.price) : null;

  const quoteAt = useCallback((clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg || !ready) return null;
    const rect = svg.getBoundingClientRect();
    const y = ((clientY - rect.top) / rect.height) * H;
    const gradPrice = min + ((H - 8 - y) / (H - 16)) * span;
    const q = graduationQuoteFor(openingPrice!, supply!, Math.max(openingPrice! * 1.01, gradPrice));
    return roundQuote(Math.min(maxQuote, Math.max(minGraduationQuote, q)));
  }, [ready, openingPrice, supply, min, span, maxQuote, minGraduationQuote]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragging.current) return;
    const q = quoteAt(event.clientY);
    if (q !== null) onGraduationChange?.(q);
  }, [quoteAt, onGraduationChange]);

  const step = (multiplier: number) => {
    const q = roundQuote(Math.min(maxQuote, Math.max(minGraduationQuote, graduationQuote * multiplier)));
    if (q !== graduationQuote) onGraduationChange?.(q);
  };

  return (
    <div className={styles.preview}>
      {label && <p className={styles.eyebrow}>{label}</p>}
      <div className={styles.stage}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={ready ? styles.canvas : styles.canvasEmpty}
          onPointerDown={(e) => {
            if (!ready) return;
            dragging.current = true;
            setGrabbed(true);
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const q = quoteAt(e.clientY);
            if (q !== null) onGraduationChange?.(q);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragging.current = false; setGrabbed(false); }}
          onPointerCancel={() => { dragging.current = false; setGrabbed(false); }}
        >
          {ready ? (
            <>
              <polygon
                key={`fill-${preset}-${graduationQuote}-${supply}-${openingPrice}`}
                points={`0,${H} ${polyline} ${W},${H}`}
                className={styles.fill}
              />
              <polyline
                key={`line-${preset}-${graduationQuote}-${supply}-${openingPrice}`}
                points={polyline}
                className={styles.line}
                fill="none"
              />
              <text x={4} y={H - 4} className={styles.priceTag}>{openingPrice!.toFixed(2)}</text>
              {end && <text x={W - 16} y={12} textAnchor="end" className={styles.priceTag}>{end.price.toFixed(2)}</text>}
              {marker && (
                <g
                  key={`marker-${graduationQuote}`}
                  className={grabbed ? styles.grabbed : styles.marker}
                  style={{ '--mx': marker[0], '--my': marker[1] } as React.CSSProperties}
                >
                  <line x1={0} y1={4} x2={0} y2={H} className={styles.drop} />
                  <circle r={7} className={styles.flag} />
                  <circle r={12} className={styles.grabPad} />
                </g>
              )}
            </>
          ) : (
            <text x={W / 2} y={H / 2} textAnchor="middle" className={styles.hint}>
              Pick what it tracks to see the curve
            </text>
          )}
        </svg>
        {ready && marker && (
          <div
            className={styles.markerControl}
            style={{ left: `${(marker[0] / W) * 100}%`, top: `${(marker[1] / H) * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label={`Quote collected before the open market, in ${quoteSymbol}`}
            aria-valuemin={minGraduationQuote}
            aria-valuemax={maxQuote}
            aria-valuenow={graduationQuote}
            aria-valuetext={`${graduationQuote} ${quoteSymbol} raised`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); step(1.1); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); step(1 / 1.1); }
            }}
          />
        )}
      </div>
      <p className={styles.readout}>
        {ready
          ? <>Moves to the open market at <strong>{graduationQuote.toLocaleString('en-US')} {quoteSymbol}</strong> raised · opens at {openingPrice!.toFixed(2)}</>
          : 'The curve opens at the tracked price — a sketch here, the desk’s verified projection at review.'}
      </p>
    </div>
  );
}
