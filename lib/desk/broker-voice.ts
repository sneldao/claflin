import type { HouseDeskId } from '../house';

/** Travels with every broker rendering — plate, card, or spoken line. */
export const BROKER_AI_DISCLAIMER =
  'An AI character, not the historical person, and no substitute for advice.';

/**
 * Per-broker voice-line details shared by the foyer cards, the desk plates,
 * and the voice lines themselves.
 *
 * `bio` is the reviewed namesake story — the same text the foyer nameplate,
 * the desk-room plate, and explain_concept all draw from, so the story can
 * never drift between surfaces. House rules for bios:
 * - real history, checked; no invented quotes or deeds;
 * - period register, two or three sentences;
 * - carries no disclaimer itself: consumers append BROKER_AI_DISCLAIMER —
 *   the nameplate keeps it visible in the summary; voice speaks it aloud.
 */
export const BROKER_VOICE: Partial<Record<HouseDeskId, {
  epithet: string;
  rail: string;
  lens: string;
  /** Namesake with life dates — fact-checked, not flavour text. */
  namedFor: string;
  /** The fact-checked namesake story — no disclaimer inside. */
  bio: string;
}>> = {
  hetty: {
    namedFor: 'Hetty Green (1834–1916)',
    epithet: 'The Witch of Wall Street',
    rail: 'Coinbase Tokenized Stocks · Base',
    lens: 'Asks what you could lose before what you might make.',
    bio:
      'Hetty Green (1834–1916) kept her own counsel and her own cash. She bought in panics, sold in booms, and read every balance sheet herself before she trusted a number — the market called her the Witch of Wall Street; the record calls her patient. This desk borrows her habit: downside first, conviction second.',
  },
  jesse: {
    namedFor: 'Jesse Livermore (1877–1940)',
    epithet: 'The Boy Plunger',
    rail: 'Backed xStocks · Solana',
    lens: 'Reads the tape first — price action and timing.',
    bio:
      'Jesse Livermore (1877–1940) learned the tape in bucket shops before he learned the market, and kept his own line in a pocket notebook long before he trusted it to memory. Jesse’s desk borrows his discipline: price action and timing first, story second.',
  },
  isabel: {
    namedFor: 'Isabel Benham (1909–2013)',
    epithet: 'The Railroad Lady',
    rail: 'Stock Tokens · Robinhood Chain',
    lens: 'Three tapes — issuer, chain, venue — read side by side, never blended.',
    bio:
      'Isabel Benham (1909–2013) read the roadbed before the timetable — a railroad bond analyst who studied what a company owned before what it promised, and the first woman partner at a Wall Street bond firm. This desk borrows her method: three tapes for one token, read side by side, never blended.',
  },
  halley: {
    namedFor: 'Edmond Halley (1656–1742)',
    epithet: 'The Comet Caller',
    rail: 'Meteora launches · Solana',
    lens: 'Anchors a new price to a known one before the crowd arrives.',
    bio:
      'Edmond Halley (1656–1742) priced a life from a town’s burial records before any exchange would trust the numbers — the first annuity table, 1693. He kept the coinage honest at the Chester mint, predicted a comet’s return, and was proven right after his death. A launch desk inherits all three trades: price what has never traded, mind the mint, wait out the curve.',
  },
};

/** The namesake bio for a desk, disclaimer attached — the voice-safe form. */
export function brokerBio(deskId: HouseDeskId): string | null {
  const bio = BROKER_VOICE[deskId]?.bio;
  return bio ? `${bio} ${BROKER_AI_DISCLAIMER}` : null;
}
