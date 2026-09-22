/**
 * House-level instrument offerings. An offering is the concrete product a user
 * can select: mandate + instrument + settlement rail + venue + eligible desks.
 * Similar exposure on another rail remains a separate offering, never a silent
 * substitution.
 */
import { canonicalInstrumentId, DESK_INSTRUMENTS, parseInstrumentId } from '../trading/catalog';
import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import type { DeskId, InstrumentOffering, RailRef } from './contracts';

const BASE_RAIL: RailRef = { kind: 'evm', network: 'eip155:8453', chainId: 8453 };
const SOLANA_RAIL: RailRef = { kind: 'solana', network: 'solana:mainnet' };

function productIdFor(underlyingSymbol: string): string {
  return `equity:${underlyingSymbol.toUpperCase()}`;
}

function offeringIdFor(mandateId: InstrumentOffering['mandateId'], instrumentId: string): string {
  return `${mandateId}:${instrumentId}`;
}

const BASE_OFFERINGS: readonly InstrumentOffering[] = DESK_INSTRUMENTS.map(stock => Object.freeze({
  offeringId: offeringIdFor('coinbase-tokenized-stocks', stock.id),
  productId: productIdFor(stock.underlyingSymbol),
  instrumentId: stock.id,
  symbol: stock.symbol,
  underlyingSymbol: stock.underlyingSymbol,
  name: stock.name,
  mandateId: 'coinbase-tokenized-stocks' as const,
  issuer: stock.issuer,
  rail: BASE_RAIL,
  venue: stock.venuePairs.find(pair => pair.quoteSymbol === 'USDC')?.venue ?? null,
  quoteAsset: 'USDC' as const,
  unitPolicy: { buy: 'USDC', sell: 'token' },
  deskIds: ['hetty' satisfies DeskId],
  quoteSupported: stock.quoteSupported,
  status: 'active' as const,
}));

const SOLANA_OFFERINGS: readonly InstrumentOffering[] = SOLANA_INSTRUMENTS.map(stock => Object.freeze({
  offeringId: offeringIdFor('backed-xstocks', stock.id),
  productId: productIdFor(stock.underlyingSymbol),
  instrumentId: stock.id,
  symbol: stock.symbol,
  underlyingSymbol: stock.underlyingSymbol,
  name: stock.name,
  mandateId: 'backed-xstocks' as const,
  issuer: stock.issuer,
  rail: SOLANA_RAIL,
  venue: 'jupiter',
  quoteAsset: 'USDC' as const,
  unitPolicy: { buy: 'USDC', sell: 'scaled-token' },
  deskIds: ['jesse' satisfies DeskId],
  quoteSupported: stock.quoteSupported,
  status: 'active' as const,
}));

export const INSTRUMENT_OFFERINGS: readonly InstrumentOffering[] = Object.freeze([
  ...BASE_OFFERINGS,
  ...SOLANA_OFFERINGS,
]);

const OFFERING_BY_ID = new Map(INSTRUMENT_OFFERINGS.map(offering => [offering.offeringId, offering]));
const OFFERING_BY_INSTRUMENT_ID = new Map(INSTRUMENT_OFFERINGS.map(offering => [offering.instrumentId, offering]));

/** Canonicalize only the id syntax; mint case remains intact. */
export function canonicalOfferingInstrumentId(id: string): string | null {
  const ref = parseInstrumentId(id);
  return ref ? canonicalInstrumentId(ref) : null;
}

export function offeringForId(id: string): InstrumentOffering | null {
  return OFFERING_BY_ID.get(id) ?? null;
}

export function offeringForInstrument(id: string): InstrumentOffering | null {
  const canonical = canonicalOfferingInstrumentId(id);
  return canonical ? OFFERING_BY_INSTRUMENT_ID.get(canonical) ?? null : null;
}

export function instructionInstrumentId(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const instrumentId = (input as { instrumentId?: unknown }).instrumentId;
    if (typeof instrumentId === 'string' && instrumentId.length > 0) return instrumentId;
  }
  return null;
}

export function offeringForInstruction(input: unknown): InstrumentOffering | null {
  const instrumentId = instructionInstrumentId(input);
  return instrumentId ? offeringForInstrument(instrumentId) : null;
}

export function offeringsForDesk(deskId: DeskId): readonly InstrumentOffering[] {
  return INSTRUMENT_OFFERINGS.filter(offering => offering.deskIds.includes(deskId));
}

export function offeringsForProduct(productId: string): readonly InstrumentOffering[] {
  return INSTRUMENT_OFFERINGS.filter(offering => offering.productId === productId);
}

export function offeringCoversDesk(offering: InstrumentOffering, deskId: DeskId): boolean {
  return offering.deskIds.includes(deskId);
}

export function eligibleDesksForOffering(offeringId: string): readonly DeskId[] {
  return offeringForId(offeringId)?.deskIds ?? [];
}
