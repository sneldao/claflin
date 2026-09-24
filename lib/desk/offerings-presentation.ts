/**
 * Presentation helpers for the public offering book. These functions group the
 * concrete product/rail/venue catalog for the foyer without creating a second,
 * UI-specific catalog or turning the homepage into a network picker.
 */
import { DESK_CAPABILITIES, getHouseDesk, isOpenDesk, type HouseDesk, type HouseDeskId } from '../house';
import { MARKET_MANDATES, coverageForOffering, deskRuntimeFor } from './registry';
import type { InstrumentOffering, RailRef } from './contracts';
import { INSTRUMENT_OFFERINGS } from './offerings';

export interface OfferingProductGroup {
  productId: string;
  underlyingSymbol: string;
  offerings: readonly InstrumentOffering[];
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'buy', 'for', 'get', 'in', 'of', 'on', 'please', 'quote',
  'sell', 'share', 'shares', 'stock', 'the', 'to', 'token', 'tokens', 'usdc',
  'with',
]);

export function railLabel(rail: RailRef): string {
  if (rail.kind === 'solana') return 'Solana';
  if (rail.chainId === 8453) return 'Base';
  if (rail.chainId === 4663) return 'Robinhood Chain';
  if (rail.chainId === 42161) return 'Arbitrum';
  return `EVM ${rail.chainId}`;
}

export function venueLabel(venue: string | null): string {
  if (!venue) return 'No verified venue';
  return venue.charAt(0).toUpperCase() + venue.slice(1);
}

export function mandateLabel(offering: InstrumentOffering): string {
  return MARKET_MANDATES[offering.mandateId]?.label ?? offering.mandateId;
}

/** Desks the visitor may actually open for this offering right now. */
export function openDesksForOffering(offering: InstrumentOffering): readonly HouseDesk[] {
  return offering.deskIds
    .map(id => getHouseDesk(id))
    .filter((desk): desk is HouseDesk => Boolean(desk))
    .filter(desk => {
      if (!isOpenDesk(desk.id)) return false;
      const runtime = deskRuntimeFor(desk.id);
      return runtime ? coverageForOffering(runtime, offering) !== null : false;
    });
}

export function offeringCapabilityText(offering: InstrumentOffering, deskIds: readonly string[]): string {
  if (!offering.quoteSupported) return 'Quote coverage pending';
  const live = deskIds.some(id => {
    const desk = getHouseDesk(id);
    return desk ? DESK_CAPABILITIES[desk.id].live : false;
  });
  return live ? 'Paper estimate · live settle available' : 'Paper estimate';
}

function searchText(group: OfferingProductGroup): string {
  return [
    group.productId,
    group.underlyingSymbol,
    ...group.offerings.flatMap(offering => [
      offering.symbol,
      offering.name,
      offering.issuer ?? '',
      mandateLabel(offering),
      railLabel(offering.rail),
      venueLabel(offering.venue),
    ]),
  ].join(' ').toLowerCase();
}

/** Group active, quote-capable offerings by their comparable underlying exposure. */
export function offeringProductGroups(): readonly OfferingProductGroup[] {
  const groups = new Map<string, InstrumentOffering[]>();
  for (const offering of INSTRUMENT_OFFERINGS) {
    if (offering.status !== 'active' || !offering.quoteSupported || openDesksForOffering(offering).length === 0) continue;
    const existing = groups.get(offering.productId) ?? [];
    groups.set(offering.productId, [...existing, offering]);
  }
  return [...groups.entries()]
    .map(([productId, offerings]) => Object.freeze({
      productId,
      underlyingSymbol: offerings[0].underlyingSymbol,
      offerings: Object.freeze(offerings),
    }))
    .sort((a, b) => a.underlyingSymbol.localeCompare(b.underlyingSymbol));
}

/**
 * The one offering a desk can carry for this sentence.
 * Two matches stay unresolved — the house book shows both, and the ring does not guess.
 */
export function soleOfferingForDesk(instruction: string, deskId: HouseDeskId): string | null {
  const trimmed = instruction.trim();
  if (!trimmed) return null;
  const ids: string[] = [];
  for (const group of offeringGroupsForInstruction(trimmed)) {
    for (const offering of group.offerings) {
      if (openDesksForOffering(offering).some(desk => desk.id === deskId)) ids.push(offering.offeringId);
    }
  }
  return ids.length === 1 ? ids[0] : null;
}

export function offeringGroupsForInstruction(instruction: string): readonly OfferingProductGroup[] {
  const groups = offeringProductGroups();
  const terms = instruction
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(term => term.length > 0 && !SEARCH_STOP_WORDS.has(term) && !/^\d/.test(term));
  if (terms.length === 0) return groups;
  const exact = groups.filter(group => {
    const haystack = searchText(group);
    return terms.every(term => haystack.includes(term));
  });
  if (exact.length > 0) return exact;
  return groups.filter(group => {
    const haystack = searchText(group);
    return terms.some(term => haystack.includes(term));
  });
}
