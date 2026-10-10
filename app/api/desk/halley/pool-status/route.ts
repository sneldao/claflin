import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { decodeBase58 } from '@/lib/solana/catalog';
import { HALLEY_PAPER_ENABLED } from '@/lib/meteora/flags';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(20);

const MIGRATION_PROGRESS = ['PreBondingCurve', 'PostBondingCurve', 'LockedVesting', 'CreatedPool'] as const;

/**
 * GET /api/desk/halley/pool-status?pool=<b58>
 * Read-only launch watcher — curve progress, quote raised, migration state.
 * Market-data surface: it reads a deployed pool and never builds a
 * transaction. Not gated by the live flags, like the reconcile route — a
 * launched pool stays watchable even with live launches switched off.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();
  if (!HALLEY_PAPER_ENABLED) {
    return Response.json({ error: 'desk_unavailable', message: 'Halley’s launch desk is not open on this deployment.' }, { status: 422, headers });
  }

  const poolParam = new URL(req.url).searchParams.get('pool') ?? '';
  const decoded = decodeBase58(poolParam);
  if (!decoded || decoded.length !== 32) {
    return Response.json(
      { error: 'invalid_request', message: 'A pool address is required.' },
      { status: 400, headers },
    );
  }

  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com', 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');
    const pool = new PublicKey(poolParam);
    const [poolResult, progress, threshold] = await Promise.all([
      client.state.getPool(pool),
      client.state.getPoolQuoteTokenCurveProgress(pool),
      client.state.getPoolMigrationQuoteThreshold(pool),
    ]);
    if (!poolResult) {
      return Response.json(
        { error: 'pool_not_found', message: 'No DBC pool at this address on the configured cluster.' },
        { status: 404, headers },
      );
    }
    const poolState = poolResult.poolState;
    const config = poolState.config ? await client.state.getPoolConfig(poolState.config) : null;
    return Response.json(
      {
        pool: poolParam,
        baseMint: poolState.baseMint?.toBase58?.() ?? null,
        quoteMint: config?.quoteMint?.toBase58?.() ?? null,
        quoteReserve: poolState.quoteReserve?.toString() ?? null,
        curveProgress: typeof progress === 'number' ? progress : Number(progress),
        migrationQuoteThreshold: threshold?.toString() ?? null,
        migrationProgress: MIGRATION_PROGRESS[Number(poolState.migrationProgress)] ?? `unknown(${poolState.migrationProgress})`,
        isMigrated: Boolean(poolState.isMigrated),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'pool_unavailable', message: 'That pool could not be read — it may not exist on this network.' },
      { status: 503, headers },
    );
  }
}
