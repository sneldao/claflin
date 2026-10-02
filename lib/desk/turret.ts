/**
 * The house turret — what the foyer heard, and which lines that lights.
 * Pure: reads the offering book, never picks a rail for the caller. Several
 * matching desks stay several; the caller chooses (docs/FOYER_LINE.md §4.1).
 */
import { getHouseDesk, HOUSE_DESKS, type HouseDeskId } from '../house';
import { instructionIssue } from '../trading/instruction-safety';
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
  | { kind: 'matched'; matches: readonly TurretMatch[] }
  | { kind: 'launch' }
  | { kind: 'unsupported'; issue: string };

/** idle = line open, nothing said yet · match = this line carries what was said · quiet = it does not. */
export type LineLamp = 'idle' | 'match' | 'quiet';

/**
 * Launch intent is a verb, not a ticker — the offering book holds instruments
 * that already exist, and a launch names one that does not. Explicit launch
 * words only (checked before the book so "launch an NVDA tracker" does not
 * light Jesse's NVDA line); anything vaguer fails quiet to the book.
 */
const LAUNCH_INTENT =
  /\b(launch(?:es|ed|ing)?|mints?|minting|issu\w+|new\s+tokens?|tracker\s+tokens?|bonding\s+curves?)\b/i;

/** Desks whose room takes launch instructions — the launch kind, still gated by openness. */
function launchDesks(deskIds: readonly HouseDeskId[]): readonly HouseDeskId[] {
  return deskIds.filter(id => getHouseDesk(id)?.kind === 'launch');
}

export function readInstruction(instruction: string): TurretReading {
  const issue = instructionIssue(instruction);
  if (issue) return { kind: 'unsupported', issue };
  if (instructionTerms(instruction).length === 0) return { kind: 'empty' };
  if (LAUNCH_INTENT.test(instruction)) return { kind: 'launch' };
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
  if (reading.kind === 'launch') return getHouseDesk(deskId)?.kind === 'launch' ? 'match' : 'quiet';
  if (reading.kind !== 'matched') return 'quiet';
  return reading.matches.some(match => match.deskIds.includes(deskId)) ? 'match' : 'quiet';
}

/** Desks with a lit lamp, in house order. */
export function litDesks(reading: TurretReading, deskIds: readonly HouseDeskId[]): readonly HouseDeskId[] {
  return deskIds.filter(id => lampFor(reading, id) === 'match');
}

/** How many offerings the house book found — the funnel's "offering resolved". Null when nothing was said. */
export function instructionMatch(reading: TurretReading): 'none' | 'one' | 'several' | null {
  if (reading.kind === 'empty') return null;
  if (reading.kind === 'launch') return 'one';
  if (reading.kind !== 'matched') return 'none';
  return reading.matches.length === 1 ? 'one' : 'several';
}

const MAX_NAMED_MATCHES = 3;

/**
 * The one sentence the turret says back. Null when there is nothing to say
 * (empty) or one line is lit — the lamp already says it.
 */
export function turretReply(reading: TurretReading, deskIds: readonly HouseDeskId[]): string | null {
  if (reading.kind === 'empty') return null;
  if (reading.kind === 'unsupported') return reading.issue;
  if (reading.kind === 'unmatched') {
    return `No line carries that yet. The house book covers ${reading.supported.join(', ')}.`;
  }
  if (reading.kind === 'launch') {
    const launch = launchDesks(deskIds)[0];
    if (!launch) return 'The launch desk is not open — no line carries launches yet.';
    const desk = getHouseDesk(launch);
    const line = HOUSE_DESKS.findIndex(d => d.id === launch) + 1;
    return `That is a launch, not a tape ask — LINE ${line} keeps the launch desk. ${desk?.shortName ?? 'The launch desk'} prices new instruments on a curve; the other lines trade what already exists.`;
  }
  const lit = litDesks(reading, deskIds);
  if (lit.length < 2) return null;
  if (reading.matches.length > MAX_NAMED_MATCHES) {
    return `${reading.matches.length} offerings match across ${lit.length} lines — the book below lists each one. Choose a product below.`;
  }
  const named = reading.matches
    .map(match => {
      const brokers = match.deskIds.map(id => getHouseDesk(id)?.shortName ?? id).join(' or ');
      return `${match.symbol} on ${match.rail} (${brokers})`;
    })
    .join(' · ');
  return `${lit.length === 2 ? 'Two' : lit.length} lines carry this, as separate products: ${named}. Choose a product below.`;
}
