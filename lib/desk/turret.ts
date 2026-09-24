/**
 * The house turret — what the foyer heard, and which lines that lights.
 * Pure: reads the offering book, never picks a rail for the caller. Several
 * matching desks stay several; the caller chooses (docs/FOYER_LINE.md §4.1).
 */
import { getHouseDesk, type HouseDeskId } from '../house';
import {
  instructionTerms,
  offeringGroupsForInstruction,
  offeringProductGroups,
  openDesksForOffering,
  railLabel,
} from './offerings-presentation';

export interface TurretMatch {
  offeringId: string;
  symbol: string;
  rail: string;
  deskIds: readonly HouseDeskId[];
}

export type TurretReading =
  | { kind: 'empty' }
  | { kind: 'unmatched'; supported: readonly string[] }
  | { kind: 'matched'; matches: readonly TurretMatch[] };

/** idle = line open, nothing said yet · match = this line carries what was said · quiet = it does not. */
export type LineLamp = 'idle' | 'match' | 'quiet';

export function readInstruction(instruction: string): TurretReading {
  if (instructionTerms(instruction).length === 0) return { kind: 'empty' };
  const groups = offeringGroupsForInstruction(instruction);
  if (groups.length === 0) {
    return { kind: 'unmatched', supported: offeringProductGroups().map(group => group.underlyingSymbol) };
  }
  const matches = groups.flatMap(group => group.offerings.map(offering => ({
    offeringId: offering.offeringId,
    symbol: offering.symbol,
    rail: railLabel(offering.rail),
    deskIds: openDesksForOffering(offering).map(desk => desk.id),
  })));
  return { kind: 'matched', matches };
}

export function lampFor(reading: TurretReading, deskId: HouseDeskId): LineLamp {
  if (reading.kind === 'empty') return 'idle';
  if (reading.kind === 'unmatched') return 'quiet';
  return reading.matches.some(match => match.deskIds.includes(deskId)) ? 'match' : 'quiet';
}

/** Desks with a lit lamp, in house order. */
export function litDesks(reading: TurretReading, deskIds: readonly HouseDeskId[]): readonly HouseDeskId[] {
  return deskIds.filter(id => lampFor(reading, id) === 'match');
}

const MAX_NAMED_MATCHES = 3;

/**
 * The one sentence the turret says back. Null when there is nothing to say
 * (empty) or one line is lit — the lamp already says it.
 */
export function turretReply(reading: TurretReading, deskIds: readonly HouseDeskId[]): string | null {
  if (reading.kind === 'empty') return null;
  if (reading.kind === 'unmatched') {
    return `No line carries that yet. The house book covers ${reading.supported.join(', ')}.`;
  }
  const lit = litDesks(reading, deskIds);
  if (lit.length < 2) return null;
  if (reading.matches.length > MAX_NAMED_MATCHES) {
    return `${reading.matches.length} offerings match across ${lit.length} lines — the book below lists each one. Pick a line.`;
  }
  const named = reading.matches
    .map(match => {
      const brokers = match.deskIds.map(id => getHouseDesk(id)?.shortName ?? id).join(' or ');
      return `${match.symbol} on ${match.rail} (${brokers})`;
    })
    .join(' · ');
  return `Two lines carry this, as separate products: ${named}. Pick a line.`;
}
