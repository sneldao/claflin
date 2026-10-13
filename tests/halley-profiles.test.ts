import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BaseFeeMode, MigrationFeeOption, MigratedCollectFeeMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  ANTI_SNIPE_DURATION_SLOTS,
  ANTI_SNIPE_PERIODS,
  ANTI_SNIPE_START_FEE_BPS,
  COMPOUNDING_FEE_BPS,
  DAMM_V2_CONFIG_BY_FEE_OPTION,
  LAUNCH_FEE_BPS,
  MIGRATED_POOL_FEE_BPS,
  dammV2ConfigFor,
  feeConfigFor,
  liquidityConfigFor,
  lockedLiquidityBpsFor,
  migrationConfigFor,
  resolveProfiles,
  summarizeProfiles,
  vestedLiquidityBpsFor,
} from '../lib/meteora/profiles';
import { DEFAULT_BAND_BPS, bandBpsFor, dlmmConvictionPlan, estimateLaunch, supplySplitFor, DLMM_MAX_BINS } from '../lib/meteora/dbc';
import { quoteMintForSymbol } from '../lib/meteora/catalog';
import { HALLEY_PRESETS, presetById, presetConfig, presetListings, publishedPresetConfigs } from '../lib/meteora/preset-catalog';
import { summarizePoolStatus, type HalleyPoolRead } from '../lib/meteora/pool-reader';
import type { HalleyAnchor, HalleyLaunchIntent } from '../lib/meteora/contracts';

const USDC = quoteMintForSymbol('USDC')!;

const INTENT: HalleyLaunchIntent = {
  name: 'Test Tracker', symbol: 'TTRK', anchorSymbol: null, quoteSymbol: 'USDC',
  curve: 'flat', supply: '1000000', graduationQuote: '150',
};

const OBSERVED_PYTH: HalleyAnchor = {
  symbol: 'AAPL', source: 'pyth-pro', status: 'observed', equityUsd: '250',
} as HalleyAnchor;

const OBSERVED_ONCHAIN: HalleyAnchor = {
  symbol: 'AAPLx', source: 'onchain', status: 'observed', equityUsd: '250',
} as HalleyAnchor;

