'use client';

/**
 * The launch-desk gate — a first-engagement explainer, remembered once per
 * browser. Marked on entry (the caller chose to go in), never on peek: if
 * they fold the panel away unread, the gate stands once more. Private mode
 * fails open — the explainer simply stands at every visit.
 */

const SEEN_KEY = 'claflin.launchdesk.v1.seen';

export function launchDeskSeen(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLaunchDeskSeen(): void {
  try {
    window.localStorage?.setItem(SEEN_KEY, '1');
  } catch {
    /* Private mode: the gate simply stands again next visit. */
  }
}
