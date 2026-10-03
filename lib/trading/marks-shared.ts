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
  /** The desk's second leg — e.g. Jesse's stock reference versus the venue
     price, present only when the two readings were actually comparable. */
  stockReference?: {
    priceUsd: string;
    source: 'backed' | 'jupiter-stock-data' | 'robinhood' | 'coinbase-exchange';
    differenceBps: string | null;
    /** Issuer-declared trading halt — surfaced, never hidden (Isabel/rhj). */
    halted?: boolean;
  };
  /**
   * Optional third leg — the desk's venue mark (e.g. Lighter orderbook
   * midpoint for Isabel). When present, the board renders all three
   * legs (token mark · stock ref · venue mark) with their sources and
   * freshness, never blended. Source union is a small set; the venue
   * adapter is the only place that should mint these.
   */
  venueMark?: {
    priceUsd: string;
    source: 'lighter';
    /** Per-symbol realized 24h volume on the venue, when the adapter
        can read it. Null when not supported. */
    volume24hUsd?: string | null;
  };
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

/** Human-readable age for a stale mark result, e.g. "2 min" or "45 s". */
export function formatMarkAge(asOf: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - asOf) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}
