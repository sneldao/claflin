/**
 * Halley's watch tape — replaying a filed paper launch along its projected
 * curve. Pure and clock-injected: the same record at the same `now` always
 * gives the same reading. On paper the tape is simulated and says so; a live
 * pool would feed real buys through the same shape.
 */

import type { HalleyPaperRecord } from './paper';
import type { HalleyPathPoint } from './contracts';

/** Launch-day rush: the simulated tape covers most of the curve within a
    day of filing (tanh(elapsed / RUSH) — 46% at 6h, 96% at 24h). */
const RUSH_MS = 12 * 60 * 60 * 1000;
const RIPPLE_AMPLITUDE = 0.01;
const RIPPLE_PERIOD_MS = 7 * 60 * 1000;
const GRADUATED_AT = 0.995;

export interface HalleyWatchTape {
  /** Curve fill 0–1. Simulated on a paper record. */
  progress: number;
  /** Quote units collected along the curve at this progress, human units. */
  collectedQuote: number;
  quoteSymbol: string;
  /** Projected price at the current progress, quote units per base token. */
  currentPriceQuote: number;
  openingPriceQuote: number;
  graduationPriceQuote: number;
  /** Simulated tape has filled the projected curve. Never a real migration. */
  graduated: boolean;
  /** Hours until the tape crosses graduation at the current pace. */
  hoursToGraduation: number | null;
  /** Fraction (0–1) crossed since filing — drives the milestone chime. */
  crossedMilestone: 0.5 | 1 | null;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000 / 1000;
}

export function priceAlongPath(path: readonly HalleyPathPoint[], progress: number): number {
  if (path.length === 0) return 0;
  const p = Math.min(1, Math.max(0, progress));
  const first = Number(path[0].priceQuote);
  const last = Number(path[path.length - 1].priceQuote);
  if (p <= Number(path[0].progress)) return first;
  if (p >= Number(path[path.length - 1].progress)) return last;
  for (let i = 1; i < path.length; i++) {
    const x0 = Number(path[i - 1].progress);
    const x1 = Number(path[i].progress);
    if (p >= x0 && p <= x1) {
      if (x1 === x0) return Number(path[i].priceQuote);
      const t = (p - x0) / (x1 - x0);
      return Number(path[i - 1].priceQuote) + t * (Number(path[i].priceQuote) - Number(path[i - 1].priceQuote));
    }
  }
  return last;
}

export function watchPaperLaunch(record: HalleyPaperRecord, now: number): HalleyWatchTape {
  const estimate = record.estimate;
  const elapsed = Math.max(0, now - record.createdAt);
  const base = Math.tanh(elapsed / RUSH_MS);
  const seed = seedOf(record.id);
  /* The wobble lives mid-curve and dies at both ends — the tape opens at the
     anchor and closes at the graduation line, not somewhere near them. */
  const damp = 4 * base * (1 - base);
  const ripple = Math.sin(elapsed / RIPPLE_PERIOD_MS + seed * Math.PI * 2) * RIPPLE_AMPLITUDE * damp;
  const progress = Math.min(1, Math.max(0, base + ripple));

  /* The user's own graduation term — "raise this much before the open
     market" — is the honest denominator for collected, not the SDK's raw
     migration threshold on the market-cap curve. */
  const thresholdQuote = Number(estimate.intent.graduationQuote);
  const opening = Number(estimate.openingPriceQuote);
  const graduation = Number(estimate.graduationPriceQuote);
  const at = priceAlongPath(estimate.path, progress);

  const TAPE_END = 0.995;
  const clamped = Math.min(progress, 0.999_999);
  const hoursToGraduation = progress >= GRADUATED_AT
    ? 0
    : Math.max(0, (Math.atanh(TAPE_END) - Math.atanh(clamped)) * RUSH_MS) / 3_600_000;

  const previous = Math.tanh(Math.max(0, elapsed - 15_000) / RUSH_MS);
  let crossedMilestone: 0.5 | 1 | null = null;
  if (progress >= GRADUATED_AT && previous < GRADUATED_AT) crossedMilestone = 1;
  else if (progress >= 0.5 && previous < 0.5) crossedMilestone = 0.5;

  return {
    progress,
    collectedQuote: thresholdQuote * progress,
    quoteSymbol: estimate.intent.quoteSymbol,
    currentPriceQuote: at,
    openingPriceQuote: opening,
    graduationPriceQuote: graduation,
    graduated: progress >= GRADUATED_AT,
    hoursToGraduation: Number.isFinite(hoursToGraduation) ? hoursToGraduation : null,
    crossedMilestone,
  };
}