describe('halley profiles', () => {
  it('the house proposes session fees only when the equity tape rests', () => {
    assert.deepEqual(resolveProfiles({}, { anchorSource: 'onchain' }), { fee: 'session', liquidity: 'standard', postGraduation: 'dynamic' });
    assert.deepEqual(resolveProfiles({}, { anchorSource: 'pyth-pro' }), { fee: 'anti-snipe', liquidity: 'standard', postGraduation: 'dynamic' });
    assert.deepEqual(resolveProfiles({}, { anchorSource: null }), { fee: 'anti-snipe', liquidity: 'standard', postGraduation: 'dynamic' });
  });

  it('an explicit profile always wins over the house default', () => {
    const p = resolveProfiles({ fee: 'steady', liquidity: 'conviction', postGraduation: 'compounding' }, { anchorSource: 'onchain' });
    assert.deepEqual(p, { fee: 'steady', liquidity: 'conviction', postGraduation: 'compounding' });
  });

  it('steady is a flat fee; anti-snipe decays exponentially; session adds the volatility fee', () => {
    const steady = feeConfigFor('steady');
    assert.equal('feeSchedulerParam' in steady.baseFeeParams && steady.baseFeeParams.baseFeeMode, BaseFeeMode.FeeSchedulerLinear);
    assert.equal(steady.dynamicFeeEnabled, false);
    const snipe = feeConfigFor('anti-snipe');
    assert.equal(snipe.baseFeeParams.baseFeeMode, BaseFeeMode.FeeSchedulerExponential);
    if ('feeSchedulerParam' in snipe.baseFeeParams) {
      assert.equal(snipe.baseFeeParams.feeSchedulerParam.startingFeeBps, ANTI_SNIPE_START_FEE_BPS);
      assert.equal(snipe.baseFeeParams.feeSchedulerParam.endingFeeBps, LAUNCH_FEE_BPS);
      assert.equal(snipe.baseFeeParams.feeSchedulerParam.numberOfPeriod, ANTI_SNIPE_PERIODS);
      assert.equal(snipe.baseFeeParams.feeSchedulerParam.totalDuration, ANTI_SNIPE_DURATION_SLOTS);
    }
    assert.equal(snipe.dynamicFeeEnabled, false);
    const session = feeConfigFor('session');
    assert.equal(session.dynamicFeeEnabled, true); // volatility fee while the tape rests
  });

  it('standard liquidity splits 10 locked / 45 partner / 45 creator; conviction locks half and vests the rest', () => {
    const std = liquidityConfigFor('standard');
    assert.equal(std.partnerPermanentLockedLiquidityPercentage + std.partnerLiquidityPercentage
      + std.creatorPermanentLockedLiquidityPercentage + std.creatorLiquidityPercentage, 100);
    assert.equal(lockedLiquidityBpsFor('standard'), 1000);
    const conv = liquidityConfigFor('conviction');
    assert.equal(lockedLiquidityBpsFor('conviction'), 5000);
    assert.equal(vestedLiquidityBpsFor('conviction'), 2500);
    assert.equal(conv.creatorLiquidityVestingInfoParams?.numberOfPeriods, 90);
    assert.equal(conv.creatorLiquidityVestingInfoParams?.cliffDurationFromMigrationTime, 7 * 86_400);
  });

  it('the migration fee option must move with the DAMM v2 config — or graduation fails', () => {
    assert.equal(migrationConfigFor('fixed').migrationFeeOption, MigrationFeeOption.FixedBps25);
    assert.equal(migrationConfigFor('dynamic').migrationFeeOption, MigrationFeeOption.Customizable);
    assert.equal(migrationConfigFor('compounding').migrationFeeOption, MigrationFeeOption.Customizable);
    assert.equal(dammV2ConfigFor('fixed'), DAMM_V2_CONFIG_BY_FEE_OPTION[MigrationFeeOption.FixedBps25]);
    assert.equal(dammV2ConfigFor('dynamic'), DAMM_V2_CONFIG_BY_FEE_OPTION[MigrationFeeOption.Customizable]);
    assert.notEqual(dammV2ConfigFor('fixed'), dammV2ConfigFor('dynamic'));
    const comp = migrationConfigFor('compounding').migratedPoolFee;
    assert.equal(comp?.collectFeeMode, MigratedCollectFeeMode.Compounding);
    assert.equal(comp?.compoundingFeeBps, COMPOUNDING_FEE_BPS);
    assert.equal(comp?.poolFeeBps, MIGRATED_POOL_FEE_BPS);
  });

  it('the summary names every axis a judge or builder can check', () => {
    const s = summarizeProfiles({ fee: 'anti-snipe', liquidity: 'conviction', postGraduation: 'compounding' });
    assert.equal(s.feeSchedule.mode, 'exponential-decay');
    assert.equal(s.feeSchedule.startingFeeBps, ANTI_SNIPE_START_FEE_BPS);
    assert.equal(s.liquidity.lockedBps, 5000);
    assert.equal(s.liquidity.vestingDays, 90);
    assert.equal(s.postGraduation.migrationFeeOption, 'customizable');
    assert.equal(s.postGraduation.collectFeeMode, 'compounding');
  });
});

describe('halley band + conviction plan', () => {
  it('house bands: tight for equity discovery, wide for steep tails; explicit wins', () => {
    assert.equal(bandBpsFor({ curve: 'equity-pair' }), 1000);
    assert.equal(bandBpsFor({ curve: 'flat' }), 1000);
    assert.equal(bandBpsFor({ curve: 'long' }), 5000);
    assert.equal(bandBpsFor({ curve: 'exponential' }), 20000);
    assert.equal(bandBpsFor({ curve: 'flat', bandBps: 250 }), 250);
    assert.equal(DEFAULT_BAND_BPS['equity-pair'], 1000);
  });

  it('the DLMM conviction plan always fits one position', () => {
    const plan = dlmmConvictionPlan(250, 'anchor')!;
    assert.ok(plan.binCount <= DLMM_MAX_BINS);
    assert.ok(Number(plan.lowerPriceQuote) < 250);
    assert.ok(Number(plan.upperPriceQuote) > 250);
    assert.equal(plan.centerSource, 'anchor');
    const wide = dlmmConvictionPlan(250, 'anchor', 5000)!; // ±50% — the bin step must widen
    assert.ok(wide.binCount <= DLMM_MAX_BINS);
    assert.ok(wide.binStepBps > plan.binStepBps);
  });

  it('the curve collects the stated graduation quote, not a market-cap delta', () => {
    const est = estimateLaunch({ ...INTENT, graduationQuote: '5000' }, null, 1_700_000_000_000);
    const threshold = Number(est.migrationQuoteThreshold) / 10 ** USDC.decimals;
    assert.ok(Math.abs(threshold - 5000) < 1, `expected ≈5000 USDC, got ${threshold}`);
  });

  it('anchored estimates disclose the band and the conviction range centers on the anchor', () => {
    const est = estimateLaunch({ ...INTENT, anchorSymbol: 'AAPL', graduationQuote: '5000' }, OBSERVED_PYTH, 1_700_000_000_000);
    assert.equal(est.bandBps, '1000');
    assert.equal(est.dlmmConviction?.centerSource, 'anchor');
    assert.match(est.assumptions, /Pyth AAPL/);
    assert.match(est.assumptions, /10\.00%/); // band disclosed
    assert.equal(est.profile?.postGraduation.migrationFeeOption, 'customizable');
  });

  it('conviction launches vest the unsold remainder instead of releasing it', () => {
    const intent: HalleyLaunchIntent = { ...INTENT, supply: '1000000000', graduationQuote: '25000', liquidityProfile: 'conviction' };
    const est = estimateLaunch(intent, null, 1_700_000_000_000);
    assert.match(est.assumptions, /vest to the launcher/);
    const split = supplySplitFor(intent, USDC, null);
    assert.ok(split.leftover > 0);
  });
});

