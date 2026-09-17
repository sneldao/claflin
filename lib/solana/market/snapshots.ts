/**
 * Redis snapshot store for Pyth feed observations (plan §4.4, E2 work
 * item 2). One bounded snapshot per feed under
 * `claflin:jesse:pyth:v1:<feedId>` with a 7-day retention TTL.
 *
 * Write discipline, per the plan:
 *   - generatedAt (the provider's feedUpdateTimestamp) never moves
 *     backwards. A newer envelope carrying an older price does NOT
 *     overwrite the stored price/confidence/generatedAt — but its
 *     session metadata and receipt time are accepted.
 *   - Repeated envelopes (same generation, e.g. across redundant
 *     connections) are deduplicated: no price change, receipt refreshes.
 *   - An envelope without a price (feed has not produced one) updates
 *     session/receipt metadata only.
 *   - Cache reads never change generatedAt; reads validate and a
 *     malformed row reads back as missing, never as evidence.
 *
 * The store interface is the slice of @upstash/redis this module uses,
 * so tests substitute an in-memory fake and the daemon/API wire the real
 * client from lib/redis.ts.
 */
import { z } from 'zod';
import type { FeedSnapshot } from './compare';

export const JESSE_PYTH_SNAPSHOT_PREFIX = 'claflin:jesse:pyth:v1:';
/** 7-day retention, in seconds. */
export const JESSE_PYTH_SNAPSHOT_TTL_S = 7 * 24 * 60 * 60;

export interface SnapshotStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
}

export function jesseSnapshotKey(feedId: number): string {
  if (!Number.isInteger(feedId) || feedId < 0) throw new Error('Invalid feed id.');
  return `${JESSE_PYTH_SNAPSHOT_PREFIX}${feedId}`;
}

const decimal = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d+)?$/);

const snapshotSchema = z.object({
  feedId: z.number().int().nonnegative(),
  symbol: z.string().min(1).max(60),
  price: decimal.nullable(),
  confidence: decimal.nullable(),
  generatedAt: z.number().int().positive().nullable(),
  receivedAt: z.number().int().positive(),
  session: z.enum(['regular', 'preMarket', 'postMarket', 'overNight', 'closed', 'unknown']),
  publisherCount: z.number().int().nonnegative().nullable(),
}).strict();

/** Read the retained snapshot for a feed. Missing or malformed rows yield
 *  null — a cache read is never a reason to fail closed, and never
 *  refreshes any timestamp. */
export async function readFeedSnapshot(store: SnapshotStore, feedId: number): Promise<FeedSnapshot | null> {
  const raw = await store.get(jesseSnapshotKey(feedId));
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Merge an incoming observation into the retained snapshot. Returns the
 * snapshot now stored. The merge never fabricates: the stored price,
 * confidence, and generation time always come from the same envelope.
 */
export async function writeFeedSnapshot(store: SnapshotStore, incoming: FeedSnapshot): Promise<FeedSnapshot> {
  const candidate = snapshotSchema.parse(incoming);
  const existing = await readFeedSnapshot(store, candidate.feedId);

  let next: FeedSnapshot;
  if (existing === null) {
    next = candidate;
  } else if (candidate.generatedAt === null) {
    /* Metadata-only envelope: session/receipt move, price evidence stays. */
    next = {
      ...existing,
      receivedAt: Math.max(existing.receivedAt, candidate.receivedAt),
      session: candidate.session,
      publisherCount: candidate.publisherCount ?? existing.publisherCount,
    };
  } else if (existing.generatedAt !== null && candidate.generatedAt < existing.generatedAt) {
    /* Backwards price in a newer envelope: keep the stored price evidence,
       accept the newer envelope's session metadata and receipt time. */
    next = {
      ...existing,
      receivedAt: Math.max(existing.receivedAt, candidate.receivedAt),
      session: candidate.session,
      publisherCount: candidate.publisherCount ?? existing.publisherCount,
    };
  } else if (existing.generatedAt === candidate.generatedAt && existing.price === candidate.price) {
    /* Repeated envelope across redundant connections: deduplicated. */
    next = {
      ...existing,
      receivedAt: Math.max(existing.receivedAt, candidate.receivedAt),
      session: candidate.session,
      publisherCount: candidate.publisherCount ?? existing.publisherCount,
    };
  } else {
    /* Newer generation (or a first price for a metadata-only row). */
    next = candidate;
  }

  await store.set(jesseSnapshotKey(next.feedId), next, { ex: JESSE_PYTH_SNAPSHOT_TTL_S });
  return next;
}
