import type { HouseDeskId } from '../house';

/** Per-broker voice-line details shared by the foyer cards and the desk plates. */
export const BROKER_VOICE: Partial<Record<HouseDeskId, {
  epithet: string;
  rail: string;
  lens: string;
}>> = {
  hetty: {
    epithet: 'The Witch of Wall Street',
    rail: 'Coinbase Tokenized Stocks · Base',
    lens: 'Asks what you could lose before what you might make.',
  },
  jesse: {
    epithet: 'The Boy Plunger',
    rail: 'Backed xStocks · Solana',
    lens: 'Reads the tape first — price action and timing.',
  },
  isabel: {
    epithet: 'The Railroad Lady',
    rail: 'Stock Tokens · Robinhood Chain',
    lens: 'Three tapes — issuer, chain, venue — read side by side, never blended.',
  },
  halley: {
    epithet: 'The Comet Caller',
    rail: 'Meteora launches · Solana',
    lens: 'Anchors a new price to a known one before the crowd arrives.',
  },
};
