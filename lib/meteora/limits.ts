/**
 * Halley live swap limits — pure constants, safe for the client bundle.
 * The market panel reads them to explain caps before a 422 ever reaches
 * the caller; the server reads the same values to enforce them.
 */
export const HALLEY_SWAP_LIMITS = {
  /** Largest single buy, whole quote units. */
  maxBuyQuote: '10000',
  maxSlippageBps: 1000,
  defaultSlippageBps: 100,
} as const;
