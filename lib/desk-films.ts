import type { HouseDeskId } from './house';

/**
 * Broker character films — archival cards produced in WinFactory
 * (entries/claflin-broker-cards). Each desk that has a card gets an entry
 * here; the foyer card turns over only where a film exists.
 */
export type DeskFilm = {
  src: string;
  poster: string;
  /** Length label shown on the card's verso, e.g. '37 s'. */
  length: string;
  /** One line on the verso — what the film is for. */
  hook: string;
  /** The namesake the disclaimer names — the AI character is not this person. */
  namesake: string;
  /** Narration text for screen readers / the transcript affordance. */
  transcript: string;
};

export const DESK_FILMS: Partial<Record<HouseDeskId, DeskFilm>> = {
  jesse: {
    src: '/media/jesse-card-v3.mp4',
    poster: '/media/jesse-card-v3-poster.jpg',
    length: '37 s',
    hook: 'Who Jesse was — the boy plunger, the crash of ’29 — and what the desk borrows from him.',
    namesake: 'Jesse Livermore',
    transcript:
      "Jesse Livermore posted the chalk in a Boston bucket shop at fifteen, and kept his own line in a pocket notebook long before he trusted the market's. The shops threw him out for winning too often — the Boy Plunger, they called him. So he went to New York and read the tape the way nobody else did. In nineteen twenty-nine he took the short side of the greatest crash the Street had ever seen — reputedly a hundred million dollars on a market's ruin. My desk borrows his discipline: price action and timing first, story second.",
  },
};
