/**
 * Halley's launch reader — one read-only view of a launched pool across its
 * whole life: the DBC curve while it bonds, the DAMM v2 pool after it
 * graduates, and how far either trades from the equity reference.
 *
 * This is the desk's data stream. It powers the watch screen and is served
 * as public JSON (`/api/desk/halley/pool-status`) so trading terminals and
 * other launchpads can plug in without re-deriving DBC/DAMM v2 state.
 *
 * Pure summarization is split from the RPC read so it can be tested without
 * a network; every raw quantity crosses the boundary as a string.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  createDammV2Program,
  deriveDammV2PoolAddress,
  getPriceFromSqrtPrice,
  type TokenDecimal,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import type { HalleyAnchor } from './contracts';
import { HALLEY_QUOTE_MINTS } from './catalog';
import { DAMM_V2_CONFIG_BY_FEE_OPTION } from './profiles';

const MIGRATION_PROGRESS = ['PreBondingCurve', 'PostBondingCurve', 'LockedVesting', 'CreatedPool'] as const;
const MIGRATION_FEE_OPTIONS = ['fixed-25', 'fixed-30', 'fixed-100', 'fixed-200', 'fixed-400', 'fixed-600', 'customizable'] as const;

/** What the RPC read returns — already flattened to strings/numbers. */
export interface HalleyPoolRead {
  pool: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number | null;
  sqrtPrice: string;
  quoteReserve: string;
  curveProgress: number;
  migrationQuoteThreshold: string;
  migrationProgress: number;
  isMigrated: boolean;
  config: {
    address: string;
    baseFeeMode: number;
    /** Scheduler period count — 0 on a linear scheduler means a flat fee. */
    baseFeePeriods: number;
    dynamicFee: boolean;
    migrationFeeOption: number;
    migratedPoolFeeBps: number;
    migratedDynamicFee: boolean;
    migratedCollectFeeMode: number;
    migratedCompoundingFeeBps: number;
    lockedLiquidityBps: number;
    poolCreationFee: string;
  };
  fees: { partnerQuoteFee: string; creatorQuoteFee: string; totalTradingQuoteFee: string } | null;
  damm: { address: string; sqrtPrice: string; liquidity: string; baseIsTokenA: boolean } | null;
}

export interface HalleyPoolStatus {
  pool: string;
  baseMint: string;
  quoteMint: string;
  quoteSymbol: string | null;
  phase: 'bonding' | 'graduating' | 'graduated';
  quoteReserve: string;
  curveProgress: number;
  migrationQuoteThreshold: string;
  migrationProgress: string;
  isMigrated: boolean;
  /** Current price, quote units per base token — the curve while bonding,
      the DAMM v2 pool once graduated. */
  priceQuote: string | null;
  priceVenue: 'dbc' | 'damm-v2' | null;
  config: {
    address: string;
    feeSchedule: 'flat' | 'linear-decay' | 'exponential-decay' | 'rate-limiter' | 'unknown';
    dynamicFee: boolean;
    migrationFeeOption: string;
    migratedPool: { poolFeeBps: number; dynamicFee: boolean; collectFeeMode: 'quote' | 'output' | 'compounding'; compoundingFeeBps: number };
    lockedLiquidityBps: number;
    poolCreationFee: string;
  };
  /** Accrued, unclaimed curve trading fees (raw quote units). */
  unclaimedFees: { launcher: string; creator: string; totalTraded: string } | null;
  damm: { pool: string; config: string; liquidity: string } | null;
  /** Venue price against the equity reference — evidence, not an arbitrage. */
  reference: {
    symbol: string;
    source: HalleyAnchor['source'];
    status: HalleyAnchor['status'];
    referenceQuote: string;
    premiumBps: string | null;
  } | null;
}

function priceFrom(sqrtPrice: string, baseDecimals: number, quoteDecimals: number, invert: boolean): string | null {
  try {
    const p = getPriceFromSqrtPrice(new BN(sqrtPrice), baseDecimals as TokenDecimal, quoteDecimals);
    if (!invert) return p.toString();
    return p.isZero() ? null : p.pow(-1).toString();
  } catch {
    return null;
  }
}

