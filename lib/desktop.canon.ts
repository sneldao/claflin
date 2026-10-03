/**
 * Desk canon — the single source for desk product identity (name, role,
 * market, kind, one-line). Every component and doc that names a desk should
 * import from here, never hard-code the strings.
 *
 * Naming rules:
 *  - `shortName` is the foyer/header name (e.g. "Halley").
 *  - `name` is the full character name (e.g. "Edmond Halley").
 *  - `role` is the *product* role — what the desk is for. It must never say
 *    "Meteora desk" or "Solana desk"; the venue is the venue, the desk is
 *    the relationship.
 *  - `market` is the rail/venue the desk operates on (e.g. "Solana").
 *  - `venue` is the specific venue family within that market, when relevant
 *    (e.g. "Meteora DBC") — the desk still owns the work; the venue is
 *    where the work settles.
 *  - `kind` distinguishes `tape` (price/size/file existing instruments)
 *    from `launch` (create the instrument). Read by the foyer, turret, and
 *    board to keep launch desks structurally apart from tape desks.
 *  - `status` is `paper` if quotation + paper filing are real, `planned`
 *    otherwise. Live is a separate capability in `lib/house.ts`.
 *
 * This module never carries trading capability. That lives in
 * `DESK_CAPABILITIES` (lib/house.ts) where the live env flags are
 * single-sourced.
 */

export type DeskKind = 'tape' | 'launch';
export type DeskStatus = 'paper' | 'planned';

export interface DeskCanon {
  readonly id: 'hetty' | 'jesse' | 'isabel' | 'halley' | 'arbitrum';
  readonly name: string;
  readonly shortName: string;
  readonly market: string;
  readonly venue: string | null;
  readonly approach: string;
  readonly access: string;
  readonly capability: string;
  readonly role: string;
  readonly kind: DeskKind;
  readonly status: DeskStatus;
}

/**
 * The canonical desk identity. Where this disagrees with `lib/house.ts`
 * `HOUSE_DESKS`, this file wins for *product copy* (the strings a user
 * reads); `HOUSE_DESKS` remains authoritative for capability derivation.
 */
export const DESK_CANON: ReadonlyArray<DeskCanon> = Object.freeze([
  Object.freeze({
    id: 'hetty',
    name: 'Hetty Green',
    shortName: 'Hetty',
    market: 'Base',
    venue: 'Aerodrome',
    approach: 'Independent judgment. Capital preservation. Deliberate decisions.',
    access: 'Tokenized stocks on Base · paper',
    capability: 'Talk or type a buy. Get a Base estimate. File a paper record.',
    role: 'Base tape desk — quotes and files Coinbase tokenized stocks.',
    kind: 'tape',
    status: 'paper',
  }),
  Object.freeze({
    id: 'jesse',
    name: 'Jesse Livermore',
    shortName: 'Jesse',
    market: 'Solana',
    venue: 'Jupiter',
    approach: 'Price action, timing, and disciplined speculation.',
    access: 'Backed xStocks on Solana · paper or live',
    capability: 'Talk or type a buy. Get a Jupiter estimate. Paper or settle live.',
    role: 'Solana tape desk — quotes and files Backed xStocks via Jupiter.',
    kind: 'tape',
    status: 'paper',
  }),
  Object.freeze({
    id: 'isabel',
    name: 'Isabel Benham',
    shortName: 'Isabel',
    market: 'Robinhood Chain',
    venue: 'Lighter',
    approach: 'Fundamental analysis and patient investigation.',
    access: 'Robinhood Stock Tokens on Robinhood Chain · paper',
    capability: 'Pick a stock token, size it in USDG. Get a Lighter estimate with issuer, onchain, and venue marks side by side. File a paper record.',
    role: 'Robinhood Chain tape desk — quotes and files Robinhood Stock Tokens via Lighter.',
    kind: 'tape',
    status: 'paper',
  }),
  Object.freeze({
    id: 'halley',
    name: 'Edmond Halley',
    shortName: 'Halley',
    market: 'Solana',
    venue: 'Meteora DBC',
    approach: 'Prices what has never traded — anchors a new name to a known one, then lets the tape decide.',
    access: 'Meteora DBC launches · paper',
    capability: 'Say a launch. See the curve, the anchor mark, and the graduation line. File a paper launch.',
    role: 'Solana launch desk — drafts and files paper launches for new tracker tokens via Meteora DBC.',
    kind: 'launch',
    status: 'paper',
  }),
  Object.freeze({
    id: 'arbitrum',
    name: 'Jay Cooke',
    shortName: 'Jay',
    market: 'Arbitrum',
    venue: null,
    approach: 'Building the rails that let everyone else move money.',
    access: 'Planned — not open yet',
    capability: 'Coming later.',
    role: 'Arbitrum tape desk — planned, not yet open.',
    kind: 'tape',
    status: 'planned',
  }),
]);

export type DeskId = DeskCanon['id'];

/** Lookup by id. Returns undefined for unknown ids (not throws). */
export function getDeskCanon(id: string): DeskCanon | undefined {
  return DESK_CANON.find(desk => desk.id === id);
}

/** Strict lookup; throws when missing so callers can assert in tests. */
export function requireDeskCanon(id: DeskId): DeskCanon {
  const canon = getDeskCanon(id);
  if (!canon) throw new Error(`Unknown desk id: ${id}`);
  return canon;
}

/**
 * The descriptor a copy writer or voice prompt should use. Pair of short +
 * full name + role. Never includes the rail as a strategy ("Solana desk" is
 * not a strategy; "the launch desk" or "the Base tape desk" is).
 */
export function deskDescriptor(id: DeskId): string {
  const desk = requireDeskCanon(id);
  return `${desk.shortName} — ${desk.role}`;
}

/**
 * The line a card carries. Order: identity + market + role, never
 * "Meteora desk" / "Solana desk". Halley in particular is *not* a "Meteora
 * desk"; he is the launch desk whose venue on Solana is Meteora DBC.
 */
export function deskCardLine(id: DeskId): string {
  const desk = requireDeskCanon(id);
  const venue = desk.venue ? ` · venue: ${desk.venue}` : '';
  return `${desk.shortName} · ${desk.market}${venue} · ${desk.kind === 'launch' ? 'Launch desk' : 'Tape desk'}`;
}