/**
 * Jesse Pyth Pro (Lazer) ingestion daemon.
 *
 * Subscribes to the verified feed allowlist, merges snapshots under the
 * shared rules, and flushes them to a host-local JSON document that the
 * comparison route reads (see lib/solana/market/snapshot-file.ts).
 * Reconnects across the three Lazer endpoints. Server-side only — never
 * expose PYTH_PRO_API_KEY to the browser.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/jesse-pyth-feed.ts
 *   # production (Hetzner):
 *   node --import tsx /opt/claflin/jesse-pyth-feed.ts
 */

import { allJesseFeedIds } from '../lib/solana/market/feeds';
import type { FeedSnapshot } from '../lib/solana/market/compare';
import {
  LAZER_STREAM_URLS,
  buildLazerSubscribeMessage,
  extractLazerFeeds,
  lazerRowToSnapshot,
} from '../lib/solana/market/lazer';
import {
  jesseSnapshotKey,
  writeFeedSnapshot,
  type SnapshotStore,
} from '../lib/solana/market/snapshots';
import {
  readSnapshotFile,
  snapshotFilePath,
  writeSnapshotFile,
} from '../lib/solana/market/snapshot-file';

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
 * Snapshots merge into memory under the same rules as always, then flush to
 * a host-local JSON document on a fixed cadence (atomically, tmp + rename).
 * A stored generatedAt is at most ~FLUSH_MS old — comfortably inside the
 * reader's 15s freshness window — and if the daemon dies the rows age into
 * the honest stale/unavailable states. No external store: the comparison
 * route reads the same file.
 */
const FLUSH_MS = 8_000;

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

function hydrate(): void {
  const existing = readSnapshotFile();
  if (!existing) {
    console.log('[jesse-pyth] no snapshot file; starting from empty memory');
    return;
  }
  for (const feedId of feedIds) {
    const row = existing[jesseSnapshotKey(feedId)];
    if (row) mem.set(jesseSnapshotKey(feedId), row);
  }
  console.log(`[jesse-pyth] hydrated ${mem.size}/${feedIds.length} snapshots from ${snapshotFilePath()}`);
}

async function flush(): Promise<void> {
  if (!dirty) return;
  try {
    await writeSnapshotFile(Object.fromEntries(mem));
    dirty = false;
    flushes += 1;
  } catch (err) {
    console.error('[jesse-pyth] flush failed', err instanceof Error ? err.message : err);
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

  ws.addEventListener('open', () => {
    ws.send(buildLazerSubscribeMessage(feedIds));
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
    console.warn(`[jesse-pyth] ${why}; reconnecting in 2s`);
    setTimeout(connect, 2000);
  };

  ws.addEventListener('close', () => reconnect('socket closed'));
  ws.addEventListener('error', () => {
    try { ws.close(); } catch { /* ignore */ }
  });
}

setInterval(() => void flush(), FLUSH_MS);

hydrate();
void flush();
connect();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => {
  void flush().finally(() => process.exit(0));
});