/** Pure: raw read (+ optional anchor) → the public status shape. */
export function summarizePoolStatus(read: HalleyPoolRead, anchor: HalleyAnchor | null): HalleyPoolStatus {
  const quote = HALLEY_QUOTE_MINTS.find(q => q.mint === read.quoteMint) ?? null;
  const quoteDecimals = read.quoteDecimals ?? quote?.decimals ?? null;
  const progress = MIGRATION_PROGRESS[read.migrationProgress] ?? `unknown(${read.migrationProgress})`;
  const graduated = read.isMigrated || read.damm !== null;
  const phase: HalleyPoolStatus['phase'] = graduated ? 'graduated' : read.migrationProgress > 0 ? 'graduating' : 'bonding';

  let priceQuote: string | null = null;
  let priceVenue: HalleyPoolStatus['priceVenue'] = null;
  if (quoteDecimals !== null) {
    if (read.damm) {
      priceQuote = priceFrom(read.damm.sqrtPrice, read.baseDecimals, quoteDecimals, !read.damm.baseIsTokenA);
      priceVenue = priceQuote ? 'damm-v2' : null;
    } else {
      priceQuote = priceFrom(read.sqrtPrice, read.baseDecimals, quoteDecimals, false);
      priceVenue = priceQuote ? 'dbc' : null;
    }
  }

  let reference: HalleyPoolStatus['reference'] = null;
  if (anchor) {
    const isPair = Boolean(quote?.underlyingSymbol && anchor.pairRatio);
    const refQuote = isPair ? anchor.pairRatio! : anchor.equityUsd;
    const ref = Number(refQuote);
    const px = priceQuote === null ? NaN : Number(priceQuote);
    const premium = anchor.status === 'observed' && Number.isFinite(px) && ref > 0
      ? (((px - ref) / ref) * 10_000).toFixed(1)
      : null;
    reference = { symbol: anchor.symbol, source: anchor.source, status: anchor.status, referenceQuote: refQuote, premiumBps: premium };
  }

  const c = read.config;
  const feeSchedule = (['linear-decay', 'exponential-decay', 'rate-limiter'] as const)[c.baseFeeMode] ?? 'unknown';
  return {
    pool: read.pool,
    baseMint: read.baseMint,
    quoteMint: read.quoteMint,
    quoteSymbol: quote?.symbol ?? null,
    phase,
    quoteReserve: read.quoteReserve,
    curveProgress: read.curveProgress,
    migrationQuoteThreshold: read.migrationQuoteThreshold,
    migrationProgress: progress,
    isMigrated: read.isMigrated,
    priceQuote,
    priceVenue,
    config: {
      address: c.address,
      /* A linear scheduler with no periods is a flat fee. */
      feeSchedule: feeSchedule === 'linear-decay' && c.baseFeePeriods === 0 ? 'flat' : feeSchedule,
      dynamicFee: c.dynamicFee,
      migrationFeeOption: MIGRATION_FEE_OPTIONS[c.migrationFeeOption] ?? `unknown(${c.migrationFeeOption})`,
      migratedPool: {
        poolFeeBps: c.migratedPoolFeeBps,
        dynamicFee: c.migratedDynamicFee,
        collectFeeMode: (['quote', 'output', 'compounding'] as const)[c.migratedCollectFeeMode] ?? 'quote',
        compoundingFeeBps: c.migratedCompoundingFeeBps,
      },
      lockedLiquidityBps: c.lockedLiquidityBps,
      poolCreationFee: c.poolCreationFee,
    },
    unclaimedFees: read.fees
      ? { launcher: read.fees.partnerQuoteFee, creator: read.fees.creatorQuoteFee, totalTraded: read.fees.totalTradingQuoteFee }
      : null,
    damm: read.damm
      ? { pool: read.damm.address, config: DAMM_V2_CONFIG_BY_FEE_OPTION[c.migrationFeeOption as 0 | 6] ?? '', liquidity: read.damm.liquidity }
      : null,
    reference,
  };
}

