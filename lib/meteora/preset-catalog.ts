/**
 * Halley's DBC config presets — the desk's launch shapes packaged for other
 * builders. Each preset is a curve + fee + liquidity + post-graduation
 * profile, served as JSON (`/api/desk/halley/presets`) with a fully built,
 * SDK-validated config preview so a launchpad can reproduce it exactly.
 *
 * Pay-to-use: a preset can also be published once as a shared on-chain DBC
 * config (`scripts/halley-publish-presets.ts`). Anyone may then open a pool
 * against that config address with `createPool`, and the config's
 * `poolCreationFee` is paid to the house as partner on every pool — a
 * permissionless, on-chain preset marketplace. Published addresses are read
 * from HALLEY_PRESET_CONFIGS (JSON: { presetId: address }).
 *
 * A shared config cannot carry a live equity anchor (the opening price is
 * fixed when the config is created), so published presets are unanchored
 * shapes; anchored launches still go through the desk, which builds a fresh
 * config at the live mark.
 */

import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { validateConfigParameters, type ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk';
import type { HalleyLaunchIntent, HalleyProfileSummary, LaunchCurvePreset } from './contracts';
import { quoteMintForSymbol } from './catalog';
import { buildLaunchConfig } from './dbc';
import { summarizeProfiles, type HalleyProfiles } from './profiles';

export interface HalleyPreset {
  id: string;
  title: string;
  /** What it is for, in one line. */
  useCase: string;
  curve: LaunchCurvePreset;
  profiles: HalleyProfiles;
  /** Reference shape the preview is built at. */
  reference: { supply: string; graduationQuote: string; quoteSymbol: 'USDC' };
}

/** Default pay-to-use fee for a published preset: 0.05 SOL per pool. */
export const PRESET_POOL_CREATION_FEE_LAMPORTS = 50_000_000;

export const HALLEY_PRESETS: readonly HalleyPreset[] = Object.freeze([
  {
    id: 'equity-band',
    title: 'Equity band',
    useCase: 'Price discovery for a thinly traded tokenized name — tight band, anti-snipe open, volatility fee when the tape rests.',
    curve: 'equity-pair',
    profiles: { fee: 'session', liquidity: 'standard', postGraduation: 'dynamic' },
    reference: { supply: '1000000', graduationQuote: '5000', quoteSymbol: 'USDC' },
  },
  {
    id: 'conviction',
    title: 'Conviction',
    useCase: 'Half the graduated liquidity locked forever, the creator’s share vested 90 days — commitment you can verify on-chain.',
    curve: 'long',
    profiles: { fee: 'anti-snipe', liquidity: 'conviction', postGraduation: 'compounding' },
    reference: { supply: '1000000000', graduationQuote: '25000', quoteSymbol: 'USDC' },
  },
  {
    id: 'compounding',
    title: 'Compounding liquidity',
    useCase: 'After graduation the DAMM v2 pool folds fees back into liquidity, so depth grows with volume.',
    curve: 'flat',
    profiles: { fee: 'anti-snipe', liquidity: 'standard', postGraduation: 'compounding' },
    reference: { supply: '1000000000', graduationQuote: '10000', quoteSymbol: 'USDC' },
  },
  {
    id: 'exponential',
    title: 'Exponential',
    useCase: 'Liquidity loaded into the tail — cheap early, steep late. The classic launch, with anti-snipe and a dynamic graduated pool.',
    curve: 'exponential',
    profiles: { fee: 'anti-snipe', liquidity: 'standard', postGraduation: 'dynamic' },
    reference: { supply: '1000000000', graduationQuote: '10000', quoteSymbol: 'USDC' },
  },
  {
    id: 'steady',
    title: 'Steady',
    useCase: 'A flat 1% curve fee and a fixed 0.25% DAMM v2 pool — the plain baseline, for comparison.',
    curve: 'flat',
    profiles: { fee: 'steady', liquidity: 'standard', postGraduation: 'fixed' },
    reference: { supply: '1000000000', graduationQuote: '10000', quoteSymbol: 'USDC' },
  },
].map(p => Object.freeze(p)) as HalleyPreset[]);

export function presetById(id: string): HalleyPreset | null {
  return HALLEY_PRESETS.find(p => p.id === id) ?? null;
}

/** The launch intent a preset represents at its reference shape. */
export function presetIntent(preset: HalleyPreset): HalleyLaunchIntent {
  return {
    name: preset.title,
    symbol: 'PRESET',
    anchorSymbol: null,
    quoteSymbol: preset.reference.quoteSymbol,
    curve: preset.curve,
    supply: preset.reference.supply,
    graduationQuote: preset.reference.graduationQuote,
    feeProfile: preset.profiles.fee,
    liquidityProfile: preset.profiles.liquidity,
    postGraduation: preset.profiles.postGraduation,
  };
}

/** Built config parameters for a preset — optionally with a pay-to-use
 *  pool creation fee. Throws if the SDK would reject the config. */
export function presetConfig(preset: HalleyPreset, poolCreationFeeLamports = 0): ConfigParameters {
  const quote = quoteMintForSymbol(preset.reference.quoteSymbol)!;
  const params = buildLaunchConfig(presetIntent(preset), quote, null);
  const withFee: ConfigParameters = { ...params, poolCreationFee: new BN(poolCreationFeeLamports) };
  /* A placeholder leftover receiver — validation only; the real one is set
     at publish time. */
  validateConfigParameters({ ...withFee, leftoverReceiver: new PublicKey('11111111111111111111111111111112') } as never);
  return withFee;
}

/** JSON-safe deep copy: BN/PublicKey → string. */
export function serializeConfig(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (BN.isBN(value)) return (value as BN).toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) return value.map(serializeConfig);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeConfig(v);
    return out;
  }
  return value;
}

export function publishedPresetConfigs(env = process.env.HALLEY_PRESET_CONFIGS): Record<string, string> {
  if (!env) return {};
  try {
    const parsed = JSON.parse(env) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, addr] of Object.entries(parsed)) {
      if (typeof addr !== 'string' || !presetById(id)) continue;
      try {
        out[id] = new PublicKey(addr).toBase58();
      } catch { /* skip malformed */ }
    }
    return out;
  } catch {
    return {};
  }
}

export interface HalleyPresetListing {
  id: string;
  title: string;
  useCase: string;
  curve: LaunchCurvePreset;
  profile: HalleyProfileSummary;
  /** Shared on-chain config address, when published; pools opened against
   *  it pay `poolCreationFeeLamports` to the house. */
  publishedConfig: string | null;
  poolCreationFeeLamports: number;
  reference: HalleyPreset['reference'];
  /** Exact DBC ConfigParameters at the reference shape (serialized). */
  configParameters: unknown;
}

export function presetListings(published = publishedPresetConfigs()): HalleyPresetListing[] {
  return HALLEY_PRESETS.map(preset => {
    const addr = published[preset.id] ?? null;
    const fee = addr ? PRESET_POOL_CREATION_FEE_LAMPORTS : 0;
    return {
      id: preset.id,
      title: preset.title,
      useCase: preset.useCase,
      curve: preset.curve,
      profile: summarizeProfiles(preset.profiles),
      publishedConfig: addr,
      poolCreationFeeLamports: fee,
      reference: preset.reference,
      configParameters: serializeConfig(presetConfig(preset, fee)),
    };
  });
}
