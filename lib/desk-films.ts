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
  hetty: {
    src: '/media/hetty-card-v1.mp4',
    poster: '/media/hetty-card-v1-poster.jpg',
    length: '39 s',
    hook: 'Who Hetty was — the whaling fortune, the panic of ’07 — and what the desk borrows from her.',
    namesake: 'Hetty Green',
    transcript:
      'Hetty Green inherited a whaling fortune and spent fifty years making it the largest a woman had ever held. She kept her own counsel and her own cash — read every balance sheet herself before she trusted a number. When the Street panicked, Hetty was the one with money: she bought when everyone else was selling, and in nineteen oh-seven she helped carry the City of New York itself. They called her the Witch of Wall Street; the record calls her patient. My desk borrows her habit: downside first, conviction second.',
  },
  tennie: {
    src: '/media/tennie-card-v1.mp4',
    poster: '/media/tennie-card-v1-poster.jpg',
    length: '40 s',
    hook: 'Who Tennie was — the first brokerage women ran, the open book — and what the desk borrows from her.',
    namesake: 'Tennie Claflin',
    transcript:
      "Tennie Claflin never waited to be let in. In eighteen-seventy, she and her sister opened Woodhull, Claflin and Company on Broad Street — the first brokerage women ever ran on Wall Street — with Vanderbilt's stake behind it, and a ladies' parlor where clients could watch their own book. The papers called her the Lady Broker and meant the laugh. The firm took the accounts the men's houses refused, and its weekly printed what the Street would not say aloud. This house carries her name. My desk borrows her rule: three tapes side by side — and the client let in to read them.",
  },
};
