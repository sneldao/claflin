import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSeenSnapshot, writeSeenSnapshot, trayDeltas, deltaLine, seenDayLabel, marksToPoints, type SeenSnapshot } from '../lib/trading/tray-deltas';
import type { DeskMark } from '../lib/trading/marks-shared';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

const now = 1788600000000;
const mark = (instrumentId: string, price: number | null): { instrumentId: string; price: number | null } => ({ instrumentId, price });
const deskMark = (price: string | null): DeskMark => ({
  symbol: 'NVDAc', name: 'NVIDIA', instrumentId: 'nvda',
  reference: { source: 'chainlink', priceUsdPerToken: price, status: price ? 'live' : 'unavailable', session: 'unknown', pauseStatus: 'unchecked', updatedAt: 1788600000 },
} as DeskMark);

describe('seen snapshot', () => {
  it('round-trips through storage and forgets on absence', () => {
    const store = memoryStorage();
    writeSeenSnapshot(store, 'hetty', [mark('nvda', 121.4)], now);
    const snap = readSeenSnapshot(store, 'hetty', now);
    assert.deepEqual(snap, { seenAt: now, prices: { nvda: 121.4 } });
    assert.equal(readSeenSnapshot(store, 'jesse', now), null, 'desks keep separate memories');
  });

  it('discards a stale bench note rather than showing it', () => {
    const store = memoryStorage();
    writeSeenSnapshot(store, 'hetty', [mark('nvda', 121.4)], now - 46 * 86_400_000);
    assert.equal(readSeenSnapshot(store, 'hetty', now), null);
  });

  it('never stores unusable prices and clears the note when none are', () => {
    const store = memoryStorage();
    writeSeenSnapshot(store, 'hetty', [mark('nvda', 0), mark('tsla', -5), mark('ko', Number.NaN), mark('nvda', null)], now);
    assert.equal(readSeenSnapshot(store, 'hetty', now), null, 'no usable price → no note');
    writeSeenSnapshot(store, 'hetty', [mark('nvda', 121.4)], now);
    writeSeenSnapshot(store, 'hetty', [mark('nvda', null)], now + 1);
    assert.equal(readSeenSnapshot(store, 'hetty', now + 1), null, 'all-unusable update removes the note');
  });

  it('tolerates corrupted storage', () => {
    const store = memoryStorage();
    store.setItem('claflin.watch.seen.hetty', '{not json');
    assert.equal(readSeenSnapshot(store, 'hetty', now), null);
  });
});

describe('tray deltas', () => {
  const snapshot: SeenSnapshot = { seenAt: now - 86_400_000, prices: { nvda: 100, tsla: 50, ko: 70 } };

  it('compares only instruments present on both sides with usable prices', () => {
    const deltas = trayDeltas(snapshot, [mark('nvda', 101.2), mark('tsla', 49.5), mark('ko', 70), mark('new', 5), mark('nvda', null)]);
    assert.equal(deltas.length, 2);
    assert.deepEqual(deltas[0], { instrumentId: 'nvda', previous: 100, current: 101.2, percent: 1.2, direction: 'up' });
    assert.equal(deltas[1].direction, 'down');
  });

  it('shows nothing without a snapshot or with identical prices', () => {
    assert.deepEqual(trayDeltas(null, [mark('nvda', 101)]), []);
    assert.deepEqual(trayDeltas(snapshot, [mark('ko', 70)]), []);
  });

  it('speaks the line with a sign and the day label', () => {
    assert.equal(deltaLine({ instrumentId: 'nvda', previous: 100, current: 101.2, percent: 1.2, direction: 'up' }, 'Tuesday'), '+1.2% since Tuesday');
    assert.equal(deltaLine({ instrumentId: 'tsla', previous: 50, current: 49.25, percent: -1.5, direction: 'down' }, 'Tuesday'), '−1.5% since Tuesday');
  });

  it('labels the last visit in desk language', () => {
    const sameDay = new Date(now).setHours(1, 0, 0, 0);
    assert.equal(seenDayLabel(sameDay, now), 'earlier today');
    assert.equal(seenDayLabel(now - 86_400_000, now), 'yesterday');
    assert.equal(seenDayLabel(now - 3 * 86_400_000, now).endsWith('day'), true, 'a weekday within the week');
    assert.match(seenDayLabel(now - 30 * 86_400_000, now), /\d{1,2} [A-Z][a-z]{2}|[A-Z][a-z]{2} \d{1,2}/, 'a short date, in whatever order the locale writes it');
  });
});

describe('marks to points', () => {
  it('converts reference marks to display-precision points, dropping unusable ones', () => {
    const points = marksToPoints([deskMark('121.4'), deskMark(null)]);
    assert.deepEqual(points, [{ instrumentId: 'nvda', price: 121.4 }]);
  });
});
