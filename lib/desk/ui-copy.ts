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

export const BLANK_SLIP_NOTE =
  'Ring the line, or tap a line the desk hears. This slip stays blank until there is an instruction.';

export const HAND_FORM_SUMMARY = 'Write it by hand';

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

/** Foyer hero — one lede, one boundary. */
export const FOYER_LEDE =
  'Ring a broker, say the trade, watch the slip get written.';

export const FOYER_BOUNDARY = 'Paper by default. Only you can sign.';
