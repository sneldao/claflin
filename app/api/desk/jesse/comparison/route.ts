import { getRedis } from '@/lib/redis';
import { isSolanaInstrumentId } from '@/lib/solana/contracts';
import { feedMappingFor } from '@/lib/solana/market/feeds';
import { readJesseComparison } from '@/lib/solana/market/reader';
import type { SnapshotStore } from '@/lib/solana/market/snapshots';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desk/jesse/comparison?instrumentId=sol:<mint>
 *
 * The desk's market evidence for one allowlisted xStock. `unavailable` is
 * data, not an error: with no Pyth entitlement or an unverified unit
 * basis the route answers 200 with status `unavailable` — never a
 * synthetic success (plan §4.4 rule 7). Unknown instruments are 404;
 * malformed ids are 400.
 *
 * No multiplier reader is wired yet: every mapped basis is currently
 * unverified, so the policy short-circuits before one is needed. If a
 * basis is ever verified as usd-per-raw-token, wire the mint reader
 * (lib/solana/mint.ts) here — until then an omitted reader fails closed
 * as `multiplier-unavailable`.
 */

/** A store whose every read fails honestly → snapshots read as missing. */
const unavailableStore: SnapshotStore = {
  get: () => Promise.reject(new Error('snapshot store unavailable')),
  set: () => Promise.reject(new Error('snapshot store unavailable')),
};

function storeForRequest(): SnapshotStore {
  try {
    const redis = getRedis();
    return {
      get: (key) => redis.get(key),
      set: (key, value, opts) => redis.set(key, value as never, opts),
    };
  } catch {
    return unavailableStore;
  }
}

export async function GET(req: Request): Promise<Response> {
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
  });
  if (comparison === null) {
    return Response.json({ error: 'unknown_instrument' }, { status: 404 });
  }
  return Response.json(comparison, { headers: { 'Cache-Control': 'no-store' } });
}
