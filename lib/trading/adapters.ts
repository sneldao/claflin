import { getHouseDesk, OPEN_DESK_ID, type HouseDeskId } from '../house';
import { TradingError, type QuoteEstimate } from './domain';
import type { DeskInstrument } from './catalog';
import type { MarksResult } from './marks-shared';
import { aerodromeQuoteAdapter } from './adapters/aerodrome';
import { chainlinkMarkAdapter } from './adapters/chainlink';

/**
 * Venue adapter registries — one desk, one market, one verified venue set.
 * A desk resolves to its adapters; a planned desk has none yet and refuses
 * with `desk_unavailable` rather than borrowing another desk's venue.
 *
 * Today's registry holds a single entry per kind (Aerodrome quotes,
 * Chainlink marks, both Base). Solana (Jupiter marks/quotes), Robinhood
 * (market-data API), and Arbitrum (EVM reuse) register here without
 * touching the routes, the ticket, or the voice tools.
 */

export interface QuoteAdapter {
  readonly venue: string;
  readonly chainId: number;
  canQuote(instrument: DeskInstrument): boolean;
  quote(input: unknown): Promise<QuoteEstimate>;
}

export interface MarkAdapter {
  readonly source: string;
  readonly market: string;
  read(): Promise<MarksResult>;
}

/** Paper execution boundary. Today every desk records locally; a live desk
 *  registers an adapter that builds, submits, and tracks settlement. */
export interface ExecutionAdapter {
  readonly mode: 'paper' | 'live';
}

const QUOTE_ADAPTERS: Record<HouseDeskId, QuoteAdapter | null> = {
  hetty: aerodromeQuoteAdapter,
  jesse: null,
  isabel: null,
  arbitrum: null,
};

const MARK_ADAPTERS: Record<HouseDeskId, MarkAdapter | null> = {
  hetty: chainlinkMarkAdapter,
  jesse: null,
  isabel: null,
  arbitrum: null,
};

function unavailable(deskId: string): TradingError {
  const desk = getHouseDesk(deskId);
  const name = desk ? `${desk.name}’s ${desk.market} desk` : 'That desk';
  return new TradingError('desk_unavailable', `${name} is not open for quotation yet. Hetty’s Base desk is open for paper estimates.`, 422);
}

export function quoteAdapterFor(deskId: string): QuoteAdapter {
  const key = deskId.toLowerCase() as HouseDeskId;
  const adapter = QUOTE_ADAPTERS[key];
  if (!adapter || key !== OPEN_DESK_ID) throw unavailable(deskId);
  return adapter;
}

export function markAdapterFor(deskId: string): MarkAdapter {
  const key = deskId.toLowerCase() as HouseDeskId;
  const adapter = MARK_ADAPTERS[key];
  if (!adapter || key !== OPEN_DESK_ID) throw unavailable(deskId);
  return adapter;
}