/** RPC read — DBC pool + config + fee metrics, and the DAMM v2 pool once
 *  the curve has graduated. */
export async function readHalleyPool(
  pool: string,
  rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
): Promise<HalleyPoolRead | null> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const key = new PublicKey(pool);
  const virtualPool = await client.state.getPool(key);
  if (!virtualPool) return null;
  const state = virtualPool.poolState;
  const [config, progress, threshold, metrics] = await Promise.all([
    client.state.getPoolConfig(state.config),
    client.state.getPoolQuoteTokenCurveProgress(key),
    client.state.getPoolMigrationQuoteThreshold(key),
    client.state.getPoolFeeMetrics(key).catch(() => null),
  ]);
  if (!config) return null;
  const quoteMint = config.quoteMint.toBase58();
  const catalogQuote = HALLEY_QUOTE_MINTS.find(q => q.mint === quoteMint);
  let quoteDecimals: number | null = catalogQuote?.decimals ?? null;
  if (quoteDecimals === null) {
    const info = await connection.getParsedAccountInfo(config.quoteMint).catch(() => null);
    const parsed = info?.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
    quoteDecimals = parsed?.parsed?.info?.decimals ?? null;
  }

  const migrationFeeOption = Number(config.migrationFeeOption);
  let damm: HalleyPoolRead['damm'] = null;
  const dammConfig = DAMM_V2_CONFIG_BY_FEE_OPTION[migrationFeeOption as 0 | 6];
  if (dammConfig && (Boolean(state.isMigrated) || Number(state.migrationProgress) >= 3)) {
    const address = deriveDammV2PoolAddress(new PublicKey(dammConfig), state.baseMint, config.quoteMint);
    const program = createDammV2Program(connection, 'confirmed');
    const account = await program.account.pool.fetchNullable(address).catch(() => null);
    if (account) {
      damm = {
        address: address.toBase58(),
        sqrtPrice: account.sqrtPrice.toString(),
        liquidity: account.liquidity.toString(),
        baseIsTokenA: account.tokenAMint.equals(state.baseMint),
      };
    }
  }

  return {
    pool,
    baseMint: state.baseMint.toBase58(),
    quoteMint,
    baseDecimals: Number(config.tokenDecimal),
    quoteDecimals,
    sqrtPrice: state.sqrtPrice.toString(),
    quoteReserve: state.quoteReserve.toString(),
    curveProgress: typeof progress === 'number' ? progress : Number(progress),
    migrationQuoteThreshold: threshold?.toString() ?? config.migrationQuoteThreshold.toString(),
    migrationProgress: Number(state.migrationProgress),
    isMigrated: Boolean(state.isMigrated),
    config: {
      address: state.config.toBase58(),
      baseFeeMode: Number(config.poolFees.baseFee.baseFeeMode),
      baseFeePeriods: Number(config.poolFees.baseFee.firstFactor),
      dynamicFee: Number(config.poolFees.dynamicFee.initialized) === 1,
      migrationFeeOption,
      migratedPoolFeeBps: Number(config.migratedPoolFeeBps),
      migratedDynamicFee: Number(config.migratedDynamicFee) === 1,
      migratedCollectFeeMode: Number(config.migratedCollectFeeMode),
      migratedCompoundingFeeBps: Number(config.migratedCompoundingFeeBps),
      lockedLiquidityBps: (Number(config.partnerPermanentLockedLiquidityPercentage) + Number(config.creatorPermanentLockedLiquidityPercentage)) * 100,
      poolCreationFee: config.poolCreationFee.toString(),
    },
    fees: metrics
      ? {
          partnerQuoteFee: metrics.current.partnerQuoteFee.toString(),
          creatorQuoteFee: metrics.current.creatorQuoteFee.toString(),
          totalTradingQuoteFee: metrics.total.totalTradingQuoteFee.toString(),
        }
      : null,
    damm,
  };
}
