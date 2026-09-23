import { getHouseDesk } from '../house';
import { TradingError, type QuoteEstimate } from './domain';
import type { MarksResult } from './marks-shared';
import { coverageForOffering, deskRuntimeFor } from '../desk/registry';
import { instructionInstrumentId, offeringForInstrument } from '../desk/offerings';
import { withEstimateContext } from '../desk/estimates';
import type { DeskCoverage, DeskRuntime } from '../desk/contracts';
import { aerodromeQuoteAdapter } from './adapters/aerodrome';
import { jupiterQuoteAdapter } from './adapters/jupiter';
import { chainlinkMarkAdapter } from './adapters/chainlink';
import { jupiterMarkAdapter } from './adapters/jupiter-marks';

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

/* Chain binding and instrument shape stay venue-specific — they are not
 * shared interface requirements. Aerodrome keeps a numeric chain id; Jupiter
 * binds a Solana network. `quote` returns the registered estimate union. */
export interface QuoteAdapter {
  readonly venue: string;
  quote(input: unknown): Promise<QuoteEstimate>;
}

export interface MarkAdapter {
  readonly source: string;
  readonly market: string;
  read(): Promise<MarksResult>;
}

/** Live execution ports share prepare → authorize → submit → reconcile without
 *  flattening EVM calldata and Solana transaction payloads into one schema. */
export type { DeskExecutionPort as ExecutionAdapter } from '../desk/contracts';

const QUOTE_ADAPTERS: Record<string, QuoteAdapter | null> = {
  aerodrome: aerodromeQuoteAdapter,
  jupiter: jupiterQuoteAdapter,
};

const MARK_ADAPTERS: Record<string, MarkAdapter | null> = {
  chainlink: chainlinkMarkAdapter,
  jupiter: jupiterMarkAdapter,
};

function unavailable(deskId: string): TradingError {
  const desk = getHouseDesk(deskId);
  const name = desk ? `${desk.name}’s ${desk.market} desk` : 'That desk';
  return new TradingError('desk_unavailable', `${name} is not open for quotation yet. Open desks offer paper estimates through their own venue.`, 422);
}

export function resolveQuoteCoverage(runtime: DeskRuntime, input?: unknown): DeskCoverage {
  const candidates = runtime.coverages.filter(coverage =>
    coverage.capabilities.quote && coverage.adapters.quote);
  const instrumentId = instructionInstrumentId(input);
  if (!instrumentId) {
    if (candidates.length === 1) return candidates[0];
    throw new TradingError('invalid_request', 'Quote requests must identify a concrete instrument', 400);
  }
  const offering = offeringForInstrument(instrumentId);
  if (!offering || !offering.deskIds.includes(runtime.deskId)) {
    throw new TradingError('unknown_instrument', 'Instrument is not covered by this desk', 404);
  }
  if (!offering.quoteSupported || offering.status !== 'active') {
    throw new TradingError('coverage_pending', `${offering.symbol} is not quote-ready`, 409);
  }
  const coverage = coverageForOffering(runtime, offering);
  if (!coverage) throw unavailable(runtime.deskId);
  return coverage;
}

export function quoteAdapterFor(deskId: string, input?: unknown): QuoteAdapter {
  const runtime = deskRuntimeFor(deskId);
  /* Resolution follows the desk runtime/coverage table, not a rail id —
     a desk with a configured quote adapter and quote capability resolves;
     anything else refuses rather than borrowing another desk's venue. */
  if (!runtime?.capabilities.quote) throw unavailable(deskId);
  const coverage = resolveQuoteCoverage(runtime, input);
  const adapter = QUOTE_ADAPTERS[coverage.adapters.quote ?? ''];
  if (!adapter) throw unavailable(deskId);
  return {
    ...adapter,
    quote: async input => withEstimateContext(await adapter.quote(input)),
  };
}

export function markAdapterFor(deskId: string): MarkAdapter {
  const runtime = deskRuntimeFor(deskId);
  const candidates = runtime?.coverages.filter(coverage =>
    coverage.capabilities.marks && coverage.adapters.marks) ?? [];
  if (!runtime?.capabilities.marks || candidates.length !== 1) throw unavailable(deskId);
  const adapter = MARK_ADAPTERS[candidates[0].adapters.marks ?? ''];
  if (!adapter) throw unavailable(deskId);
  return adapter;
}
