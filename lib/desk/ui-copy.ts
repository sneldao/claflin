/**
 * Single source of truth for the desk UI's repeated facts. Every surface used
 * to hand-roll its own prose for the same few truths — mode identity, market
 * provenance, evidence caveats — which read back to users as noise. Components
 * reference these strings instead; trimming verbosity becomes one edit here.
 */

export const MODE_LABELS = {
  paper: 'PAPER',
  live: 'LIVE',
} as const;

/** One line behind the stamp disclosure — not a second banner. */
export const MODE_HINTS = {
  jessePaper: 'Jupiter estimates · no funds move · kept in this browser.',
  jesseLive: 'Settles on Solana after you sign. Paper filing stays available.',
  hettyPaper: 'Real estimates · no funds move.',
  hettyLive: 'Real tokens move when you sign.',
} as const;

/** Compact market labels for the mode row — not a product brochure. */
export const MARKET_LABELS = {
  jesse: 'SOLANA',
  hetty: 'BASE',
} as const;

/** Said once at the line foot — not on every caption and tooltip. */
export const LINE_FOOT = 'Mic stays off until you ring. Only you can sign.';

export const RECEIVER_CUE_LEAD = 'Lift the receiver — or press';
export const RECEIVER_CUE_TAIL = '. Speak first.';

export const BLANK_SLIP_TITLE = {
  jesse: 'Jesse will write what you say.',
  hetty: 'Hetty will write what you say.',
} as const;

/** Rotating “try saying” lines under the idle ring button — the action
 *  shown, not explained. Cycled client-side; the first line is the SSR one. */
export const RING_EXAMPLES = {
  jesse: ['what’s on the tape?', 'compare NVIDIA xStock', 'price 50 USDC of TSLAx'],
  hetty: ['what’s moving on the tape?', 'explain the estimate before I decide'],
} as const;

/** One action vocabulary for both desks' slips — same verbs, same order. */
export const SLIP_ACTIONS = {
  price: 'Price it',
  fresh: 'Fresh price',
  file: 'File paper record',
  setAside: 'Set aside',
  compare: 'Compare markets',
} as const;

/** One caveat line for the whole evidence module — rendered once, not per source. */
export const EVIDENCE_DISCLAIMER =
  'Reference only — not an exchange print, not arbitrage.';

/** Empty-state line inside the market-evidence card; paired with its action. */
export const MARKET_EMPTY_HINT = 'No comparison on this slip yet.';

export const PYTH_PRO_ABOUT =
  'Equity and xStock reference via Pyth Pro.';

export const VENUE_DUPLEX_ABOUT =
  'Backed or Jupiter stock reference vs Jupiter venue USD for the same mint.';

export const PRESTOCKS_ABOUT =
  'Issuer mark vs token — PreStocks only; not the xStock paper ticket.';

/** Foyer hero — one lede, one boundary. The lede is the plain sentence
 *  under the headline: what the house is, without the theme. */
export const FOYER_LEDE =
  'Trade tokenized US stocks by voice, onchain, any hour.';

/** Foyer headline follows the listing exchange's session. `pending` is the
 *  SSR / first-paint line, before the client knows the time. */
export const FOYER_HEADLINES = {
  pending: ['The exchange closes.', 'This book doesn’t.'],
  closed: ['The floor is dark.', 'The line is open.'],
  open: ['The floor is loud.', 'The line outlasts the bell.'],
} as const;

/** Said once per open line so a human name never reads as a human broker. */
export const LINE_IDENTITY = 'AI broker';

/** The house turret — one line in, lamps out (docs/FOYER_LINE.md §4.1). */
export const TURRET_COPY = {
  hold: 'Hold to talk',
  listening: 'Listening — release to send',
  transcribing: 'Writing it down…',
  hint: 'Press and hold to talk (or hold Space). Or just type.',
  micNote: 'The browser asks for the microphone only while you hold. Typing works the same.',
  heard: 'Heard:',
  lampMatch: 'Carries this',
  lampQuiet: 'Not on this line',
  planned: 'coming soon',
  handset: 'The house line, wherever you are on the page.',
} as const;

/** What an onchain gap on the wire is measured against. */
export const WIRE_GAP_REFERENCE = 'vs stock';

export const FOYER_BOUNDARY = 'Paper by default. Only you can sign.';

/** First-exposure captions that teach an ambient signal once, then retire.
 *  Keys are stable per browser (`claflin.signals.v1.*`); the text equivalent
 *  of each signal stays available on tap and to assistive tech permanently. */
export const SIGNAL_CAPTIONS = {
  lampCool: 'The room cools when readings go stale — the tape keeps the last known marks.',
  fuseDrain: 'The brass rule drains as the estimate expires — refresh for fresh terms.',
  stampThud: 'That thud is the filing stamp — paper filed, nothing moved.',
} as const;

export type SignalCaptionKey = keyof typeof SIGNAL_CAPTIONS;
