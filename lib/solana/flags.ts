/**
 * Jesse desk release flags. Same shape as LIVE_EXECUTION_ENABLED: a public
 * Next env that the capability table and UI both read. Default open; set
 * NEXT_PUBLIC_JESSE_PAPER_ENABLED=false to close the seated desk.
 */

export const JESSE_PAPER_ENABLED = process.env.NEXT_PUBLIC_JESSE_PAPER_ENABLED !== 'false';

/**
 * Live Solana settle (Jupiter order → wallet sign → execute). Default off.
 * Both the public client flag and the server flag must be `true` — neither
 * alone enables real funds. See build plan §4.6.
 *
 * Read at call time so tests and runtime env flips are honest.
 */
export function jesseLiveClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED === 'true';
}

export function jesseLiveServerEnabled(): boolean {
  return process.env.JESSE_LIVE_ENABLED === 'true';
}

export function jesseLiveEnabled(): boolean {
  return jesseLiveClientEnabled() && jesseLiveServerEnabled();
}

/** Client bundle alias — Next inlines NEXT_PUBLIC_* at build time. */
export const JESSE_LIVE_CLIENT_ENABLED = process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED === 'true';
