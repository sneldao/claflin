import { LIVE_EXECUTION_ENABLED } from './trading/domain';
import type { DeskCapabilities } from './solana/contracts';

/**
 * Static house identity. Operational capability lives in DESK_CAPABILITIES —
 * read live execution there, not here, so the flag is single-sourced.
 */
export const HOUSE = Object.freeze({
  name: 'Claflin',
  title: 'Claflin — the office above the pit',
  tagline: 'The office above the pit',
  description: 'The pit is downstairs. This desk is for deciding. Coinbase Tokenized Stocks on Base — real onchain trades when live execution is enabled, paper records alongside.',
  mode: 'paper' as const,
  /** Retained for legacy consumers; the desk flag is authoritative. */
  liveExecutionEnabled: LIVE_EXECUTION_ENABLED as boolean,
  voiceConversationEnabled: true as const,
});

export const HOUSE_DESKS = Object.freeze([
  Object.freeze({ id: 'hetty', name: 'Hetty Green', shortName: 'Hetty', market: 'Base', approach: 'Independent judgment. Capital preservation. Deliberate decisions.', status: 'paper' as const }),
  Object.freeze({ id: 'jesse', name: 'Jesse Livermore', shortName: 'Jesse', market: 'Solana', approach: 'Price action, timing, and disciplined speculation.', status: 'planned' as const }),
  Object.freeze({ id: 'isabel', name: 'Isabel Benham', shortName: 'Isabel', market: 'Robinhood Chain', approach: 'Fundamental analysis and patient investigation.', status: 'planned' as const }),
  Object.freeze({ id: 'arbitrum', name: 'Jay Cooke', shortName: 'Jay', market: 'Arbitrum', approach: 'Building the rails that let everyone else move money.', status: 'planned' as const }),
]);

export type HouseDesk = (typeof HOUSE_DESKS)[number];
export type HouseDeskId = HouseDesk['id'];

export const OPEN_DESK_ID: HouseDeskId = 'hetty';

/**
 * Explicit per-desk capabilities — the directory, adapters, and mandate all
 * consult this record instead of inferring openness from a desk id. Voice
 * and live are independent capabilities: an open desk does not imply either.
 *
 * `live` means the desk can execute real onchain trades. For Hetty it is the
 * NEXT_PUBLIC_LIVE_EXECUTION_ENABLED deployment flag (single-sourced from
 * trading/domain); planned desks are false until their integration ships.
 */
export const DESK_CAPABILITIES: Record<HouseDeskId, DeskCapabilities> = {
  hetty: { quote: true, paper: true, voice: 'elevenlabs-convai', live: LIVE_EXECUTION_ENABLED as boolean },
  /* Jesse quotes via Jupiter (Metis) since the adapter landed; paper filing,
     voice, and live each wait for their own work-order items. quote-only
     does not open the desk — isOpenDesk also requires paper. */
  jesse: { quote: true, paper: false, voice: null, live: false },
  isabel: { quote: false, paper: false, voice: null, live: false },
  arbitrum: { quote: false, paper: false, voice: null, live: false },
};

export function getHouseDesk(id: string): HouseDesk | undefined {
  return HOUSE_DESKS.find(desk => desk.id === id);
}

/** Open means quotation and paper filing are both real — today only Hetty,
 *  so OPEN_DESK_ID stays the legacy/default storage owner. */
export function isOpenDesk(id: string): id is typeof OPEN_DESK_ID {
  const capabilities = DESK_CAPABILITIES[id as HouseDeskId];
  return Boolean(capabilities && capabilities.quote && capabilities.paper);
}

/**
 * Optional account sync stays Hetty-only for this release (plan §5, E1
 * item 5). Jesse records are browser-local: there is no server schema for
 * them, no import UI, and no sync traffic — this is not a claim of cloud
 * backup. The gate exists so callers cannot accidentally run Hetty's
 * /api/paper flows for another desk.
 */
export function supportsAccountSync(deskId: string): boolean {
  return deskId === OPEN_DESK_ID;
}

export const RETIRED_CLIENT_PATHS = Object.freeze([
  '/marketplace', '/demo', '/dashboard', '/profile', '/list-your-broker', '/admin', '/admin/analytics',
]);

export function isRetiredMarketplaceApi(path: string): boolean {
  const normalized = path.replace(/\/$/, '');
  return normalized === '/api/agents' || normalized.startsWith('/api/agents/') ||
    normalized === '/api/ratings' || normalized === '/api/sdk/register';
}
