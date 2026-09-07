import type { ReferenceObservation } from './domain';

/**
 * Client-safe surface for desk reference marks — no chain dependencies.
 * The server-side reader lives in marks.ts.
 */

export interface DeskMark {
  instrumentId: string;
  symbol: string;
  name: string;
  reference: ReferenceObservation;
}

export interface MarksResult {
  asOf: number;
  marks: DeskMark[];
}

/** Format a known reference price for tape display; null when none exists. Stale marks still carry their last observation — the caller labels them. */
export function markPrice(mark: DeskMark): string | null {
  const raw = mark.reference.priceUsdPerToken;
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 100 ? value.toFixed(2) : value >= 1 ? value.toFixed(3) : value.toPrecision(3);
}
