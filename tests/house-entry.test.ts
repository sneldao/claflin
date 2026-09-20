import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSE_DESK_PREFERENCE_KEY,
  loadLastDesk,
  parseDeskQuery,
  resolveHouseEntry,
  saveLastDesk,
} from '../lib/house-entry.ts';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    setItem(key: string, value: string) { map.set(key, String(value)); },
    removeItem(key: string) { map.delete(key); },
    key() { return null; },
  };
}

describe('house entry', () => {
  it('parses known desk query values and rejects unknowns', () => {
    assert.equal(parseDeskQuery('jesse'), 'jesse');
    assert.equal(parseDeskQuery('HETTY'), 'hetty');
    assert.equal(parseDeskQuery('nope'), null);
    assert.equal(parseDeskQuery(null), null);
  });

  it('prefers ?desk= over a saved preference', () => {
    const storage = memoryStorage({ [HOUSE_DESK_PREFERENCE_KEY]: 'hetty' });
    assert.deepEqual(resolveHouseEntry('jesse', storage), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'query',
    });
  });

  it('restores the last open desk when there is no query', () => {
    const storage = memoryStorage();
    saveLastDesk(storage, 'jesse');
    assert.equal(loadLastDesk(storage), 'jesse');
    assert.deepEqual(resolveHouseEntry(null, storage), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'preference',
    });
  });

  it('shows the foyer when nothing is chosen yet', () => {
    assert.deepEqual(resolveHouseEntry(null, memoryStorage()), { kind: 'foyer' });
  });

  it('does not restore a planned desk from preference alone', () => {
    const storage = memoryStorage({ [HOUSE_DESK_PREFERENCE_KEY]: 'isabel' });
    assert.deepEqual(resolveHouseEntry(null, storage), { kind: 'foyer' });
  });
});
