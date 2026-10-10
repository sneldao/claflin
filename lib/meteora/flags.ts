/**
 * Halley desk release flags — the Meteora launch desk. Same dual-gate shape
 * as Jesse's: paper is open by default, live launch submission requires the
 * client flag AND the server flag, and neither alone moves real funds.
 *
 * Set NEXT_PUBLIC_HALLEY_PAPER_ENABLED=false to close the seated desk.
 * NEXT_PUBLIC_HALLEY_LIVE_ENABLED gates the client-side live launch path;
 * HALLEY_LIVE_ENABLED gates the server proposal — a real DBC launch needs
 * both.
 */

export const HALLEY_PAPER_ENABLED = process.env.NEXT_PUBLIC_HALLEY_PAPER_ENABLED !== 'false';

/**
 * Live Meteora launch (proposal → wallet sign → broadcast). Default off.
 * Read at call time so tests and runtime env flips are honest.
 */
export function halleyLiveClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true';
}

export function halleyLiveServerEnabled(): boolean {
  return process.env.HALLEY_LIVE_ENABLED === 'true';
}

export function halleyLiveEnabled(): boolean {
  return halleyLiveClientEnabled() && halleyLiveServerEnabled();
}

/** Client bundle alias — Next inlines NEXT_PUBLIC_* at build time. */
export const HALLEY_LIVE_CLIENT_ENABLED = process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true';
