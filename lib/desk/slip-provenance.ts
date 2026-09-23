/**
 * Slip provenance — where each value on a written slip came from, shared by
 * every desk. The desk only shows words that are true of what it observed:
 * a value that was said gets quoted back, a value the parser carried gets
 * labelled kept, a value the parser assumed is flagged as such. Pure module;
 * the React state lives in each desk surface.
 */

export type SlipField = 'instrument' | 'side' | 'amount';

export type SlipSource =
  | { kind: 'said'; phrase: string; excerpt: string }
  | { kind: 'kept' }
  | { kind: 'inferred' }
  | { kind: 'line'; lastCaller: string | null }
  | { kind: 'hand' }
  | { kind: 'carried' };

export type SlipMark = SlipSource & { value: string };
export type SlipProvenance = Partial<Record<SlipField, SlipMark>>;

/** The three slip fields, in any desk's draft shape. */
export interface SlipFieldsLike {
  instrumentId?: string | null;
  side?: string | null;
  amount?: string | null;
}

const FIELDS: readonly SlipField[] = ['instrument', 'side', 'amount'];

/**
 * Provenance for one parsed phrase. said when the parser matched literal
 * words for the field, kept when the value is unchanged from the prior slip,
 * inferred when the parser supplied a value the caller did not say.
 */
export function provenanceFromFields(input: {
  phrase: string;
  values: { instrument: string | null; side: string | null; amount: string | null };
  spans?: { instrument?: string; side?: string; amount?: string };
  prior: { instrument: string | null; side: string | null; amount: string | null };
}): SlipProvenance {
  const out: SlipProvenance = {};
  for (const field of FIELDS) {
    const value = input.values[field];
    if (value === null) continue;
    const excerpt = input.spans?.[field];
    if (excerpt) out[field] = { kind: 'said', phrase: input.phrase, excerpt, value };
    else if (input.prior[field] === value) out[field] = { kind: 'kept', value };
    else out[field] = { kind: 'inferred', value };
  }
  return out;
}

export type SlipSpans = { instrument?: string; side?: string; amount?: string };

const normalizeWords = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A "said" mark must quote the client's actual words. When a transcript was
 * cleaned up by a rewrite, keep a span only if it still occurs verbatim in
 * the raw transcript; a span that only exists in the rewrite is dropped, so
 * the field falls back to kept/inferred instead of quoting words never said.
 * With no verbatim to check against, spans pass through unchanged.
 */
export function spansInVerbatim(spans: SlipSpans | undefined, verbatim: string | null | undefined): SlipSpans | undefined {
  if (!spans || !verbatim) return spans;
  const haystack = normalizeWords(verbatim);
  const out: SlipSpans = {};
  for (const field of FIELDS) {
    const span = spans[field];
    if (span && haystack.includes(normalizeWords(span))) out[field] = span;
  }
  return out;
}

/**
 * The honesty gate: a mark only renders while the slip still holds the value
 * it was recorded for. A cleared or corrected field drops its mark silently.
 */
export function markFor(prov: SlipProvenance, field: SlipField, currentValue: string | null): SlipMark | null {
  const mark = prov[field];
  if (!mark || currentValue === null || mark.value !== currentValue) return null;
  return mark;
}

export function mergeProvenance(prev: SlipProvenance, next: SlipProvenance): SlipProvenance {
  return { ...prev, ...next };
}

/**
 * Marks for a hand edit — only the field the client actually touched.
 * Incidentally-set fields (a side carried along by an amount edit) get no
 * mark, so they render nothing. 'units' edits are side edits.
 */
export function handMarks(
  partial: SlipFieldsLike,
  field: 'instrument' | 'side' | 'amount' | 'units',
): SlipProvenance {
  const slipField: SlipField = field === 'units' ? 'side' : field;
  const value = slipField === 'instrument' ? partial.instrumentId
    : slipField === 'side' ? partial.side
    : partial.amount;
  if (!value) return {};
  return { [slipField]: { kind: 'hand', value } };
}

/** Marks for a foyer/URL carried instruction. */
export function carriedMarks(partial: SlipFieldsLike): SlipProvenance {
  const out: SlipProvenance = {};
  if (partial.instrumentId) out.instrument = { kind: 'carried', value: partial.instrumentId };
  if (partial.side) out.side = { kind: 'carried', value: partial.side };
  if (partial.amount) out.amount = { kind: 'carried', value: partial.amount };
  return out;
}
