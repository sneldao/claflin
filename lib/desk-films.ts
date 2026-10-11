import type { HouseDeskId } from './house';

/**
 * Broker character films — archival cards produced in WinFactory
 * (entries/claflin-broker-cards). Each desk that has a card gets an entry
 * here; the film chip renders only where a card exists.
 */
export type DeskFilm = {
  src: string;
  poster: string;
  /** Length label shown on the chip, e.g. '23 s'. */
  length: string;
  /** Narration text for screen readers / the transcript affordance. */
  transcript: string;
};

export const DESK_FILMS: Partial<Record<HouseDeskId, DeskFilm>> = {
  jesse: {
    src: '/media/jesse-card-v1.mp4',
    poster: '/media/jesse-card-v1-poster.jpg',
    length: '23 s',
    transcript:
      'Jesse Livermore. Eighteen seventy-seven, nineteen forty. Learned the tape in bucket shops before he learned the market, and kept his own line in a pocket notebook long before he trusted it to memory. My desk borrows his discipline: price action and timing first, story second.',
  },
};
