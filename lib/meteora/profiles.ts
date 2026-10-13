/**
 * Halley launch profiles — the fee, liquidity and post-graduation axes of a
 * DBC config, alongside the curve preset. Pure module: no network, no env.
 *
 * Why these exist: a curve with a flat 1% fee, the protocol-minimum lock and
 * a fixed 0.25% DAMM v2 pool is the default every launchpad ships. An
 * equity-anchored launch has a sharper problem — the reference market keeps
 * hours, the curve does not — so the profiles are tuned to that:
 *
 * - fee 'anti-snipe': exponential fee decay at open (50% → 1% over ~10
 *   minutes of slots) so the first block cannot buy the whole anchored band.
 * - fee 'session': anti-snipe plus the DBC dynamic (volatility) fee — the
 *   house default whenever the equity tape rests and the anchor is the
 *   onchain venue mark, because that is exactly when price discovery has no
 *   outside reference and volatility should pay for itself.
 * - liquidity 'conviction': half the migrated LP permanently locked and the
 *   creator's remaining LP vested, so commitment is visible on-chain.
 * - post-graduation 'dynamic' / 'compounding': a Customizable DAMM v2 pool
 *   (volatility fee, or fees compounded back into liquidity) instead of the
 *   fixed 25 bps pool.
 *
 * Each migration fee option graduates through its own DAMM v2 config — the
 * config must move with the option or migration fails. Both configs used
 * here were verified on mainnet 2026-10-13: owned by the DAMM v2 program and
 * carrying the DBC pool authority as poolCreatorAuthority.
 */

import {
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  type FeeConfig,
  type LiquidityDistributionConfig,
  type MigrationConfig,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

import {
  HALLEY_FEE_PROFILES,
  HALLEY_LIQUIDITY_PROFILES,
  HALLEY_POST_GRADUATION_PROFILES,
  type HalleyFeeProfile,
  type HalleyLiquidityProfile,
  type HalleyPostGraduationProfile,
  type HalleyProfiles,
  type HalleyProfileSummary,
} from './contracts';

export {
  HALLEY_FEE_PROFILES,
  HALLEY_LIQUIDITY_PROFILES,
  HALLEY_POST_GRADUATION_PROFILES,
  type HalleyFeeProfile,
  type HalleyLiquidityProfile,
  type HalleyPostGraduationProfile,
  type HalleyProfiles,
  type HalleyProfileSummary,
};

/** Steady trading fee — also where every decaying schedule ends. */
export const LAUNCH_FEE_BPS = 100;
/** Anti-snipe opening fee. */
export const ANTI_SNIPE_START_FEE_BPS = 5000;
/** Slot-activated schedule: ~10 minutes at ~400ms/slot, 60 steps. */
export const ANTI_SNIPE_DURATION_SLOTS = 1500;
export const ANTI_SNIPE_PERIODS = 60;

/** Customizable DAMM v2 pool fee after graduation. */
export const MIGRATED_POOL_FEE_BPS = 30;
/** Share of the compounding pool fee folded back into liquidity. */
export const COMPOUNDING_FEE_BPS = 50;

const DAY_SECONDS = 86_400;

/** DAMM v2 migration configs by fee option — SDK-canonical addresses,
 *  identical on devnet and mainnet. */
export const DAMM_V2_CONFIG_BY_FEE_OPTION: Readonly<Partial<Record<MigrationFeeOption, string>>> = Object.freeze({
  [MigrationFeeOption.FixedBps25]: '7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd',
  [MigrationFeeOption.Customizable]: 'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck',
});

export function isHalleyFeeProfile(v: unknown): v is HalleyFeeProfile {
  return HALLEY_FEE_PROFILES.includes(v as HalleyFeeProfile);
}
export function isHalleyLiquidityProfile(v: unknown): v is HalleyLiquidityProfile {
  return HALLEY_LIQUIDITY_PROFILES.includes(v as HalleyLiquidityProfile);
}
export function isHalleyPostGraduationProfile(v: unknown): v is HalleyPostGraduationProfile {
  return HALLEY_POST_GRADUATION_PROFILES.includes(v as HalleyPostGraduationProfile);
}

/**
 * The house proposes; the caller disposes. An explicit profile on the intent
 * always wins. Otherwise: 'session' when the anchor is the onchain venue mark
 * (the equity tape is resting — no outside reference), 'anti-snipe' for any
 * other launch; standard liquidity; a dynamic DAMM v2 pool after graduation.
 */
export function resolveProfiles(
  explicit: Partial<HalleyProfiles> | undefined,
  context: { anchorSource: 'pyth-pro' | 'onchain' | null },
): HalleyProfiles {
  return {
    fee: explicit?.fee ?? (context.anchorSource === 'onchain' ? 'session' : 'anti-snipe'),
    liquidity: explicit?.liquidity ?? 'standard',
    postGraduation: explicit?.postGraduation ?? 'dynamic',
  };
}

export function feeConfigFor(profile: HalleyFeeProfile): FeeConfig {
  const decaying = profile !== 'steady';
  return {
    baseFeeParams: decaying
      ? {
          baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
          feeSchedulerParam: {
            startingFeeBps: ANTI_SNIPE_START_FEE_BPS,
            endingFeeBps: LAUNCH_FEE_BPS,
            numberOfPeriod: ANTI_SNIPE_PERIODS,
            totalDuration: ANTI_SNIPE_DURATION_SLOTS,
          },
        }
      : {
          baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
          feeSchedulerParam: { startingFeeBps: LAUNCH_FEE_BPS, endingFeeBps: LAUNCH_FEE_BPS, numberOfPeriod: 0, totalDuration: 0 },
        },
    dynamicFeeEnabled: profile === 'session',
    collectFeeMode: CollectFeeMode.QuoteToken, // fees accrue in the quote asset
    creatorTradingFeePercentage: 0,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: false,
  };
}

export function liquidityConfigFor(profile: HalleyLiquidityProfile): LiquidityDistributionConfig {
  if (profile === 'standard') {
    return {
      partnerPermanentLockedLiquidityPercentage: 10,
      partnerLiquidityPercentage: 45,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 45,
    };
  }
  /* Conviction: 50% of migrated LP permanently locked; the creator's free
     share vests over 90 days after a 7-day cliff from migration. */
  return {
    partnerPermanentLockedLiquidityPercentage: 25,
    partnerLiquidityPercentage: 25,
    creatorPermanentLockedLiquidityPercentage: 25,
    creatorLiquidityPercentage: 0,
    creatorLiquidityVestingInfoParams: {
      vestingPercentage: 25,
      bpsPerPeriod: 0,
      numberOfPeriods: 90,
      cliffDurationFromMigrationTime: 7 * DAY_SECONDS,
      totalDuration: 90 * DAY_SECONDS,
    },
  };
}

/** Permanently locked share of migrated liquidity, in bps. */
export function lockedLiquidityBpsFor(profile: HalleyLiquidityProfile): number {
  const l = liquidityConfigFor(profile);
  return (l.partnerPermanentLockedLiquidityPercentage + l.creatorPermanentLockedLiquidityPercentage) * 100;
}

/** Vested (time-released) share of migrated liquidity, in bps. */
export function vestedLiquidityBpsFor(profile: HalleyLiquidityProfile): number {
  const l = liquidityConfigFor(profile);
  return ((l.partnerLiquidityVestingInfoParams?.vestingPercentage ?? 0)
    + (l.creatorLiquidityVestingInfoParams?.vestingPercentage ?? 0)) * 100;
}

export function migrationConfigFor(profile: HalleyPostGraduationProfile): MigrationConfig {
  const base = { migrationOption: MigrationOption.MET_DAMM_V2, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } };
  if (profile === 'fixed') return { ...base, migrationFeeOption: MigrationFeeOption.FixedBps25 };
  return {
    ...base,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migratedPoolFee: profile === 'dynamic'
      ? { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Enabled, poolFeeBps: MIGRATED_POOL_FEE_BPS }
      : {
          collectFeeMode: MigratedCollectFeeMode.Compounding,
          dynamicFee: DammV2DynamicFeeMode.Enabled,
          poolFeeBps: MIGRATED_POOL_FEE_BPS,
          compoundingFeeBps: COMPOUNDING_FEE_BPS,
        },
  };
}

