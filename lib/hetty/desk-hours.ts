/**
 * The broadcast desk's posted hours.
 *
 * The desk is not a channel — it keeps sittings, announced ahead of time
 * like market hours, and between them the lamp is dark. This list is the
 * whole schedule; the foyer reads it and nothing else invents hours.
 *
 * Empty is the honest answer: the marathon's window is a Phase 0 decision
 * and the sheet posts nothing it cannot keep. When sittings are posted,
 * append them in order — the next upcoming entry is what the foyer shows.
 */

export type BroadcastWindow = {
  /** What the sheet calls the sitting — "the launch marathon". */
  label: string;
  /** ISO 8601 instants, UTC. */
  opensAt: string;
  closesAt: string;
};

export const POSTED_WINDOWS: readonly BroadcastWindow[] = [];

/** The next sitting that has not fully passed — or null when none is posted. */
export function nextBroadcastWindow(nowMs: number, windows: readonly BroadcastWindow[] = POSTED_WINDOWS): BroadcastWindow | null {
  const upcoming = windows
    .filter(w => Number.isFinite(Date.parse(w.opensAt)) && Date.parse(w.closesAt) > nowMs)
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));
  return upcoming[0] ?? null;
}

/** How the sheet prints a sitting: "The launch marathon · Nov 28". */
export function formatBroadcastWindow(window: BroadcastWindow): string {
  const day = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(window.opensAt));
  return `${window.label} · ${day}`;
}
