'use client';

/**
 * The launch share card — the house metaphor as an object: a paper plate with
 * the comet emblem, the ticker, the curve it will trade on, and the door back
 * to the desk. Drawn to one canvas; the same pixels save, share, and preview.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HalleyPaperRecord } from '../../lib/meteora/paper';
import styles from './HalleyShareCard.module.css';

const CARD_W = 1200;
const CARD_H = 630;

export interface HalleyShareCardProps {
  record: HalleyPaperRecord;
  href?: string;
  onBack?: () => void;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function drawLaunchCard(canvas: HTMLCanvasElement, record: HalleyPaperRecord, href: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = CARD_W;
  canvas.height = CARD_H;

  const paper = cssVar('--desk-paper', '#ece2cd');
  const ink = cssVar('--desk-paper-ink', '#241c10');
  const brass = cssVar('--desk-brass', '#a4823f');
  const muted = cssVar('--desk-paper-muted', '#6d5f45');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = brass;
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, CARD_W - 52, CARD_H - 52);

  const estimate = record.estimate;
  const intent = estimate.intent;

  ctx.fillStyle = brass;
  ctx.font = '600 26px ui-monospace, monospace';
  ctx.fillText('C L A F L I N   ·   L A U N C H   D E S K', 64, 96);

  ctx.fillStyle = ink;
  ctx.font = '700 84px Georgia, serif';
  ctx.fillText(intent.name.slice(0, 22), 64, 190);
  ctx.font = '700 44px ui-monospace, monospace';
  ctx.fillStyle = brass;
  const tickerText = `$${intent.symbol}`;
  ctx.fillText(tickerText, 64, 252);
  if (intent.anchorSymbol) {
    const tickerWidth = ctx.measureText(tickerText).width;
    ctx.font = 'italic 34px Georgia, serif';
    ctx.fillStyle = muted;
    ctx.fillText(`tracks ${intent.anchorSymbol}`, 64 + tickerWidth + 40, 252);
  }

  const prices = estimate.path.map(p => Number(p.priceQuote));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const gx = 620, gy = 120, gw = 500, gh = 360;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  estimate.path.forEach((p, i) => {
    const x = gx + Number(p.progress) * gw;
    const y = gy + gh - ((Number(p.priceQuote) - min) / span) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  /* Comet over the opening of the curve. */
  const cx = gx, cy = gy + gh;
  ctx.strokeStyle = brass;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 150, cy - 90);
  ctx.quadraticCurveTo(cx - 60, cy - 40, cx - 10, cy - 8);
  ctx.stroke();
  ctx.fillStyle = brass;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = muted;
  ctx.font = '28px ui-monospace, monospace';
  ctx.fillText(`opens ${Number(estimate.openingPriceQuote).toFixed(2)} ${intent.quoteSymbol} · open market at ${Number(estimate.graduationPriceQuote).toFixed(2)}`, 64, CARD_H - 150);

  ctx.fillStyle = brass;
  ctx.font = '600 30px ui-monospace, monospace';
  ctx.fillText(href.replace(/^https?:\/\//, ''), 64, CARD_H - 74);

  ctx.fillStyle = muted;
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillText(record.mode === 'paper' ? 'Paper launch — a tracker token, not stock ownership.' : 'Launched on the desk — not stock ownership.', gx, CARD_H - 74);
}

export function HalleyShareCard({ record, href = 'https://claflin.trustfall.xyz', onBack }: HalleyShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawLaunchCard(canvasRef.current, record, href);
  }, [record, href]);

  const blobOf = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  }, []);

  const save = useCallback(async () => {
    const blob = await blobOf();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claflin-${record.estimate.intent.symbol.toLowerCase()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [blobOf, record]);

  const share = useCallback(async () => {
    const blob = await blobOf();
    const intent = record.estimate.intent;
    const text = `${intent.name} ($${intent.symbol})${intent.anchorSymbol ? ` tracks ${intent.anchorSymbol}` : ''} — launched on Claflin's Halley desk`;
    if (blob && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      const file = new File([blob], `claflin-${intent.symbol.toLowerCase()}.png`, { type: 'image/png' });
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: intent.name, text, files: [file], url: href });
          return;
        }
      } catch { /* dismissed — fall through to link share */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} · ${href}`);
      setStatus('Link copied for you to paste.');
    } catch {
      setStatus('Could not reach the clipboard from this browser.');
    }
  }, [blobOf, record, href]);

  return (
    <section className={styles.card} aria-label="Share this launch">
      {onBack && <button type="button" className={styles.back} onClick={onBack}>Back</button>}
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void share()}>Share card</button>
        <button type="button" className={styles.secondary} onClick={() => void save()}>Save image</button>
      </div>
      {status && <p className={styles.status} role="status">{status}</p>}
    </section>
  );
}
