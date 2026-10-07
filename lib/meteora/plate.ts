/**
 * What the launch desk's explainer plate needs to know about the draft:
 * which step the caller is on, what is still missing, and a worked example.
 * Pure functions, so the plate and its tests share one definition.
 */
import type { HalleyDraft, LaunchCurvePreset } from './contracts';

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

/** Short label for the ticket header, replacing an empty placeholder. */
export function stageLabel(stage: PlateStage): string {
  switch (stage) {
    case 'estimating': return 'PRICING';
    case 'review': return 'REVIEW';
    case 'saved': return 'FILED';
    default: return 'DRAFT';
  }
}
