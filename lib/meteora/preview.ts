/**
 * Halley's draft-time curve sketch — a cheap, pure preview of the projected
 * path while the caller shapes the launch. It is NOT the desk's projection:
 * the verified path comes back from the estimate at review. The sketch keeps
 * the two facts the drag needs: price rises with capital collected, and moves
 * slower where the preset puts more liquidity.
 *
 * Shape model: equal-width segments, segment liquidity ∝ the preset's weight,
 * and for a constant-product curve the sqrt-price advances inversely to
 * liquidity per unit filled — the same mechanism the DBC config uses.
 */

import type { LaunchCurvePreset } from './contracts';

/* Kept in sync with dbc.PRESET_WEIGHTS by tests/preview.test.ts — copied so
   the draft-time sketch never drags the Meteora SDK into the client chunk. */
export const PREVIEW_WEIGHTS: Record<LaunchCurvePreset, number[]> = {
  flat: Array(16).fill(1),
  'equity-pair': Array(16).fill(1),
  long: [4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  exponential: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4],
};

export interface PreviewPoint {
  progress: number;
  price: number;
}

/** Exact for this desk's units: price moves per quote raised by 1/supply. */
export function graduationPriceFor(openingPrice: number, supply: number, graduationQuote: number): number {
  if (!(openingPrice > 0) || !(supply > 0)) return openingPrice;
  return openingPrice + graduationQuote / supply;
}

export function graduationQuoteFor(openingPrice: number, supply: number, graduationPrice: number): number {
  if (!(openingPrice > 0) || !(supply > 0)) return 0;
  return Math.max(0, (graduationPrice - openingPrice) * supply);
}

export function previewCurve(params: {
  openingPrice: number;
  graduationQuote: number;
  supply: number;
  preset: LaunchCurvePreset;
  samples?: number;
}): readonly PreviewPoint[] {
  const { openingPrice, graduationQuote, supply, preset } = params;
  const samples = params.samples ?? 25;
  if (!(openingPrice > 0) || !(supply > 0)) return [];

  const weights = PREVIEW_WEIGHTS[preset];
  const graduationPrice = graduationPriceFor(openingPrice, supply, graduationQuote);
  const sqrtOpen = Math.sqrt(openingPrice);
  const sqrtGrad = Math.sqrt(graduationPrice);

  const inverse = weights.map(w => 1 / w);
  const total = inverse.reduce((a, b) => a + b, 0);
  const cumulative: number[] = [0];
  for (let i = 0; i < inverse.length; i++) cumulative.push(cumulative[i] + inverse[i] / total);

  const points: PreviewPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const scaled = u * weights.length;
    const whole = Math.min(weights.length - 1, Math.floor(scaled));
    const frac = Math.min(1, scaled - whole);
    const advance = cumulative[whole] + frac * (cumulative[whole + 1] - cumulative[whole]);
    const sqrtP = sqrtOpen + (sqrtGrad - sqrtOpen) * Math.min(1, advance);
    points.push({ progress: u, price: sqrtP * sqrtP });
  }
  return points;
}
