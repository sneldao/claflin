/**
 * Desk runtime registry — one explicit resolution point for broker surface,
 * mandate coverage, adapters, storage policy, and runtime capabilities. Rail
 * modules provide implementations; they do not own the shared desk vocabulary.
 */
import {
  DESK_CAPABILITIES,
  getHouseDesk,
  type HouseDeskId,
} from '../house';
import { MARKET_MANDATES } from './mandates';
import { offeringForId, offeringForInstrument } from './offerings';
import type {
  DeskCoverage,
  DeskId,
  DeskRuntime,
  InstrumentOffering,
  MarketMandateId,
  RailRef,
} from './contracts';

export { MARKET_MANDATES } from './mandates';

type CoverageBase = Omit<DeskCoverage, 'capabilities'> & {
  capabilities?: Partial<DeskCoverage['capabilities']>;
};
type RuntimeBase = Omit<DeskRuntime, 'capabilities' | 'coverages'> & {
  coverages: readonly CoverageBase[];
};

const RUNTIME_BASE: Readonly<Record<HouseDeskId, RuntimeBase>> = Object.freeze({
  hetty: Object.freeze({
    deskId: 'hetty',
    coverages: Object.freeze([
      Object.freeze({
        mandate: MARKET_MANDATES['coinbase-tokenized-stocks'],
        adapters: Object.freeze({ quote: 'aerodrome', marks: 'chainlink', execution: 'evm-swap', voice: 'elevenlabs-convai' }),
      }),
    ]),
    storage: Object.freeze({ scope: 'account-sync' as const, legacyDocuments: true, historyLimit: 100 }),
    presentationDefault: 'room' as const,
    surface: 'hetty' as const,
  }),
  jesse: Object.freeze({
    deskId: 'jesse',
    coverages: Object.freeze([
      Object.freeze({
        mandate: MARKET_MANDATES['backed-xstocks'],
        adapters: Object.freeze({ quote: 'jupiter', marks: null, execution: 'jupiter-live', voice: 'elevenlabs-convai' }),
      }),
    ]),
    storage: Object.freeze({ scope: 'browser-local' as const, legacyDocuments: false, historyLimit: 100 }),
    presentationDefault: 'room' as const,
    surface: 'jesse' as const,
  }),
  isabel: Object.freeze({
    deskId: 'isabel',
    coverages: Object.freeze([
      Object.freeze({
        mandate: MARKET_MANDATES['robinhood-stock-tokens'],
        adapters: Object.freeze({ quote: null, marks: null, execution: null, voice: null }),
      }),
    ]),
    storage: Object.freeze({ scope: 'browser-local' as const, legacyDocuments: false, historyLimit: 100 }),
    presentationDefault: 'room' as const,
    surface: null,
  }),
  arbitrum: Object.freeze({
    deskId: 'arbitrum',
    coverages: Object.freeze([
      Object.freeze({
        mandate: MARKET_MANDATES['arbitrum-pending'],
        adapters: Object.freeze({ quote: null, marks: null, execution: null, voice: null }),
      }),
    ]),
    storage: Object.freeze({ scope: 'browser-local' as const, legacyDocuments: false, historyLimit: 100 }),
    presentationDefault: 'room' as const,
    surface: null,
  }),
});

const EXTENDED_CAPABILITIES: Readonly<Record<HouseDeskId, { marks: boolean; accountSync: boolean; evidence: readonly string[] }>> = Object.freeze({
  hetty: Object.freeze({ marks: true, accountSync: true, evidence: [] }),
  jesse: Object.freeze({ marks: false, accountSync: false, evidence: ['comparison', 'venue-duplex', 'prestocks'] }),
  isabel: Object.freeze({ marks: false, accountSync: false, evidence: [] }),
  arbitrum: Object.freeze({ marks: false, accountSync: false, evidence: [] }),
});

/** Resolve the complete runtime description for a known house desk. */
export function deskRuntimeFor(id: string): DeskRuntime | null {
  const deskId = id.toLowerCase() as HouseDeskId;
  if (!getHouseDesk(deskId)) return null;
  const base = RUNTIME_BASE[deskId];
  const capabilities = DESK_CAPABILITIES[deskId];
  const extended = EXTENDED_CAPABILITIES[deskId];
  if (!base || !capabilities || !extended) return null;
  const coverageCapabilities = {
    quote: capabilities.quote,
    paper: capabilities.paper,
    live: capabilities.live,
    marks: extended.marks,
    evidence: extended.evidence,
  };
  return {
    ...base,
    coverages: base.coverages.map(coverage => ({
      ...coverage,
      capabilities: { ...coverageCapabilities, ...coverage.capabilities },
    })),
    capabilities: { ...capabilities, ...extended },
  };
}

/** Find the mandate coverage a desk has declared, if any. */
export function deskCoverageFor(id: string, mandateId: MarketMandateId): DeskCoverage | null {
  const runtime = deskRuntimeFor(id);
  return runtime?.coverages.find(coverage => coverage.mandate.id === mandateId) ?? null;
}

