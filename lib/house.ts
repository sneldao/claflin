import { LIVE_EXECUTION_ENABLED } from './trading/domain';
import type { DeskCapabilities } from './solana/contracts';
import { JESSE_LIVE_CLIENT_ENABLED, JESSE_PAPER_ENABLED } from './solana/flags';

/**
 * Static house identity. Operational capability lives in DESK_CAPABILITIES —
 * read live execution there, not here, so the flag is single-sourced.
 */
export const HOUSE = Object.freeze({
  name: 'Claflin',
  title: 'Claflin — say a stock trade, see a real estimate',
  /** Quiet brand whisper — not the first product sentence. */
  tagline: 'The office above the pit',
  /** First product sentence on the foyer — what a new visitor can do. */
  headline: 'Say a stock trade. See a real estimate.',
  promise: 'Paper by default — live on Solana when you choose.',
  description:
    'Talk or type an instruction to a specialist desk. Get a real venue estimate, review it, then file a paper record or settle live. Nothing moves without your say.',
  mode: 'paper' as const,
  /** Retained for legacy consumers; the desk flag is authoritative. */
  liveExecutionEnabled: LIVE_EXECUTION_ENABLED as boolean,
  voiceConversationEnabled: true as const,
});

export type DeskStatus = 'paper' | 'planned';

/**
 * Desk doors: plain capability first, market/access second.
 * `approach` stays the editorial lens — secondary on the foyer.
 */
export const HOUSE_DESKS = Object.freeze([
  Object.freeze({
    id: 'hetty',
    name: 'Hetty Green',
    shortName: 'Hetty',
    market: 'Base',
    approach: 'Independent judgment. Capital preservation. Deliberate decisions.',
    access: 'Tokenized stocks on Base · paper',
    capability: 'Talk or type a buy. Get a Base estimate. File a paper record.',
    status: 'paper' as DeskStatus,
  }),
  Object.freeze({
    id: 'jesse',
    name: 'Jesse Livermore',
    shortName: 'Jesse',
    market: 'Solana',
    approach: 'Price action, timing, and disciplined speculation.',
    access: 'Backed xStocks on Solana · paper or live',
    capability: 'Talk or type a buy. Get a Jupiter estimate. Paper or settle live.',
    status: (JESSE_PAPER_ENABLED ? 'paper' : 'planned') as DeskStatus,
  }),
  Object.freeze({
    id: 'isabel',
    name: 'Isabel Benham',
    shortName: 'Isabel',
    market: 'Robinhood Chain',
    approach: 'Fundamental analysis and patient investigation.',
    access: 'Planned — not open yet',
    capability: 'Coming later.',
    status: 'planned' as DeskStatus,
  }),
  Object.freeze({
    id: 'arbitrum',
    name: 'Jay Cooke',
    shortName: 'Jay',
    market: 'Arbitrum',
    approach: 'Building the rails that let everyone else move money.',
    access: 'Planned — not open yet',
    capability: 'Coming later.',
    status: 'planned' as DeskStatus,
  }),
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
 *
 * Jesse paper filing is gated by NEXT_PUBLIC_JESSE_PAPER_ENABLED so the seated
 * surface can land behind a flag before the default opens.
 */
export const DESK_CAPABILITIES: Record<HouseDeskId, DeskCapabilities> = {
  hetty: { quote: true, paper: true, voice: 'elevenlabs-convai', live: LIVE_EXECUTION_ENABLED as boolean },
  jesse: { quote: true, paper: JESSE_PAPER_ENABLED, voice: JESSE_PAPER_ENABLED ? 'elevenlabs-convai' : null, live: JESSE_LIVE_CLIENT_ENABLED },
  isabel: { quote: false, paper: false, voice: null, live: false },
  arbitrum: { quote: false, paper: false, voice: null, live: false },
};

export function getHouseDesk(id: string): HouseDesk | undefined {
  return HOUSE_DESKS.find(desk => desk.id === id);
}

/**
 * Open means quotation and paper filing are both real capabilities.
 * Today Hetty; Jesse when JESSE_PAPER_ENABLED is on. This is the directory /
 * surface routing gate — not the owner of Base v1 documents.
 */
export function isOpenDesk(id: string): id is HouseDeskId {
  const capabilities = DESK_CAPABILITIES[id as HouseDeskId];
  return Boolean(capabilities && capabilities.quote && capabilities.paper);
}

/**
 * Legacy Base document owner — v1 paper records, Base drafts, Base watches,
 * Aerodrome estimates. Independent of isOpenDesk so opening Jesse never makes
 * useTradingDesk treat Solana as a Hetty session.
 */
export function usesLegacyDeskDocuments(id: string): id is typeof OPEN_DESK_ID {
  return id === OPEN_DESK_ID;
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
