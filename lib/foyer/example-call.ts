/**
 * The example call — the foyer proof-before-the-ask (Foyer Line §4.3).
 *
 * The shape carries:
 *   - recordedAt: when the call happened. The "EXAMPLE CALL · recorded
 *     <date>" label renders from this.
 *   - source: which desk, which product family, the issuer. The slip
 *     carries the same three things the live slip would.
 *   - transcript: the caller's words and the broker's words. Captions are
 *     derived from this; the audio is the same data, played.
 *   - slip: the quote snapshot and the resulting record. Prices on the
 *     slip are from that call — labelled, never styled like tape marks.
 *
 * A recording is *accepted* when an accountable human (per the editorial
 * policy) has signed off on its accuracy. Until then, the foyer renders
 * the empty state — labels, no fake prices, no invented transcript.
 */

import type { EntryIntent } from '../house-entry';

export type ExampleCallSource = 'hetty' | 'jesse' | 'isabel' | 'halley';

export interface ExampleCallTurn {
  /** Who spoke. "caller" is the human; "broker" is the desk. */
  speaker: 'caller' | 'broker';
  /** The transcript of the turn. Plain text, no markup. */
  text: string;
}

export interface ExampleCallSlip {
  /** The instrument symbol (e.g. "AAPLx") — the same one the offer card carries. */
  symbol: string;
  /** The desk's quote asset (e.g. "USDC" or "USDG"). */
  quoteAsset: string;
  /** The amount the caller asked to spend (in quote asset). */
  amount: string;
  /** The fill size (in tokens) the venue returned. */
  fill: string;
  /** Source of the quote (e.g. "Jupiter", "Aerodrome", "Lighter"). */
  venue: string;
  /** When the quote landed, ms-since-epoch. */
  quotedAt: number;
  /** Quote expiry, ms-since-epoch. */
  expiresAt: number;
  /** The call's outcome: a paper file. */
  mode: 'paper';
}

export interface ExampleCall {
  /** A stable id; not used for routing, but useful for tests and analytics. */
  id: string;
  /** Which desk's call this is. */
  source: ExampleCallSource;
  /** When the call was recorded. The label "EXAMPLE CALL · recorded <date>"
   *  renders from this — never the present day. */
  recordedAt: number;
  /** The accountable human who accepted the recording (editorial policy). */
  reviewedBy: string;
  /** The transcript turns. Captions play in order; the audio is the same. */
  transcript: readonly ExampleCallTurn[];
  /** The slip the desk produced. Prices are from the call, labelled. */
  slip: ExampleCallSlip;
  /** The intent the caller spoke. Carried through the desks, the slip, and
   *  the eventual paper record. */
  intent: EntryIntent;
}

/**
 * The current state of the example-call slot in the foyer. A recording is
 * only *accepted* when an editor has signed off; until then the slot is
 * empty and the section shows the explanation card, not a fake.
 */
export type ExampleCallState =
  | { kind: 'accepted'; call: ExampleCall }
  | { kind: 'pending'; recordedAt: null; reviewedBy: null; reason: string }
  | { kind: 'rejected'; recordedAt: number; reviewedBy: string; reason: string };

/**
 * The current example-call state. As of the wedge-to-vision plan, no
 * recording has been accepted. The slot renders an honest "no accepted
 * recording yet" card with the criteria an accepted one will need.
 */
export const CURRENT_EXAMPLE_CALL: ExampleCallState = Object.freeze({
  kind: 'pending',
  recordedAt: null,
  reviewedBy: null,
  reason: 'No accepted recording yet. The criteria for acceptance: a real paper-filing event with a verifiable quote, reviewed by an accountable editor. Until then the slot renders the criteria, not a fake.',
}) satisfies ExampleCallState;

/**
 * The criteria an accepted recording will need to satisfy. Rendered in
 * the empty state so the visitor sees the bar, not a placeholder.
 */
export const EXAMPLE_CALL_CRITERIA: readonly string[] = Object.freeze([
  'A real paper-filing event with a verifiable venue quote and a slip that matches the record.',
  'Fact-checked biographical material if the broker’s namedFor is referenced.',
  'A short, captioned, ≤10s clip with the slip rendered beside it.',
  'An accountable reviewer who has signed off in editorial.',
  'A clear "EXAMPLE CALL · recorded <date>" label and a "prices from that call" caveat.',
  'No styled-as-live numbers and no animation that implies a live feed.',
]);

/** The label that always renders at the top of the section. */
export const EXAMPLE_CALL_LABEL = 'EXAMPLE CALL';

/** The contract an accepted call has to satisfy. Tests use this. */
export function isValidExampleCall(call: unknown): call is ExampleCall {
  if (typeof call !== 'object' || call === null) return false;
  const c = call as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.length === 0) return false;
  if (!['hetty', 'jesse', 'isabel', 'halley'].includes(c.source as string)) return false;
  if (typeof c.recordedAt !== 'number' || c.recordedAt <= 0) return false;
  if (typeof c.reviewedBy !== 'string' || c.reviewedBy.length === 0) return false;
  if (!Array.isArray(c.transcript) || c.transcript.length === 0) return false;
  for (const turn of c.transcript) {
    if (typeof turn !== 'object' || turn === null) return false;
    const t = turn as Record<string, unknown>;
    if (!['caller', 'broker'].includes(t.speaker as string)) return false;
    if (typeof t.text !== 'string' || t.text.length === 0) return false;
  }
  if (typeof c.slip !== 'object' || c.slip === null) return false;
  const slip = c.slip as Record<string, unknown>;
  if (slip.mode !== 'paper') return false;
  return true;
}