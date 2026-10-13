import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { previewCurve, graduationPriceFor, graduationQuoteFor, PREVIEW_WEIGHTS } from '../lib/meteora/preview';
import { PRESET_WEIGHTS } from '../lib/meteora/dbc';

const OPEN = 227.1;
const SUPPLY = 1_000_000;
const QUOTE = 150_000;

describe('graduation price <-> quote', () => {
  it('is exact and round-trips', () => {
    const gradPrice = graduationPriceFor(OPEN, SUPPLY, QUOTE);
    assert.equal(gradPrice, OPEN + QUOTE / SUPPLY);
    assert.ok(Math.abs(graduationQuoteFor(OPEN, SUPPLY, gradPrice) - QUOTE) < 1e-6);
  });
  it('returns nothing useful for incomplete drafts, without throwing', () => {
    assert.equal(graduationQuoteFor(0, SUPPLY, 10), 0);
    assert.equal(graduationPriceFor(OPEN, 0, QUOTE), OPEN);
  });
});

describe('previewCurve', () => {
  it('mirrors the desk\'s real preset weights (edit PREVIEW_WEIGHTS to match)', () => {
    assert.deepEqual(PREVIEW_WEIGHTS, PRESET_WEIGHTS);
  });


  it('opens at the anchor and ends at the graduation price', () => {
    const pts = previewCurve({ openingPrice: OPEN, graduationQuote: QUOTE, supply: SUPPLY, preset: 'flat' });
    assert.ok(Math.abs(pts[0].price - OPEN) < 1e-9);
    assert.ok(Math.abs(pts[pts.length - 1].price - graduationPriceFor(OPEN, SUPPLY, QUOTE)) < 1e-6);
    assert.equal(pts[0].progress, 0);
    assert.equal(pts[pts.length - 1].progress, 1);
  });

  it('is monotone in price for every preset', () => {
    for (const preset of ['flat', 'long', 'exponential', 'equity-pair'] as const) {
      const pts = previewCurve({ openingPrice: OPEN, graduationQuote: QUOTE, supply: SUPPLY, preset });
      for (let i = 1; i < pts.length; i++) {
        assert.ok(pts[i].price >= pts[i - 1].price - 1e-9, `${preset} dipped at ${i}`);
      }
    }
  });

  it('front-loads liquidity where the preset says so', () => {
    const params = { openingPrice: OPEN, graduationQuote: QUOTE, supply: SUPPLY };
    const long = previewCurve({ ...params, preset: 'long' });
    const exponential = previewCurve({ ...params, preset: 'exponential' });
    const at = (pts: readonly { progress: number; price: number }[], u: number) =>
      pts.find(p => p.progress >= u)!;
    /* 'long' loads the early segments — at 25% fill it should have moved LESS
       than the tail-loaded 'exponential'. */
    assert.ok(at(long, 0.25).price - OPEN < at(exponential, 0.25).price - OPEN);
  });

  it('gives nothing for an incomplete draft', () => {
    assert.deepEqual(previewCurve({ openingPrice: 0, graduationQuote: QUOTE, supply: SUPPLY, preset: 'flat' }), []);
    assert.deepEqual(previewCurve({ openingPrice: OPEN, graduationQuote: QUOTE, supply: 0, preset: 'flat' }), []);
  });
});
