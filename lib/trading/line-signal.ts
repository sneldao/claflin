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
