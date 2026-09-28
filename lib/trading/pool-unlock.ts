/**
 * Pure classification for the Aerodrome pool probe
 * (scripts/probe-aerodrome-pools.mts). No RPC, no ethers — given what the
 * chain returned for a blocked instrument, decide whether it can be unlocked
 * by a catalog edit alone, and pick the pool to record. Kept here so the
 * decision is unit-tested independently of the network probe.
 */

export interface PoolReading {
  tickSpacing: number;
  poolAddress: string;
  liquidity: string; // uint128 as a decimal string
  /** Raw token out for a 1-USDC exact-input probe, or null when the quoter
   *  could not route the pool. '0' counts as not routable. */
  quoterOut1Usdc: string | null;
}

export interface UnlockInput {
  decimalsOnChain: number | null;
  pools: readonly PoolReading[];
}

export type UnlockStatus =
  | 'unlockable_data_only' // decimals + a routable USDC pool: edit the catalog
  | 'pool_not_routable' // a USDC pool exists but the desk quoter won't route it: needs code
  | 'no_usdc_pool' // nothing on the newest CL factory: liquidity is elsewhere, needs an adapter
  | 'decimals_unreadable'; // can't size amounts until decimals() resolves

export interface UnlockVerdict {
  status: UnlockStatus;
  /** The pool to record — the routable one with the most in-range liquidity. */
  chosen: PoolReading | null;
}

export function routablePools(pools: readonly PoolReading[]): PoolReading[] {
  return pools
    .filter(p => p.quoterOut1Usdc !== null && p.quoterOut1Usdc !== '0')
    .sort((a, b) => (safeBig(b.liquidity) > safeBig(a.liquidity) ? 1 : safeBig(b.liquidity) < safeBig(a.liquidity) ? -1 : 0));
}

export function classifyUnlock(input: UnlockInput): UnlockVerdict {
  if (input.decimalsOnChain === null) return { status: 'decimals_unreadable', chosen: null };
  const routable = routablePools(input.pools);
  if (routable.length > 0) return { status: 'unlockable_data_only', chosen: routable[0]! };
  if (input.pools.length > 0) return { status: 'pool_not_routable', chosen: null };
  return { status: 'no_usdc_pool', chosen: null };
}

function safeBig(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}
