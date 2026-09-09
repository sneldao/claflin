import { z } from 'zod';
import type { HouseDeskId } from '../house';
import { WATCH_STORAGE_KEY } from './desk-documents';
import { markPrice, type DeskMark } from './marks-shared';

/**
 * Watched-mark deltas: what the reference did since the client last had the
 * tray on the desk. The comparison uses Chainlink reference marks only —
 * labelled as reference, never an offer, never advice. A seen snapshot is
 * written per desk; within a session the snapshot is captured once so the
 * delta survives refreshes, and it updates first thing on the next visit.
 */

const snapshotSchema = z.object({
  seenAt: z.number().int().positive(),
  prices: z.record(z.string(), z.number().finite().positive()),
}).strict();

export type SeenSnapshot = z.infer<typeof snapshotSchema>;

const SEEN_PREFIX = `${WATCH_STORAGE_KEY}.seen.`;
const SEEN_MAX_AGE_MS = 45 * 86_400_000; // a stale bench note is discarded, not shown

function seenKey(deskId: HouseDeskId): string {
  return deskId === 'hetty' ? `${SEEN_PREFIX}hetty` : `${SEEN_PREFIX}${deskId}`;
}

export function readSeenSnapshot(storage: Pick<Storage, 'getItem'>, deskId: HouseDeskId, now = Date.now()): SeenSnapshot | null {
  try {
    const raw = storage.getItem(seenKey(deskId));
    if (!raw) return null;
    const snapshot = snapshotSchema.parse(JSON.parse(raw));
    if (now - snapshot.seenAt > SEEN_MAX_AGE_MS) return null;
    if (Object.keys(snapshot.prices).length === 0) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function writeSeenSnapshot(storage: Pick<Storage, 'setItem' | 'removeItem'>, deskId: HouseDeskId, marks: readonly { instrumentId: string; price: number | null }[], now = Date.now()): void {
  const prices: Record<string, number> = {};
  for (const mark of marks) {
    if (mark.price !== null && Number.isFinite(mark.price) && mark.price > 0) prices[mark.instrumentId] = mark.price;
  }
  try {
    if (Object.keys(prices).length === 0) {
      storage.removeItem(seenKey(deskId));
      return;
    }
    storage.setItem(seenKey(deskId), JSON.stringify({ seenAt: now, prices } satisfies SeenSnapshot));
  } catch { /* the tray works without memory */ }
}

export type TrayDelta = {
  instrumentId: string;
  previous: number;
  current: number;
  /** Signed percent change, rounded to one decimal. */
  percent: number;
  direction: 'up' | 'down';
};

/** Compare current reference marks against the seen snapshot. */
export function trayDeltas(snapshot: SeenSnapshot | null, marks: readonly { instrumentId: string; price: number | null }[]): TrayDelta[] {
  if (!snapshot) return [];
  const deltas: TrayDelta[] = [];
  for (const mark of marks) {
    const previous = snapshot.prices[mark.instrumentId];
    if (previous === undefined || mark.price === null || !Number.isFinite(mark.price)) continue;
    if (mark.price <= 0 || previous <= 0) continue;
    if (mark.price === previous) continue;
    const percent = Math.round(((mark.price - previous) / previous) * 1000) / 10;
    if (percent === 0) continue;
    deltas.push({ instrumentId: mark.instrumentId, previous, current: mark.price, percent, direction: percent > 0 ? 'up' : 'down' });
  }
  return deltas;
}

/** Compact spoken/visual line: "NVDAc +1.2% since Tuesday". */
export function deltaLine(delta: TrayDelta, dayLabel: string): string {
  const sign = delta.direction === 'up' ? '+' : '−';
  return `${sign}${Math.abs(delta.percent).toFixed(1)}% since ${dayLabel}`;
}

/** When the tray last saw these marks: "earlier today", "yesterday", a weekday, or a short date. */
export function seenDayLabel(seenAt: number, now = Date.now()): string {
  const seen = new Date(seenAt);
  const current = new Date(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(current) - startOfDay(seen)) / 86_400_000);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return seen.toLocaleDateString(undefined, { weekday: 'long' });
  return seen.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Reference marks → comparable price points (display precision, Chainlink reference only). Unusable marks are dropped. */
export function marksToPoints(marks: readonly DeskMark[]): { instrumentId: string; price: number }[] {
  const points: { instrumentId: string; price: number }[] = [];
  for (const mark of marks) {
    const formatted = markPrice(mark);
    const price = formatted === null ? null : Number(formatted);
    if (price !== null && Number.isFinite(price) && price > 0) points.push({ instrumentId: mark.instrumentId, price });
  }
  return points;
}
