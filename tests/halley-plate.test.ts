import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isHalleyLaunchIntent, type HalleyDraft } from '../lib/meteora/contracts';
import { CURVE_HINTS, CURVE_WEIGHT_SHAPES, HALLEY_EXAMPLE, isBlankDraft, launchStep, missingLaunchFields, stageLabel } from '../lib/meteora/plate';
import { PRESET_WEIGHTS } from '../lib/meteora/dbc';
import { LAUNCH_CURVE_PRESETS } from '../lib/meteora/contracts';

const blank: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};

describe('Halley first-use guidance', () => {
  it('keeps the surface syntactically valid, beyond source-text assertions', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: 'HalleyDeskSurface.tsx',
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')), []);
  });
  it('offers a valid editable example without requesting or filing anything', () => {
    assert.equal(isHalleyLaunchIntent(HALLEY_EXAMPLE), true);
    assert.deepEqual(missingLaunchFields(HALLEY_EXAMPLE), []);
    assert.equal(isBlankDraft(HALLEY_EXAMPLE), false);
  });
  it('lists missing fields in form order and allows an unanchored draft', () => {
    assert.deepEqual(missingLaunchFields(blank), ['tracker name', 'symbol', 'quote asset', 'supply', 'graduation line']);
    assert.deepEqual(missingLaunchFields({ ...HALLEY_EXAMPLE, anchorSymbol: null, curve: null }), []);
    assert.equal(isBlankDraft(blank), true);
    assert.equal(isBlankDraft({ ...blank, anchorSymbol: 'NVDA' }), false);
  });
  it('progress follows the document stage rather than claiming a launch occurred', () => {
    assert.equal(launchStep('draft', blank), 1);
    assert.equal(launchStep('draft', { ...blank, name: 'Tracker', symbol: 'TEST' }), 2);
    assert.equal(launchStep('draft', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('estimating', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('review', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('saved', HALLEY_EXAMPLE), 'done');
    assert.equal(stageLabel('draft'), 'DRAFT');
    assert.equal(stageLabel('review'), 'REVIEW');
  });
  it('does not promise a fixed price or a steep tail from liquidity weights', () => {
    assert.match(CURVE_HINTS.flat, /does not mean a fixed price/);
    assert.match(CURVE_HINTS.exponential, /liquidity weight/);
    assert.match(CURVE_HINTS['equity-pair'], /both marks are observed/);
  });
  it('wires visible hints, paper boundaries and example edits into the surface', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    for (const id of ['halley-name-hint', 'halley-symbol-hint', 'halley-anchor-hint', 'halley-curve-hint', 'halley-supply-hint', 'halley-grad-hint']) {
      assert.ok(source.includes(`id="${id}"`));
      assert.ok(source.includes(`aria-describedby="${id}"`));
    }
    assert.match(source, /halley\.edit\(\{ \.\.\.HALLEY_EXAMPLE \}\)/);
    assert.match(source, /Paper only: no token is minted/);
    assert.match(source, /Still needed:/);
    assert.match(source, /<HalleyPlate stage=\{viewed \? 'saved'/);
    assert.doesNotMatch(source, /CURVE_LABELS/);
  });
  it('draws every chip glyph from the same weights the launch config sends', () => {
    for (const preset of LAUNCH_CURVE_PRESETS) {
      assert.deepEqual([...CURVE_WEIGHT_SHAPES[preset]], PRESET_WEIGHTS[preset]);
    }
  });
});