describe('halley preset catalog', () => {
  it('every preset builds a config the SDK accepts', () => {
    for (const preset of HALLEY_PRESETS) {
      const params = presetConfig(preset);
      assert.ok(params.curve.length > 0, `${preset.id} has a curve`);
      assert.ok(Number(params.migrationQuoteThreshold.toString()) > 0, `${preset.id} has a threshold`);
    }
  });

  it('listings are pay-to-use only once a shared config is published', () => {
    const free = presetListings({});
    assert.equal(free.length, HALLEY_PRESETS.length);
    for (const l of free) {
      assert.equal(l.publishedConfig, null);
      assert.equal(l.poolCreationFeeLamports, 0);
    }
    const published = presetListings({ 'equity-band': presetById('conviction') ? 'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck' : '' });
    const band = published.find(l => l.id === 'equity-band')!;
    assert.equal(band.publishedConfig, 'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck');
    assert.ok(band.poolCreationFeeLamports > 0);
  });

  it('malformed env entries are skipped, never fatal', () => {
    assert.deepEqual(publishedPresetConfigs('not json'), {});
    assert.deepEqual(publishedPresetConfigs('{"nope":"11111111111111111111111111111111"}'), {});
    assert.deepEqual(publishedPresetConfigs('{"equity-band":"bad-address"}'), {});
  });
});

describe('halley pool status', () => {
  const BASE_READ: HalleyPoolRead = {
    pool: 'pool', baseMint: 'base', quoteMint: USDC.mint,
    baseDecimals: 6, quoteDecimals: 6,
    sqrtPrice: '0', quoteReserve: '100', curveProgress: 0.42,
    migrationQuoteThreshold: '200', migrationProgress: 0, isMigrated: false,
    config: {
      address: 'cfg', baseFeeMode: 0, baseFeePeriods: 0, dynamicFee: false,
      migrationFeeOption: 6, migratedPoolFeeBps: 30, migratedDynamicFee: true,
      migratedCollectFeeMode: 2, migratedCompoundingFeeBps: 50,
      lockedLiquidityBps: 5000, poolCreationFee: '0',
    },
    fees: null, damm: null,
  };

  it('a linear scheduler with no periods reads as a flat fee', () => {
    const s = summarizePoolStatus(BASE_READ, null);
    assert.equal(s.phase, 'bonding');
    assert.equal(s.config.feeSchedule, 'flat');
    assert.equal(s.config.migrationFeeOption, 'customizable');
    assert.equal(s.config.migratedPool.collectFeeMode, 'compounding');
    assert.equal(s.config.migratedPool.compoundingFeeBps, 50);
    assert.equal(s.config.lockedLiquidityBps, 5000);
  });

  it('graduation flips the venue to DAMM v2 and prices off its sqrt price', () => {
    const s = summarizePoolStatus({ ...BASE_READ, isMigrated: true, migrationProgress: 3, damm: { address: 'damm', sqrtPrice: '18446744073709551616', liquidity: '999', baseIsTokenA: true } }, null);
    assert.equal(s.phase, 'graduated');
    assert.ok(s.damm);
    assert.equal(s.priceVenue, 'damm-v2');
    assert.ok(s.priceQuote !== null);
  });

  it('premium vs the equity reference is evidence, never an arbitrage number', () => {
    const withDamm = { ...BASE_READ, isMigrated: true, damm: { address: 'damm', sqrtPrice: '18446744073709551616', liquidity: '1', baseIsTokenA: true } };
    const s = summarizePoolStatus(withDamm, OBSERVED_PYTH);
    assert.ok(s.reference);
    assert.equal(s.reference?.symbol, 'AAPL');
    assert.ok(s.reference?.premiumBps === null || /^-?\d+\.\d$/.test(s.reference.premiumBps));
    const stale = summarizePoolStatus(withDamm, { ...OBSERVED_PYTH, status: 'stale' } as HalleyAnchor);
    assert.equal(stale.reference?.premiumBps, null); // stale reference → no premium
  });
});
