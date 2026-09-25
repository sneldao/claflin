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

/**
 * Which provider carries Jesse's line. `elevenlabs` (default) is the
 * accepted ConvAI line; `assemblyai` runs the same prompt and client tools
 * on AssemblyAI's Voice Agent API. Set NEXT_PUBLIC_JESSE_VOICE=assemblyai
 * to make it the default; `?line=assemblyai|elevenlabs` overrides per visit
 * so one deployment can serve both demos without a redeploy.
 *
 * Establishment failover: on an unpinned visit, a carrier that cannot open
 * the line (session endpoint error, dial stall, transport failure — never
 * mic denial or mid-call drops) hands the pending ring to the other
 * carrier once. A pinned `?line=` never fails over — demo links must not
 * silently change providers.
 */
export type JesseVoiceProvider = 'elevenlabs' | 'assemblyai';

export const JESSE_VOICE_DEFAULT: JesseVoiceProvider =
  process.env.NEXT_PUBLIC_JESSE_VOICE === 'assemblyai' ? 'assemblyai' : 'elevenlabs';

export function jesseVoiceProvider(search: string | null | undefined, fallback: JesseVoiceProvider = JESSE_VOICE_DEFAULT): JesseVoiceProvider {
  const line = new URLSearchParams(search ?? '').get('line');
  return line === 'assemblyai' || line === 'elevenlabs' ? line : fallback;
}

/** Client bundle alias — Next inlines NEXT_PUBLIC_* at build time. */
export const JESSE_LIVE_CLIENT_ENABLED = process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED === 'true';
