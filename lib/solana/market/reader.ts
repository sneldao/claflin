/**
 * Comparison reader (plan §4.4, E2 work item 3) — the seam the API route
 * and (through it) the controller's `compare` port call.
 *
 * Assembles the retained snapshots for an allowlisted instrument, applies
 * the deterministic policy, and returns the MarketComparison. Honest by
 * construction: an unknown instrument yields null, a store failure yields
 * missing snapshots (the policy then reports `unavailable`), and a
 * multiplier is only read when the verified basis actually needs it.
 *
 * Evidence ids are immutable and derived from the evidence itself — the
 * same snapshots always produce the same id, so a pinned review snapshot
 * can never be silently replaced by newer tape.
 */
import type { MarketComparison, SolanaInstrumentId } from '../contracts';
import { buildMarketComparison, type FeedSnapshot } from './compare';
import { feedMappingFor } from './feeds';
import { readFeedSnapshot, type SnapshotStore } from './snapshots';

function comparisonId(instrumentId: SolanaInstrumentId, token: FeedSnapshot | null, equity: FeedSnapshot | null): string {
  const mint = instrumentId.slice(4);
  const short = mint.length > 8 ? mint.slice(-8) : mint;
  return `cmp-${short}-${token?.generatedAt ?? 'none'}-${equity?.generatedAt ?? 'none'}`;
}

export async function readJesseComparison(args: {
  instrumentId: SolanaInstrumentId;
  now: number;
  store: SnapshotStore;
  /** Reads the multiplier effective at the token price's generation time.
   *  Only called when the verified basis is usd-per-raw-token. */
  readMultiplier?: (args: { instrumentId: SolanaInstrumentId; atGeneration: number | null }) => Promise<string | null>;
}): Promise<MarketComparison | null> {
  const mapping = feedMappingFor(args.instrumentId);
  if (mapping === null) return null;

  const [token, equity] = await Promise.all([
    readFeedSnapshot(args.store, mapping.token.feedId).catch(() => null),
    readFeedSnapshot(args.store, mapping.equity.feedId).catch(() => null),
  ]);

  let multiplier: string | null = null;
  if (mapping.tokenUnitBasis === 'usd-per-raw-token' && args.readMultiplier) {
    multiplier = await args
      .readMultiplier({ instrumentId: args.instrumentId, atGeneration: token?.generatedAt ?? null })
      .catch(() => null);
  }

  return buildMarketComparison({
    mapping,
    token,
    equity,
    multiplierAtGeneration: multiplier,
    now: args.now,
    id: comparisonId(args.instrumentId, token, equity),
  });
}
