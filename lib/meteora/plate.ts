/**
 * What the launch desk's explainer plate needs to know about the draft:
 * which step the caller is on, what is still missing, and a worked example.
 * Pure functions, so the plate and its tests share one definition.
 */
import type { HalleyDraft, LaunchCurvePreset } from './contracts';
import { HALLEY_QUOTE_MINTS } from './catalog';

export type PlateStage = 'draft' | 'estimating' | 'review' | 'saved';

export const LAUNCH_STEPS = [
  { title: 'Name it and anchor it', detail: 'Pick a tracker name and symbol, then the equity its price starts from.' },
  { title: 'Shape the curve', detail: 'Choose what buyers pay with, the curve, the supply and the graduation line.' },
  { title: 'See the launch', detail: 'Review the projected curve, then file it as paper.' },
] as const;

/** 1-based step in progress, or 'done' once a paper launch is filed. */
export function launchStep(stage: PlateStage, draft: HalleyDraft): 1 | 2 | 3 | 'done' {
  if (stage === 'saved') return 'done';
  if (stage === 'estimating' || stage === 'review') return 3;
  if (!draft.name?.trim() || !draft.symbol) return 1;
  return missingLaunchFields(draft).length > 0 ? 2 : 3;
}

/** Required fields the draft still lacks, in form order. */
export function missingLaunchFields(draft: HalleyDraft): string[] {
  const missing: string[] = [];
  if (!draft.name?.trim()) missing.push('tracker name');
  if (!draft.symbol) missing.push('symbol');
  if (!draft.quoteSymbol) missing.push('quote asset');
  if (!draft.supply) missing.push('supply');
  if (!draft.graduationQuote) missing.push('graduation line');
  return missing;
}

export function isBlankDraft(draft: HalleyDraft): boolean {
  return Object.values(draft).every(value => value === null || value === '');
}

/** Miniature liquidity-weight profiles drawn inside the curve chips — the
    same 16-segment weights buildLaunchConfig sends to the SDK (kept in
    step with PRESET_WEIGHTS by tests/halley-plate.test.ts). */
export const CURVE_WEIGHT_SHAPES: Record<LaunchCurvePreset, readonly number[]> = {
  flat: Array(16).fill(1),
  'equity-pair': Array(16).fill(1),
  long: [4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  exponential: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4],
};

/** Plain-language reading of each curve preset, shown beside the chips. */
export const CURVE_HINTS: Record<LaunchCurvePreset, string> = {
  'equity-pair': 'Even liquidity weights; an xStock quote expresses the opening price as an equity ratio when both marks are observed.',
  flat: 'Even liquidity weights across the curve. Flat does not mean a fixed price.',
  long: 'More liquidity weight in the early segments, intended to slow early price movement.',
  exponential: 'More liquidity weight in the later segments. Review the estimate for the projected price path.',
};

/** A complete, valid draft the caller can load and then change. */
export const HALLEY_EXAMPLE: HalleyDraft = Object.freeze({
  name: 'NVDA tracker',
  symbol: 'NVDAT',
  anchorSymbol: 'NVDA',
  quoteSymbol: 'USDC',
  curve: 'equity-pair',
  supply: '1000000',
  graduationQuote: '150',
});

/** The house's suggested economics — pencilled in the moment a quote is
    chosen, so a caller only has to decide what they understand (name,
    quote) and can draw the curve straight away. Every value stays editable
    and the estimate discloses all of them before anything is filed or signed.
    Graduation is in quote units, so it is quote-aware: about $150–250 of
    collection either way (150 USDC, or one xStock share). */
export const HOUSE_SUPPLY = '1000000';
export function houseGraduation(quoteSymbol: string | null): string | null {
  if (!quoteSymbol) return null;
  return quoteSymbol === 'USDC' ? '150' : '1';
}

/** Launch size presets at the working depth — turns bonding curve figures
    into clear human choices (Small / Standard / Large). */
export type LaunchSizePreset = 'small' | 'standard' | 'large';
export const LAUNCH_SIZE_PRESETS: readonly LaunchSizePreset[] = Object.freeze(['small', 'standard', 'large']);

export interface LaunchSizeSpec {
  label: string;
  supply: string;
  graduationQuote: (quoteSymbol: string | null) => string;
  summary: string;
}

export const LAUNCH_SIZE_SPECS: Record<LaunchSizePreset, LaunchSizeSpec> = {
  small: {
    label: 'Small',
    supply: '100000',
    graduationQuote: (quote: string | null) => (quote === 'USDC' ? '50' : '0.5'),
    summary: '100k supply · 50 USDC ($50 collected)',
  },
  standard: {
    label: 'Standard',
    supply: HOUSE_SUPPLY,
    graduationQuote: (quote: string | null) => houseGraduation(quote) ?? '150',
    summary: '1M supply · 150 USDC ($150–250 collected)',
  },
  large: {
    label: 'Large',
    supply: '1000000000',
    graduationQuote: (quote: string | null) => (quote === 'USDC' ? '5000' : '25'),
    summary: '1B supply · 5,000 USDC ($5k collected)',
  },
};

