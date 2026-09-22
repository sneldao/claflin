import type { EntryIntent } from '../house-entry';

/**
 * Provenance line for a draft the foyer helped write. The stamp holds only
 * while the ticket still carries what arrived — any drift in side or amount
 * retires it, so the paper never claims a handoff it no longer shows.
 */
export function carriedIntentNote(
  intent: EntryIntent | null,
  draft: { side?: string | null; amount?: string | null },
): string | null {
  if (!intent) return null;
  if (intent.side && intent.side !== (draft.side ?? null)) return null;
  if (intent.amount && intent.amount !== (draft.amount ?? null)) return null;
  const parts = [intent.side, intent.amount].filter(Boolean);
  if (parts.length === 0) return null;
  return `Carried onto this ticket · ${parts.join(' · ')}`;
}