export function dammV2ConfigFor(profile: HalleyPostGraduationProfile): string {
  const option = migrationConfigFor(profile).migrationFeeOption;
  return DAMM_V2_CONFIG_BY_FEE_OPTION[option] ?? '';
}

/** The migrated DAMM v2 pool's base fee in bps. */
export function migratedPoolFeeBpsFor(profile: HalleyPostGraduationProfile): number {
  return profile === 'fixed' ? 25 : MIGRATED_POOL_FEE_BPS;
}

export function summarizeProfiles(profiles: HalleyProfiles): HalleyProfileSummary {
  const fee = feeConfigFor(profiles.fee);
  const sched = 'feeSchedulerParam' in fee.baseFeeParams ? fee.baseFeeParams.feeSchedulerParam : null;
  const liq = liquidityConfigFor(profiles.liquidity);
  const vest = liq.creatorLiquidityVestingInfoParams ?? liq.partnerLiquidityVestingInfoParams;
  const mig = migrationConfigFor(profiles.postGraduation);
  return {
    profiles,
    feeSchedule: {
      mode: fee.baseFeeParams.baseFeeMode === BaseFeeMode.FeeSchedulerExponential ? 'exponential-decay' : 'flat',
      startingFeeBps: sched?.startingFeeBps ?? LAUNCH_FEE_BPS,
      endingFeeBps: sched?.endingFeeBps ?? LAUNCH_FEE_BPS,
      durationSlots: sched?.totalDuration ?? 0,
      periods: sched?.numberOfPeriod ?? 0,
      dynamicFee: fee.dynamicFeeEnabled,
    },
    liquidity: {
      lockedBps: lockedLiquidityBpsFor(profiles.liquidity),
      vestedBps: vestedLiquidityBpsFor(profiles.liquidity),
      vestingCliffDays: vest ? vest.cliffDurationFromMigrationTime / DAY_SECONDS : 0,
      vestingDays: vest ? vest.totalDuration / DAY_SECONDS : 0,
    },
    postGraduation: {
      dammV2Config: dammV2ConfigFor(profiles.postGraduation),
      migrationFeeOption: mig.migrationFeeOption === MigrationFeeOption.Customizable ? 'customizable' : 'fixed-25',
      poolFeeBps: migratedPoolFeeBpsFor(profiles.postGraduation),
      dynamicFee: mig.migratedPoolFee?.dynamicFee === DammV2DynamicFeeMode.Enabled,
      collectFeeMode: mig.migratedPoolFee?.collectFeeMode === MigratedCollectFeeMode.Compounding ? 'compounding' : 'quote',
      compoundingFeeBps: mig.migratedPoolFee?.compoundingFeeBps ?? 0,
    },
  };
}
