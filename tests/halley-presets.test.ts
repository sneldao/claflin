import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LAUNCH_SIZE_PRESETS,
  LAUNCH_SIZE_SPECS,
  matchingLaunchSizePreset,
  HOUSE_SUPPLY,
  type HalleyDraft,
} from '../lib/meteora/plate';
import { playStampTick } from '../lib/sounds';

/* Phase 2: Launch size presets at the working depth, and Fine-tune depth
   for expert full control. */

describe('launch size presets at working depth', () => {
  it('defines the three canonical tiers: small, standard, large', () => {
    assert.deepEqual([...LAUNCH_SIZE_PRESETS], ['small', 'standard', 'large']);
    assert.equal(LAUNCH_SIZE_SPECS.small.supply, '100000');
    assert.equal(LAUNCH_SIZE_SPECS.standard.supply, HOUSE_SUPPLY);
    assert.equal(LAUNCH_SIZE_SPECS.large.supply, '1000000000');
  });

  it('adapts graduation thresholds to quote assets', () => {
    // USDC
    assert.equal(LAUNCH_SIZE_SPECS.small.graduationQuote('USDC'), '50');
    assert.equal(LAUNCH_SIZE_SPECS.standard.graduationQuote('USDC'), '150');
    assert.equal(LAUNCH_SIZE_SPECS.large.graduationQuote('USDC'), '5000');

    // xStock pair
    assert.equal(LAUNCH_SIZE_SPECS.small.graduationQuote('NVDAx'), '0.5');
    assert.equal(LAUNCH_SIZE_SPECS.standard.graduationQuote('NVDAx'), '1');
    assert.equal(LAUNCH_SIZE_SPECS.large.graduationQuote('NVDAx'), '25');
  });

  it('matches presets against draft values', () => {
    const blank: HalleyDraft = {
      name: 'Test',
      symbol: 'TEST',
      anchorSymbol: null,
      quoteSymbol: 'USDC',
      curve: 'equity-pair',
      supply: '1000000',
      graduationQuote: '150',
    };
    assert.equal(matchingLaunchSizePreset(blank), 'standard');

    const small: HalleyDraft = {
      ...blank,
      supply: '100000',
      graduationQuote: '50',
    };
    assert.equal(matchingLaunchSizePreset(small), 'small');

    const large: HalleyDraft = {
      ...blank,
      supply: '1000000000',
      graduationQuote: '5000',
    };
    assert.equal(matchingLaunchSizePreset(large), 'large');

    const custom: HalleyDraft = {
      ...blank,
      supply: '500000',
      graduationQuote: '300',
    };
    assert.equal(matchingLaunchSizePreset(custom), null);
  });

  it('matches presets across xStock quotes', () => {
    const pairStandard: HalleyDraft = {
      name: 'Test',
      symbol: 'TEST',
      anchorSymbol: 'NVDA',
      quoteSymbol: 'NVDAx',
      curve: 'equity-pair',
      supply: '1000000',
      graduationQuote: '1',
    };
    assert.equal(matchingLaunchSizePreset(pairStandard), 'standard');

    const pairSmall: HalleyDraft = {
      ...pairStandard,
      supply: '100000',
      graduationQuote: '0.5',
    };
    assert.equal(matchingLaunchSizePreset(pairSmall), 'small');

    const pairLarge: HalleyDraft = {
      ...pairStandard,
      supply: '1000000000',
      graduationQuote: '25',
    };
    assert.equal(matchingLaunchSizePreset(pairLarge), 'large');
  });
});

describe('the working depth and fine-tune disclosure', () => {
  const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');

  it('renders launch size chips and labels the group', () => {
    assert.match(source, /id="halley-size-label"/);
    assert.match(source, /aria-labelledby="halley-size-label"/);
    assert.match(source, /LAUNCH_SIZE_PRESETS\.map/);
  });

  it('nests raw curve, supply and grad fields inside fine-tune fold', () => {
    assert.match(source, /id="halley-fine-tune"/);
    assert.match(source, /Fine-tune \(curve, supply, graduation\)/);
    const fineTuneIdx = source.indexOf('id="halley-fine-tune"');
    const supplyIdx = source.indexOf('id="halley-supply"');
    const gradIdx = source.indexOf('id="halley-grad"');
    assert.ok(fineTuneIdx > 0 && supplyIdx > fineTuneIdx && gradIdx > supplyIdx);
  });

  it('wires scroll compensation on the fields container', () => {
    assert.match(source, /className=\{plate\.slipStack\}\s*onClick=\{onFieldsClick\}/);
    assert.match(source, /window\.scrollBy\(\{\s*top:\s*delta,\s*behavior:\s*'instant'\s*\}\)/);
  });

  it('exports playStampTick for subtle completion audio', () => {
    assert.equal(typeof playStampTick, 'function');
  });
});
