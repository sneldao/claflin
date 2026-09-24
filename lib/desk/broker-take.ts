import type { MarketClock } from '../market-clock';
import type { DeskMark } from '../trading/marks-shared';
import type { HouseDeskId } from '../house';

/**
 * The broker's take — one line of desk personality grounded in the real
 * marks and the market clock. Pure: the surface computes it and hands the
 * line down to both the desk plate and the foyer card. A take is a way of
 * looking at the tape, never advice, and only the caller's instruction on
 * the ticket counts.
 */
export function brokerTake(
  deskId: HouseDeskId,
  marks: readonly DeskMark[],
  clock: MarketClock | null,
): string | null {
  if (clock === null) return null;

  if (deskId === 'hetty') {
    return clock.exchange === 'closed'
      ? 'The exchange is shut, so the onchain price is the only price tonight. Read what the slip costs you before the number you hope for.'
      : 'The exchange is open and the reference marks move with it. Count what being wrong would cost before you count anything else.';
  }

  if (deskId === 'jesse') {
    const best = widestGap(marks);
    if (best) {
      const abs = Math.abs(best.gap).toFixed(1);
      if (Number(abs) < 1) {
        return `${best.symbol} is tracking its stock reference within a basis point. A quiet tape tells you something too.`;
      }
      return `${best.symbol} is printing ${abs} bps ${best.gap > 0 ? 'over' : 'under'} its stock reference on Solana${clock.exchange === 'closed' ? ' while the exchange is shut' : ''}. The gap is the tape talking — not a promise it closes.`;
    }
    return clock.exchange === 'closed'
      ? 'The exchange is shut; the tape here is still printing. Watch the price, not the story.'
      : 'Both tapes are running. I watch where they disagree.';
  }

  return null;
}

/** The largest |bps| observed mark — the same selection the take makes. */
export function widestGap(marks: readonly DeskMark[]): { symbol: string; gap: number } | null {
  let best: { symbol: string; gap: number } | null = null;
  for (const mark of marks) {
    if (mark.reference.status !== 'observed') continue;
    const raw = mark.stockReference?.differenceBps;
    if (raw === null || raw === undefined) continue;
    const gap = Number(raw);
    if (!Number.isFinite(gap)) continue;
    if (!best || Math.abs(gap) > Math.abs(best.gap)) {
      best = { symbol: mark.symbol, gap };
    }
  }
  return best;
}

/** The room tape's factual line for Jesse's desk — the observed gap, stated
 *  plainly, where the persona take used to sit. */
export function tapeGapLine(marks: readonly DeskMark[], clock: MarketClock | null): string | null {
  const best = widestGap(marks);
  if (!best) return null;
  const abs = Math.abs(best.gap).toFixed(1);
  if (Number(abs) < 1) {
    return `${best.symbol} is within a basis point of its stock.`;
  }
  return `${best.symbol} is ${abs} bps ${best.gap > 0 ? 'over' : 'under'} its stock${clock?.exchange === 'closed' ? ' while the exchange is shut' : ''}.`;
}

/** One gap line for a filed Jesse comparison — the tape at filing, not advice. */
export function comparisonTake(differenceBps: string | null | undefined): string | null {
  if (differenceBps == null || differenceBps === '') return null;
  const gap = Number(differenceBps);
  if (!Number.isFinite(gap)) return null;
  const abs = Math.abs(gap).toFixed(1);
  if (Number(abs) < 1) {
    return 'The venue is tracking its stock reference within a basis point. A quiet tape tells you something too.';
  }
  return `The venue is ${abs} bps ${gap > 0 ? 'over' : 'under'} its stock reference. The gap is the tape talking — not a promise it closes.`;
}
