import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readJesseComparison } from '../lib/solana/market/reader.ts';
import { jesseSnapshotKey, type SnapshotStore } from '../lib/solana/market/snapshots.ts';
import { feedMappingFor } from '../lib/solana/market/feeds.ts';
import type { FeedSnapshot } from '../lib/solana/market/compare.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';

const T0 = 1_900_000_000_000;
const aaplx = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const mapping = feedMappingFor(aaplx.id)!;

function storeWith(snapshots: Record<number, FeedSnapshot>): SnapshotStore {
  return {
    get: async (key: string) => {
      for (const [feedId, snap] of Object.entries(snapshots)) {
        if (key === jesseSnapshotKey(Number(feedId))) return snap;
      }
      return null;
    },
    set: async () => 'OK',
  };
}

function snap(feed: 'token' | 'equity', overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  const ref = feed === 'token' ? mapping.token : mapping.equity;
  return {
    feedId: ref.feedId,
    symbol: ref.symbol,
    price: feed === 'token' ? '101' : '100',
    confidence: '0.1',
    generatedAt: T0 - 1000,
    receivedAt: T0 - 500,
    session: 'regular',
    publisherCount: 3,
    ...overrides,
  };
}

describe('jesse comparison reader', () => {
  it('returns null for instruments outside the verified mapping', async () => {
    const store = storeWith({});
    const result = await readJesseComparison({ instrumentId: 'sol:9xQeWvG816bUx9EPjHmaT23yvVM2ZWb' as never, now: T0, store });
    assert.equal(result, null);
  });

  it('computes a comparable reading when raw basis + multiplier are present', async () => {
    const store = storeWith({ [mapping.token.feedId]: snap('token'), [mapping.equity.feedId]: snap('equity') });
    const c = await readJesseComparison({
      instrumentId: aaplx.id,
      now: T0,
      store,
      readMultiplier: async () => '1',
    });
    assert.equal(c?.status, 'comparable');
    assert.equal(c?.referenceDifferenceBps, '100.0');
    assert.equal(c?.multiplier, '1');
  });

  it('fails closed as multiplier-unavailable when raw basis lacks a multiplier', async () => {
    const store = storeWith({ [mapping.token.feedId]: snap('token'), [mapping.equity.feedId]: snap('equity') });
    const c = await readJesseComparison({ instrumentId: aaplx.id, now: T0, store });
    assert.equal(c?.status, 'unavailable');
    assert.ok(c?.reasonCodes.includes('multiplier-unavailable'));
    assert.equal(c?.referenceDifferenceBps, null);
  });

  it('empty snapshots degrade to unavailable, not an error', async () => {
    const c = await readJesseComparison({ instrumentId: aaplx.id, now: T0, store: storeWith({}) });
    assert.equal(c?.status, 'unavailable');
    assert.ok(c?.reasonCodes.includes('token-unavailable'));
    assert.ok(c?.reasonCodes.includes('equity-unavailable'));
  });

  it('a failing store degrades to unavailable rather than throwing', async () => {
    const store: SnapshotStore = {
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
    };
    const c = await readJesseComparison({ instrumentId: aaplx.id, now: T0, store });
    assert.equal(c?.status, 'unavailable');
  });

  it('evidence ids are immutable: same snapshots, same id; new tape, new id', async () => {
    const store = storeWith({ [mapping.token.feedId]: snap('token'), [mapping.equity.feedId]: snap('equity') });
    const a = await readJesseComparison({ instrumentId: aaplx.id, now: T0, store, readMultiplier: async () => '1' });
    const b = await readJesseComparison({ instrumentId: aaplx.id, now: T0 + 4000, store, readMultiplier: async () => '1' });
    assert.equal(a?.id, b?.id);

    const newer = storeWith({
      [mapping.token.feedId]: snap('token', { generatedAt: T0 }),
      [mapping.equity.feedId]: snap('equity'),
    });
    const c = await readJesseComparison({ instrumentId: aaplx.id, now: T0, store: newer, readMultiplier: async () => '1' });
    assert.notEqual(c?.id, a?.id);
  });

  it('reads the multiplier when the verified basis is usd-per-raw-token', async () => {
    let multiplierReads = 0;
    const store = storeWith({ [mapping.token.feedId]: snap('token'), [mapping.equity.feedId]: snap('equity') });
    await readJesseComparison({
      instrumentId: aaplx.id,
      now: T0,
      store,
      readMultiplier: async () => { multiplierReads += 1; return '1.003270125'; },
    });
    assert.equal(multiplierReads, 1);
  });
});
