/**
 * Superseded slips — when a fresh estimate lands, the old price is struck
 * through on the same slip rather than silently replaced. Paper bookkeeping,
 * not a market feed: entries are what the desk actually wrote. Desk-agnostic;
 * the caller computes the struck line.
 */

export interface SupersededSlip {
  id: string;
  line: string;
  reason: 'corrected' | 'set-aside';
  at: number;
}

const CAP = 3;

export function trackSuperseded(
  prev: SupersededSlip[],
  before: { quoteId: string | null; line: string | null; stage: string },
  after: { quoteId: string | null; stage: string; draftEmpty: boolean },
  now: number,
): SupersededSlip[] {
  if (after.stage === 'saved' || after.draftEmpty) return [];
  if (before.quoteId && before.line && after.quoteId !== before.quoteId) {
    const entry: SupersededSlip = {
      id: before.quoteId,
      line: before.line,
      reason: after.stage === 'cancelled' ? 'set-aside' : 'corrected',
      at: now,
    };
    return [entry, ...prev.filter(s => s.id !== entry.id)].slice(0, CAP);
  }
  return prev;
}
