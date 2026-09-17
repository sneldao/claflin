import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JESSE_PYTH_SNAPSHOT_PREFIX,
  JESSE_PYTH_SNAPSHOT_TTL_S,
  jesseSnapshotKey,
  readFeedSnapshot,
  writeFeedSnapshot,
  type SnapshotStore,
} from '../lib/solana/market/snapshots.ts';
import type { FeedSnapshot } from '../lib/solana/market/compare.ts';

const T0 = 1_900_000_000_000;

function fakeStore(): SnapshotStore & { data: Map<string, unknown>; expiries: Map<string, number> } {
  const data = new Map<string, unknown>();
  const expiries = new Map<string, number>();
  return {
    data,
    expiries,
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: unknown, opts: { ex: number }) => {
      data.set(key, value);
      expiries.set(key, opts.ex);
      return 'OK';
    },
  };
}

function snap(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    feedId: 922,
    symbol: 'Equity.US.AAPL/USD',
    price: '255.5',
    confidence: '0.13',
    generatedAt: T0 - 1000,
    receivedAt: T0 - 500,
    session: 'regular',
    publisherCount: 3,
    ...overrides,
  };
}

describe('jesse pyth snapshots — storage discipline', () => {
  it('writes and reads back a snapshot with the 7-day TTL', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap());
    const read = await readFeedSnapshot(store, 922);
    assert.equal(read?.price, '255.5');
    assert.equal(read?.generatedAt, T0 - 1000);
    assert.equal(store.expiries.get(jesseSnapshotKey(922)), JESSE_PYTH_SNAPSHOT_TTL_S);
    assert.equal(jesseSnapshotKey(922), `${JESSE_PYTH_SNAPSHOT_PREFIX}922`);
  });

  it('a newer generation replaces the stored evidence wholesale', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap());
    await writeFeedSnapshot(store, snap({ price: '256.01', confidence: '0.09', generatedAt: T0 }));
    const read = await readFeedSnapshot(store, 922);
    assert.equal(read?.price, '256.01');
    assert.equal(read?.confidence, '0.09');
    assert.equal(read?.generatedAt, T0);
  });

  it('rejects a backwards price but accepts the newer envelope session metadata', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap({ generatedAt: T0, session: 'regular', receivedAt: T0 }));
    // A later envelope carrying an older price (reconnect replay, redundant link).
    const merged = await writeFeedSnapshot(store, snap({ price: '250', generatedAt: T0 - 60_000, session: 'closed', receivedAt: T0 + 1000 }));
    assert.equal(merged.price, '255.5'); // price evidence untouched
    assert.equal(merged.generatedAt, T0);
    assert.equal(merged.session, 'closed'); // newer envelope metadata accepted
    assert.equal(merged.receivedAt, T0 + 1000);
  });

  it('deduplicates repeated envelopes across redundant connections', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap({ session: 'regular' }));
    const merged = await writeFeedSnapshot(store, snap({ session: 'regular', receivedAt: T0 + 50, publisherCount: 4 }));
    assert.equal(merged.price, '255.5');
    assert.equal(merged.generatedAt, T0 - 1000);
    assert.equal(merged.receivedAt, T0 + 50); // receipt refreshes to the latest envelope
    assert.equal(merged.publisherCount, 4);
  });

  it('a metadata-only envelope (no price) never disturbs stored evidence', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap());
    const merged = await writeFeedSnapshot(store, snap({
      price: null, confidence: null, generatedAt: null, session: 'closed', receivedAt: T0 + 2000, publisherCount: null,
    }));
    assert.equal(merged.price, '255.5');
    assert.equal(merged.generatedAt, T0 - 1000);
    assert.equal(merged.session, 'closed');
    assert.equal(merged.publisherCount, 3);
  });

  it('reads never change generatedAt, and malformed rows read as missing', async () => {
    const store = fakeStore();
    await writeFeedSnapshot(store, snap());
    const before = (await readFeedSnapshot(store, 922))!;
    const after = (await readFeedSnapshot(store, 922))!;
    assert.equal(after.generatedAt, before.generatedAt);

    store.data.set(jesseSnapshotKey(922), '{"feedId":"nope"}');
    assert.equal(await readFeedSnapshot(store, 922), null);
    store.data.set(jesseSnapshotKey(922), { feedId: 922, symbol: 'x' }); // incomplete
    assert.equal(await readFeedSnapshot(store, 922), null);
  });

  it('rejects malformed incoming observations and invalid feed ids', async () => {
    const store = fakeStore();
    await assert.rejects(() => writeFeedSnapshot(store, snap({ price: 'not-a-decimal' })));
    assert.throws(() => jesseSnapshotKey(-1));
    assert.throws(() => jesseSnapshotKey(1.5));
  });
});
