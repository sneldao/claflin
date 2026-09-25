/**
 * Jesse Pyth Pro (Lazer) ingestion daemon.
 *
 * Subscribes to the verified feed allowlist, writes Redis snapshots under
 * `claflin:jesse:pyth:v1:<feedId>`, and reconnects across the three Lazer
 * endpoints. Server-side only — never expose PYTH_PRO_API_KEY to the browser.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/jesse-pyth-feed.ts
 *   # production (Hetzner):
 *   node --import tsx /opt/claflin/jesse-pyth-feed.ts
 */

import { getRedis } from '../lib/redis';
import { allJesseFeedIds } from '../lib/solana/market/feeds';
import type { FeedSnapshot } from '../lib/solana/market/compare';
import {
  LAZER_STREAM_URLS,
  buildLazerSubscribeMessage,
  extractLazerFeeds,
  lazerRowToSnapshot,
} from '../lib/solana/market/lazer';
import {
  JESSE_PYTH_SNAPSHOT_TTL_S,
  jesseSnapshotKey,
  writeFeedSnapshot,
  type SnapshotStore,
} from '../lib/solana/market/snapshots';

const apiKey = process.env.PYTH_PRO_API_KEY;
if (!apiKey) {
  console.error('[jesse-pyth] PYTH_PRO_API_KEY is required');
  process.exit(1);
}

const feedIds = allJesseFeedIds();
let endpointIndex = 0;
let writes = 0;
let flushes = 0;
let lastLog = 0;

/**
 * Upstash's free tier is request-metered, so this daemon cannot afford a
 * GET+SET per stream row. Incoming rows merge into an in-memory store using
 * the same snapshot rules, then a single MSET flushes the changed feeds on a
 * fixed cadence. A stored generatedAt is at most ~FLUSH_MS old — comfortably
 * inside the reader's 15s freshness window — and if the daemon dies the rows
 * age into the honest stale/unavailable states.
 */
const FLUSH_MS = 8_000;
const EXPIRE_REFRESH_MS = 60 * 60 * 1000;

const mem = new Map<string, FeedSnapshot>();
let dirty = false;

const memStore: SnapshotStore = {
  get: async (key) => mem.get(key) ?? null,
  set: async (key, value) => {
    mem.set(key, value as FeedSnapshot);
    dirty = true;
    return 'OK';
  },
};

const redis = getRedis();

async function hydrate(): Promise<void> {
  const keys = feedIds.map(jesseSnapshotKey);
  try {
    const rows = (await (redis.mget as (...k: string[]) => Promise<unknown[]>)(...keys)) as unknown[];
    keys.forEach((key, i) => {
      const row = rows[i];
      if (row) mem.set(key, (typeof row === 'string' ? JSON.parse(row) : row) as FeedSnapshot);
    });
    console.log(`[jesse-pyth] hydrated ${mem.size}/${keys.length} snapshots from redis`);
  } catch (err) {
    console.error('[jesse-pyth] hydrate failed; starting from empty memory', err instanceof Error ? err.message : err);
  }
}

async function flush(): Promise<void> {
  if (!dirty) return;
  const entries: Record<string, FeedSnapshot> = {};
  for (const [key, value] of mem) entries[key] = value;
  try {
    await redis.mset(entries);
    dirty = false;
    flushes += 1;
  } catch (err) {
    console.error('[jesse-pyth] flush failed', err instanceof Error ? err.message : err);
  }
}

async function refreshExpiry(): Promise<void> {
  try {
    for (const feedId of feedIds) await redis.expire(jesseSnapshotKey(feedId), JESSE_PYTH_SNAPSHOT_TTL_S);
  } catch (err) {
    console.error('[jesse-pyth] expire refresh failed', err instanceof Error ? err.message : err);
  }
}

function connect(): void {
  const url = LAZER_STREAM_URLS[endpointIndex % LAZER_STREAM_URLS.length]!;
  endpointIndex += 1;
  console.log(`[jesse-pyth] connecting ${url} feeds=${feedIds.join(',')}`);

  const ws = new WebSocket(url, {
    // Node undici WebSocket accepts Authorization here; DOM typings do not.
    headers: { Authorization: `Bearer ${apiKey}` },
  } as unknown as string[]);

  let heartbeat: ReturnType<typeof setInterval> | null = null;

  ws.addEventListener('open', () => {
    ws.send(buildLazerSubscribeMessage(feedIds));
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 25_000);
  });

  ws.addEventListener('message', (event) => {
    void (async () => {
      let message: unknown;
      try {
        const text = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8');
        message = JSON.parse(text);
      } catch {
        return;
      }
      const type = (message as { type?: string }).type;
      if (type === 'subscribed' || type === 'subscribedWithInvalidFeedIdsIgnored') {
        console.log('[jesse-pyth] subscribed', JSON.stringify(message).slice(0, 400));
        return;
      }
      if (type === 'subscriptionError' || type === 'error') {
        console.error('[jesse-pyth] subscription error', JSON.stringify(message).slice(0, 500));
        return;
      }
      if (type !== 'streamUpdated' && type !== 'json') return;

      const now = Date.now();
      const rows = extractLazerFeeds(message);
      for (const row of rows) {
        const snapshot = lazerRowToSnapshot(row, now);
        if (!snapshot) continue;
        try {
          await writeFeedSnapshot(memStore, snapshot);
          writes += 1;
        } catch (err) {
          console.error('[jesse-pyth] merge failed', snapshot.feedId, err instanceof Error ? err.message : err);
        }
      }
      if (now - lastLog > 30_000) {
        lastLog = now;
        console.log(`[jesse-pyth] writes=${writes} flushes=${flushes} lastFeeds=${rows.map(r => r.priceFeedId).join(',')}`);
      }
    })();
  });

  const reconnect = (why: string) => {
    if (heartbeat) clearInterval(heartbeat);
    console.warn(`[jesse-pyth] ${why}; reconnecting in 2s`);
    setTimeout(connect, 2000);
  };

  ws.addEventListener('close', () => reconnect('socket closed'));
  ws.addEventListener('error', () => {
    try { ws.close(); } catch { /* ignore */ }
  });
}

setInterval(() => void flush(), FLUSH_MS);
setInterval(() => void refreshExpiry(), EXPIRE_REFRESH_MS);

void hydrate().then(() => {
  void flush();
  connect();
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => {
  void flush().finally(() => process.exit(0));
});
