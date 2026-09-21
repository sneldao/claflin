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
import {
  LAZER_STREAM_URLS,
  buildLazerSubscribeMessage,
  extractLazerFeeds,
  lazerRowToSnapshot,
} from '../lib/solana/market/lazer';
import { writeFeedSnapshot, type SnapshotStore } from '../lib/solana/market/snapshots';

const apiKey = process.env.PYTH_PRO_API_KEY;
if (!apiKey) {
  console.error('[jesse-pyth] PYTH_PRO_API_KEY is required');
  process.exit(1);
}

const feedIds = allJesseFeedIds();
let endpointIndex = 0;
let writes = 0;
let lastLog = 0;

function redisStore(): SnapshotStore {
  const redis = getRedis();
  return {
    get: (key) => redis.get(key),
    set: (key, value, opts) => redis.set(key, value as never, opts),
  };
}

const store = redisStore();

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
          await writeFeedSnapshot(store, snapshot);
          writes += 1;
        } catch (err) {
          console.error('[jesse-pyth] write failed', snapshot.feedId, err instanceof Error ? err.message : err);
        }
      }
      if (now - lastLog > 30_000) {
        lastLog = now;
        console.log(`[jesse-pyth] writes=${writes} lastFeeds=${rows.map(r => r.priceFeedId).join(',')}`);
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

connect();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
