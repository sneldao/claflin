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
export const HALLEY_LIVE_CLIENT_ENABLED = process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true';
export const HALLEY_LIVE_SERVER_ENABLED = process.env.HALLEY_LIVE_ENABLED === 'true';
export const halleyLiveEnabled = () => HALLEY_LIVE_CLIENT_ENABLED && HALLEY_LIVE_SERVER_ENABLED;
