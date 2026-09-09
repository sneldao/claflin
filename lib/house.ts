export const HOUSE = Object.freeze({
  name: 'Claflin',
  title: 'Claflin — the office above the pit',
  tagline: 'The office above the pit',
  description: 'The pit is downstairs. This desk is for deciding. Paper trading on Coinbase Tokenized Stocks on Base.',
  mode: 'paper' as const,
  liveExecutionEnabled: false as const,
  voiceConversationEnabled: true as const,
});

export const HOUSE_DESKS = Object.freeze([
  Object.freeze({ id: 'hetty', name: 'Hetty', market: 'Base', approach: 'Independent judgment. Capital preservation. Deliberate decisions.', status: 'paper' as const }),
  Object.freeze({ id: 'jesse', name: 'Jesse Livermore', market: 'Solana', approach: 'Price action, timing, and disciplined speculation.', status: 'planned' as const }),
  Object.freeze({ id: 'isabel', name: 'Isabel Benham', market: 'Robinhood Chain', approach: 'Fundamental analysis and patient investigation.', status: 'planned' as const }),
  Object.freeze({ id: 'arbitrum', name: 'A future desk', market: 'Arbitrum', approach: 'Mandate and broker to be defined after the first three desks.', status: 'planned' as const }),
]);

export type HouseDesk = (typeof HOUSE_DESKS)[number];
export type HouseDeskId = HouseDesk['id'];

export const OPEN_DESK_ID: HouseDeskId = 'hetty';

export function getHouseDesk(id: string): HouseDesk | undefined {
  return HOUSE_DESKS.find(desk => desk.id === id);
}

export function isOpenDesk(id: string): id is typeof OPEN_DESK_ID {
  return id === OPEN_DESK_ID;
}

export const RETIRED_CLIENT_PATHS = Object.freeze([
  '/marketplace', '/demo', '/dashboard', '/profile', '/list-your-broker', '/admin', '/admin/analytics',
]);

export function isRetiredMarketplaceApi(path: string): boolean {
  const normalized = path.replace(/\/$/, '');
  return normalized === '/api/agents' || normalized.startsWith('/api/agents/') ||
    normalized === '/api/ratings' || normalized === '/api/sdk/register';
}
