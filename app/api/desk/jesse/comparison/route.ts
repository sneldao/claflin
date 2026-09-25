import { isSolanaInstrumentId } from '@/lib/solana/contracts';
import { feedMappingFor } from '@/lib/solana/market/feeds';
import { readJesseComparison } from '@/lib/solana/market/reader';
import { fileSnapshotStore } from '@/lib/solana/market/snapshot-file';
import type { SnapshotStore } from '@/lib/solana/market/snapshots';
import { createMintReader } from '@/lib/solana/mint';
import { getSolanaInstrument } from '@/lib/solana/catalog';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const comparisonBudget = requestBudget(40);

/**
 * GET /api/desk/jesse/comparison?instrumentId=sol:<mint>
 *
 * The desk's market evidence for one allowlisted xStock. `unavailable` is
 * data, not an error: missing snapshots or policy failure answers 200 with
 * status `unavailable` — never a synthetic success (plan §4.4 rule 7).
 * Unknown instruments are 404; malformed ids are 400.
 *
 * Token feeds are verified usd-per-raw-token; the mint scaled-UI multiplier
 * effective at the token generation time normalizes before bps.
 */

/**
 * Snapshots live in a host-local JSON document the Lazer daemon replaces
 * atomically (see lib/solana/market/snapshot-file.ts). A missing or corrupt
 * file reads as `unavailable` — data, not an error.
 */
function storeForRequest(): SnapshotStore {
  return fileSnapshotStore();
}

const readMint = createMintReader({
  rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
});

export async function GET(req: Request): Promise<Response> {
  if (!comparisonBudget()) return busyResponse();
  const instrumentId = new URL(req.url).searchParams.get('instrumentId');
  if (!instrumentId || !isSolanaInstrumentId(instrumentId)) {
    return Response.json({ error: 'invalid_instrument_id' }, { status: 400 });
  }
  if (feedMappingFor(instrumentId) === null) {
    return Response.json({ error: 'unknown_instrument' }, { status: 404 });
  }
  const comparison = await readJesseComparison({
    instrumentId,
    now: Date.now(),
    store: storeForRequest(),
    readMultiplier: async ({ instrumentId: id }) => {
      try {
        const instrument = getSolanaInstrument(id);
        const mint = await readMint(instrument.mint);
        return mint.multiplier;
      } catch {
        return null;
      }
    },
  });
  if (comparison === null) {
    return Response.json({ error: 'unknown_instrument' }, { status: 404 });
  }
  return Response.json(comparison, { headers: { 'Cache-Control': 'no-store' } });
}
