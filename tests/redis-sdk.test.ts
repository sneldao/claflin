import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Redis, type UpstashRequest } from '@upstash/redis';
import {
  JESSE_PYTH_SNAPSHOT_TTL_S,
  jesseSnapshotKey,
  readFeedSnapshot,
  writeFeedSnapshot,
} from '../lib/solana/market/snapshots';
import type { FeedSnapshot } from '../lib/solana/market/compare';

function sdkWithResponses(responses: unknown[]) {
  const commands: unknown[] = [];
  const redis = new Redis({
    request: async <TResult>(request: UpstashRequest) => {
      commands.push(request.body);
      assert.ok(responses.length > 0, 'Unexpected Redis request');
      return { result: responses.shift() as TResult };
    },
  });
  return { redis, commands };
}

describe('Redis SDK compatibility', () => {
  it('roundtrips provider snapshots through the real SDK with expiry intact', async () => {
    const snapshot: FeedSnapshot = {
      feedId: 922,
      symbol: 'Equity.US.AAPL/USD',
      price: '255.5',
      confidence: '0.13',
      generatedAt: 1_900_000_000_000,
      receivedAt: 1_900_000_000_500,
      session: 'regular',
      publisherCount: 3,
    };
    const { redis, commands } = sdkWithResponses([null, 'OK', JSON.stringify(snapshot)]);
    assert.deepEqual(await writeFeedSnapshot(redis, snapshot), snapshot);
    assert.deepEqual(await readFeedSnapshot(redis, snapshot.feedId), snapshot);
    const key = jesseSnapshotKey(snapshot.feedId);
    assert.deepEqual(commands, [
      ['get', key],
      ['set', key, JSON.stringify(snapshot), 'ex', JESSE_PYTH_SNAPSHOT_TTL_S],
      ['get', key],
    ]);
  });

  it('keeps rate-limit objects and setex TTLs compatible', async () => {
    const entry = { count: 2, resetTime: 1_900_000_060_000 };
    const { redis, commands } = sdkWithResponses(['OK', JSON.stringify(entry)]);
    await redis.setex('ratelimit:test', 60, entry);
    assert.deepEqual(await redis.get<typeof entry>('ratelimit:test'), entry);
    assert.deepEqual(commands, [
      ['setex', 'ratelimit:test', 60, JSON.stringify(entry)],
      ['get', 'ratelimit:test'],
    ]);
  });

  it('preserves the user hash fields and numeric balances used by the database', async () => {
    const user = { id: 'test', balance: 12, createdAt: 100 };
    const { redis, commands } = sdkWithResponses([
      3, ['id', '"test"', 'balance', '12', 'createdAt', '100'],
    ]);
    await redis.hset('user:test', user);
    assert.deepEqual(await redis.hgetall('user:test'), user);
    const write = commands[0] as unknown[];
    assert.deepEqual(write.slice(0, 2), ['hset', 'user:test']);
    assert.equal(String(write[write.indexOf('balance') + 1]), '12');
    assert.deepEqual(commands[1], ['hgetall', 'user:test']);
  });

  it('surfaces provider errors instead of returning missing data', async () => {
    const redis = new Redis({
      request: async () => ({ error: 'WRONGTYPE incompatible stored value' }),
    });
    await assert.rejects(() => redis.get('test'), /WRONGTYPE/);
  });
});
