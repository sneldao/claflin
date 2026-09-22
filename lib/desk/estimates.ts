/** Rail-neutral estimate helpers. Registered rail estimate types stay in their
 *  own modules; shared code uses these structural boundaries instead of
 *  importing Solana or EVM contracts. */
import type { QuoteEstimate } from '../trading/domain';
import type { DeskEstimateEnvelope, RailRef } from './contracts';
import { coverageForOffering, deskRuntimeForEstimate, railMatches } from './registry';
import { offeringCoversDesk, offeringForInstrument } from './offerings';
import type { HouseDeskId } from '../house';

export type SolanaEstimate = Extract<QuoteEstimate, { network: 'solana:mainnet' }>;

export function isSolanaEstimate(quote: QuoteEstimate): quote is SolanaEstimate {
  return (quote as { network?: unknown }).network === 'solana:mainnet';
}

export function estimateRail(quote: QuoteEstimate): RailRef | null {
  if (isSolanaEstimate(quote)) return { kind: 'solana', network: quote.network };
  const chainId = (quote as { chainId?: unknown }).chainId;
  if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0) {
    return { kind: 'evm', network: `eip155:${chainId}`, chainId };
  }
  return null;
}

export function estimateDeskId(quote: QuoteEstimate): HouseDeskId | null {
  const runtime = deskRuntimeForEstimate(quote);
  return runtime ? runtime.deskId as HouseDeskId : null;
}

/** Present any registered estimate as one house envelope while preserving the
 *  original rail payload as evidence. Desk, mandate, offering, instrument, rail,
 *  and venue claims are all validated — never copied blindly from input. */
export function estimateEnvelope(quote: QuoteEstimate): DeskEstimateEnvelope | null {
  const rail = estimateRail(quote);
  const runtime = deskRuntimeForEstimate(quote);
  const offering = offeringForInstrument(quote.intent.instrumentId);
  if (!rail || !runtime || !offering) return null;
  if (!offeringCoversDesk(offering, runtime.deskId)) return null;
  if (!railMatches([offering.rail], rail)) return null;
  if (!coverageForOffering(runtime, offering)) return null;
  return {
    id: quote.id,
    kind: 'estimate',
    mode: 'paper',
    deskId: runtime.deskId,
    mandateId: offering.mandateId,
    offeringId: offering.offeringId,
    instrumentId: offering.instrumentId,
    rail,
    venue: quote.venue,
    intent: quote.intent,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
    assumptions: quote.assumptions,
    evidence: quote,
  };
}

/** Attach explicit house context to a freshly generated rail estimate without
 *  rewriting the evidence payload. Legacy estimates without these fields remain
 *  valid; foreign or uncatalogued payloads are returned untouched. */
export function withEstimateContext(quote: QuoteEstimate): QuoteEstimate {
  const envelope = estimateEnvelope(quote);
  if (!envelope) return quote;
  return {
    ...quote,
    deskId: envelope.deskId,
    mandateId: envelope.mandateId,
    offeringId: envelope.offeringId,
    instrumentId: envelope.instrumentId,
  } as QuoteEstimate;
}
