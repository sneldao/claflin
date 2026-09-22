/**
 * Single source of truth for the desk UI's repeated facts. Every surface used
 * to hand-roll its own prose for the same few truths — mode identity, market
 * provenance, evidence caveats — which read back to users as noise. Components
 * reference these strings instead; trimming verbosity becomes one edit here.
 */

export const MODE_LABELS = {
  paper: 'PAPER TRADING',
  live: 'LIVE EXECUTION',
} as const;

export const MODE_HINTS = {
  jessePaper: 'Real Jupiter estimates, no real funds move. Kept in this browser.',
  jesseLive: 'Settles on Solana after your signature. Paper filing stays available.',
  hettyPaper: 'Real estimates, no real funds move.',
  hettyLive: 'Real tokens and real USDC will move when you sign.',
} as const;

/** One caveat line for the whole evidence module — rendered once, not per source. */
export const EVIDENCE_DISCLAIMER =
  'Reference reading only — not an exchange print, not arbitrage, not profit.';

/** Empty-state line inside the market-evidence card; paired with its action. */
export const MARKET_EMPTY_HINT = 'No comparison on this slip yet.';

export const PYTH_PRO_ABOUT =
  'Equity and xStock reference tape via Pyth Pro. With thanks to the Pyth team for Stocklana trial access.';

export const VENUE_DUPLEX_ABOUT =
  'Free duplex without Pyth Pro: Backed public price-data when available, otherwise Jupiter’s xStocks stock reference, versus Jupiter venue USD for the same mint.';

export const PRESTOCKS_ABOUT =
  'The issuer mark stands in for a public equity feed. SPV-backed PreStocks only; not part of the xStock paper ticket you can file.';