/** Match the draft against the launch size presets. */
export function matchingLaunchSizePreset(draft: HalleyDraft): LaunchSizePreset | null {
  if (!draft.supply) return null;
  for (const preset of LAUNCH_SIZE_PRESETS) {
    const spec = LAUNCH_SIZE_SPECS[preset];
    if (draft.supply === spec.supply && draft.graduationQuote === spec.graduationQuote(draft.quoteSymbol)) {
      return preset;
    }
  }
  return null;
}

/** Underlying equity of an xStock quote ('NVDAx' → 'NVDA'), else null. */
function xStockUnderlying(quoteSymbol: string | null): string | null {
  return HALLEY_QUOTE_MINTS.find(q => q.symbol === quoteSymbol)?.underlyingSymbol ?? null;
}

/** Which hand wrote a value onto the slip. `house` is a pencilled suggestion
    the caller has not adopted; `caller` is theirs — typed, said, or chosen by
    tapping. The distinction is the only reason the desk can propose numbers
    without ever overwriting one. */
export type DraftOrigin = 'house' | 'caller';

/** Per-field ownership. A field absent from the map has never been written,
    which is how "no anchor yet" stays distinct from a declined anchor. */
export type DraftPencil = Partial<Record<keyof HalleyDraft, DraftOrigin>>;

/** Did the caller settle this field themselves? Absent means the house's. */
export function isCallerOwned(pencil: DraftPencil, field: keyof HalleyDraft): boolean {
  return pencil[field] === 'caller';
}

/**
 * Fold a caller edit into the draft, then let the house pencil what is still
 * unanswered. The house only ever touches fields the caller does not own:
 *
 *  - supply: filled when empty;
 *  - graduation: filled when empty, or re-scaled when the value on the slip is
 *    still the *house's* figure for the old quote (150 USDC must never silently
 *    become 150 NVDAx — but a caller's own 150 is theirs and stays);
 *  - anchor: an xStock quote anchors to its own equity when no anchor was ever
 *    written. A caller who declined one — `anchorSymbol: null` with the field
 *    marked theirs — keeps that decision, which is what stops "no anchor"
 *    quietly turning back into an anchor.
 *
 * Values are only re-pencilled when the quote itself changes, so a field the
 * caller clears stays cleared until they choose a different quote.
 */
export function applyDraftEdit(
  before: HalleyDraft,
  pencil: DraftPencil,
  partial: Partial<HalleyDraft>,
): { draft: HalleyDraft; pencil: DraftPencil } {
  const draft: HalleyDraft = { ...before, ...partial };
  const next: DraftPencil = { ...pencil };
  /* Whatever the caller wrote — including a deliberate null — is theirs. */
  for (const field of Object.keys(partial) as (keyof HalleyDraft)[]) {
    next[field] = 'caller';
  }

  const quoteChanged = !!draft.quoteSymbol && draft.quoteSymbol !== before.quoteSymbol;
  if (!quoteChanged) return { draft, pencil: next };

  if (!draft.supply) {
    draft.supply = HOUSE_SUPPLY;
    next.supply = 'house';
  }
  /* Re-scale only the house's own figure, and only off the old quote. */
  const carriedHouseFigure = pencil.graduationQuote === 'house'
    && draft.graduationQuote === houseGraduation(before.quoteSymbol);
  if (!draft.graduationQuote || carriedHouseFigure) {
    draft.graduationQuote = houseGraduation(draft.quoteSymbol);
    next.graduationQuote = 'house';
  }
  const underlying = xStockUnderlying(draft.quoteSymbol);
  if (underlying && draft.anchorSymbol === null && !isCallerOwned(pencil, 'anchorSymbol')) {
    draft.anchorSymbol = underlying;
    next.anchorSymbol = 'house';
  }
  return { draft, pencil: next };
}

/** True when both economics figures are still the house's suggestions. */
export function usesHouseEconomics(draft: HalleyDraft, pencil: DraftPencil): boolean {
  return pencil.supply === 'house' && pencil.graduationQuote === 'house';
}

/** Which slip section owns each field. The slip follows the conversation by
    opening the section belonging to whatever was written last, so a spoken
    change to the graduation line is answered by the economics fold opening. */
export const SECTION_FOR_FIELD: Record<keyof HalleyDraft, string> = {
  name: 'halley-step-1',
  symbol: 'halley-step-1',
  anchorSymbol: 'halley-step-2',
  quoteSymbol: 'halley-step-3',
  curve: 'halley-step-3',
  supply: 'halley-step-3',
  graduationQuote: 'halley-step-3',
};

/** Short label for the ticket header, replacing an empty placeholder. */
export function stageLabel(stage: PlateStage): string {
  switch (stage) {
    case 'estimating': return 'PRICING';
    case 'review': return 'REVIEW';
    case 'saved': return 'FILED';
    default: return 'DRAFT';
  }
}
