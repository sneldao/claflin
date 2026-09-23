import type { HouseDeskId } from '../house';

/**
 * The line signal — how the room asks HettyCall to lift or hang up the
 * receiver. The call button, the receiver itself, and the H key are three
 * hands on the same switch; the session lifecycle stays owned by HettyCall,
 * which listens for this event and applies its own guards (idle → ring,
 * ringing → cancel, live → hang up).
 *
 * A DOM event (not props) because the receiver is rendered beside — not
 * inside — the dynamically imported call panel, and the signal must survive
 * the panel's remount-per-session lifecycle without re-wiring.
 */
export const LINE_SIGNAL_EVENT = 'claflin:line-signal';

export type LineSignal = 'toggle';

export function signalLine(action: LineSignal = 'toggle'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LineSignal>(LINE_SIGNAL_EVENT, { detail: action }));
}

/**
 * Ring-on-arrival — the foyer's "Ring Hetty / Ring Jesse" buttons hand the
 * desk a one-shot instruction through sessionStorage, so the call panel can
 * lift the receiver itself once it has mounted. Storage is best-effort:
 * a private-mode refusal must not break entry.
 */
const RING_ON_ARRIVAL_KEY = 'claflin:ring-on-arrival';
const RING_ON_ARRIVAL_TTL_MS = 10_000;

export function requestRingOnArrival(deskId: HouseDeskId): void {
  try {
    window.sessionStorage.setItem(RING_ON_ARRIVAL_KEY, JSON.stringify({ deskId, at: Date.now() }));
  } catch {
    /* Storage unavailable — the desk still opens; the line simply stays down. */
  }
}

/** Always clears the key; true only when the pending ring is for this desk and still fresh. */
export function consumeRingOnArrival(deskId: HouseDeskId, now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(RING_ON_ARRIVAL_KEY);
    window.sessionStorage.removeItem(RING_ON_ARRIVAL_KEY);
    if (!raw) return false;
    const pending = JSON.parse(raw) as { deskId?: unknown; at?: unknown };
    return pending.deskId === deskId && typeof pending.at === 'number' && now - pending.at <= RING_ON_ARRIVAL_TTL_MS;
  } catch {
    return false;
  }
}