/** Match the complete offering tuple to a declared desk coverage. A mandate is
 *  not enough on its own: rail and venue must also be represented. */
export function coverageForOffering(runtime: DeskRuntime, offering: InstrumentOffering): DeskCoverage | null {
  return runtime.coverages.find(candidate =>
    candidate.capabilities.quote &&
    candidate.mandate.id === offering.mandateId &&
    railMatches(candidate.mandate.rails, offering.rail) &&
    (!offering.venue || candidate.adapters.quote === offering.venue)) ?? null;
}

/** v1 paper/draft/watch storage is a runtime storage policy, not an identity
 *  inferred from the currently open desk. */
export function usesLegacyDeskDocuments(id: string): boolean {
  return deskRuntimeFor(id)?.storage.legacyDocuments === true;
}

/** Account sync is a declared runtime capability; browser-local desks never
 *  run account paper flows by default. */
export function supportsAccountSync(id: string): boolean {
  return deskRuntimeFor(id)?.capabilities.accountSync === true;
}

function railForEstimate(estimate: { network?: unknown; chainId?: unknown }): RailRef | null {
  if (estimate.network === 'solana:mainnet') {
    return { kind: 'solana', network: 'solana:mainnet' };
  }
  const chainId = typeof estimate.chainId === 'number'
    ? estimate.chainId
    : typeof estimate.network === 'string' && estimate.network.startsWith('eip155:')
      ? Number(estimate.network.slice('eip155:'.length))
      : NaN;
  if (Number.isInteger(chainId) && chainId > 0) {
    return { kind: 'evm', network: `eip155:${chainId}`, chainId };
  }
  return null;
}

export function railMatches(expected: readonly RailRef[], actual: RailRef): boolean {
  return expected.some(candidate => {
    if (candidate.kind !== actual.kind) return false;
    if (candidate.kind === 'solana' && actual.kind === 'solana') return candidate.network === actual.network;
    return candidate.kind === 'evm' && actual.kind === 'evm' && candidate.chainId === actual.chainId;
  });
}

function instrumentIdForEstimate(estimate: {
  instrumentId?: unknown;
  intent?: unknown;
}): string | null {
  if (typeof estimate.instrumentId === 'string' && estimate.instrumentId.length > 0) return estimate.instrumentId;
  if (estimate.intent && typeof estimate.intent === 'object') {
    const instrumentId = (estimate.intent as { instrumentId?: unknown }).instrumentId;
    if (typeof instrumentId === 'string' && instrumentId.length > 0) return instrumentId;
  }
  return null;
}

function offeringForEstimate(estimate: {
  mandateId?: unknown;
  offeringId?: unknown;
  instrumentId?: unknown;
  intent?: unknown;
}): InstrumentOffering | null {
  let offering: InstrumentOffering | null = null;
  if (typeof estimate.offeringId === 'string' && estimate.offeringId.length > 0) {
    offering = offeringForId(estimate.offeringId);
    if (!offering) return null;
  }
  const instrumentId = instrumentIdForEstimate(estimate);
  if (instrumentId) {
    const byInstrument = offeringForInstrument(instrumentId);
    if (!byInstrument || (offering && byInstrument.offeringId !== offering.offeringId)) return null;
    offering = byInstrument;
  }
  if (!offering) return null;
  if (typeof estimate.mandateId === 'string' && estimate.mandateId !== offering.mandateId) return null;
  return offering;
}

function runtimeSupportsOffering(runtime: DeskRuntime, offering: InstrumentOffering): boolean {
  return offering.deskIds.includes(runtime.deskId) && coverageForOffering(runtime, offering) !== null;
}

/** Resolve an estimate from explicit desk/mandate/offering context plus rail
 *  evidence. Without a desk id, resolution is allowed only when exactly one
 *  quote-capable desk covers that offering — same-rail desks must carry
 *  explicit desk context. */
export function deskRuntimeForEstimate(estimate: {
  deskId?: unknown;
  mandateId?: unknown;
  offeringId?: unknown;
  instrumentId?: unknown;
  intent?: unknown;
  network?: unknown;
  chainId?: unknown;
}): DeskRuntime | null {
  const rail = railForEstimate(estimate);
  const offering = offeringForEstimate(estimate);
  if (!rail || !offering || !railMatches([offering.rail], rail)) return null;
  if (typeof estimate.deskId === 'string' && estimate.deskId.length > 0) {
    const runtime = deskRuntimeFor(estimate.deskId);
    return runtime && runtimeSupportsOffering(runtime, offering) ? runtime : null;
  }
  const matches = Object.values(RUNTIME_BASE)
    .map(candidate => deskRuntimeFor(candidate.deskId))
    .filter((runtime): runtime is DeskRuntime => runtime !== null && runtimeSupportsOffering(runtime, offering));
  return matches.length === 1 ? matches[0] : null;
}

export type { DeskId };
