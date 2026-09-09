import { AERODROME_VENUE } from '../../tokenized-stocks';
import { BASE_CHAIN_ID } from '../../base-chain';
import { createAerodromeReader } from '../aerodrome';
import { createQuoteService } from '../quotes';
import { deskQuoteLimits } from '../desk-mandate';
import { OPEN_DESK_ID } from '../../house';
import type { DeskInstrument } from '../catalog';
import type { QuoteEstimate } from '../domain';
import type { QuoteAdapter } from '../adapters';

/**
 * Aerodrome Slipstream quote adapter — Hetty's Base desk. The reader,
 * identity verification, and estimate binding all live in the hardened
 * quote service; this adapter only binds that service to its venue,
 * chain, and desk limits.
 */
export const aerodromeQuoteAdapter: QuoteAdapter = {
  venue: AERODROME_VENUE,
  chainId: BASE_CHAIN_ID,
  canQuote(instrument: DeskInstrument): boolean {
    return instrument.quoteSupported
      && instrument.venuePairs.some(pair => pair.venue === AERODROME_VENUE && pair.chainId === BASE_CHAIN_ID);
  },
  quote(input: unknown): Promise<QuoteEstimate> {
    return createQuoteService(createAerodromeReader(), Date.now, () => crypto.randomUUID(), deskQuoteLimits(OPEN_DESK_ID))(input);
  },
};
