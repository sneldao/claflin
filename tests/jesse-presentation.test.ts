import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_JESSE_PRESENTATION,
  JESSE_PRESENTATION_KEY,
  applyJesseFocus,
  loadJessePresentation,
  saveJessePresentation,
  switchJessePresentation,
} from '../lib/solana/presentation.ts';
import type { PaperStorage } from '../lib/trading/paper-records.ts';

function memoryStorage(): PaperStorage & { removeItem(key: string): void } {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe('jesse presentation preference', () => {
  it('missing storage reads back as the default', () => {
    const storage = memoryStorage();
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
    assert.deepEqual(loadJessePresentation(storage), { mode: 'night', focus: 'desk', objectId: null });
  });

  it('malformed rows read back as the default, never throw', () => {
    const storage = memoryStorage();
    storage.setItem(JESSE_PRESENTATION_KEY, 'not json{');
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'expert', focus: 'desk', objectId: null }));
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'direct', focus: 'desk', objectId: null, unlocked: true }));
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
  });

  it('save/load round trips a validated state', () => {
    const storage = memoryStorage();
    const state = { mode: 'direct' as const, focus: 'record' as const, objectId: 'q-1' };
    saveJessePresentation(storage, state);
    assert.deepEqual(loadJessePresentation(storage), state);
    assert.equal(storage.getItem(JESSE_PRESENTATION_KEY), JSON.stringify(state));
  });

  it('switching the view changes only the mode — focus and object survive', () => {
    const focused = { mode: 'night' as const, focus: 'evidence' as const, objectId: 'cmp-1' };
    const switched = switchJessePresentation(focused, 'direct');
    assert.deepEqual(switched, { mode: 'direct', focus: 'evidence', objectId: 'cmp-1' });
    // and the input is not mutated
    assert.equal(focused.mode, 'night');
  });

  it('moving focus changes only focus and objectId — the mode survives', () => {
    const current = { mode: 'direct' as const, focus: 'desk' as const, objectId: null };
    const moved = applyJesseFocus(current, 'instruction', 'q-9');
    assert.deepEqual(moved, { mode: 'direct', focus: 'instruction', objectId: 'q-9' });
    assert.equal(current.focus, 'desk');
  });

  it('a write that cannot be verified throws', () => {
    const storage = memoryStorage();
    const broken: PaperStorage = {
      ...storage,
      setItem: () => { /* drops the write */ },
    };
    assert.throws(
      () => saveJessePresentation(broken, { mode: 'night', focus: 'desk', objectId: null }),
      /could not be verified/,
    );
  });
});
