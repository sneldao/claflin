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
    assert.deepEqual(loadJessePresentation(storage), { mode: 'room', focus: 'desk', objectId: null });
  });

  it('malformed rows read back as the default, never throw', () => {
    const storage = memoryStorage();
    storage.setItem(JESSE_PRESENTATION_KEY, 'not json{');
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'expert', focus: 'desk', objectId: null }));
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'compact', focus: 'desk', objectId: null, unlocked: true }));
    assert.deepEqual(loadJessePresentation(storage), DEFAULT_JESSE_PRESENTATION);
  });

  it('migrates legacy night/direct tokens on read', () => {
    const storage = memoryStorage();
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'night', focus: 'evidence', objectId: 'cmp-1' }));
    assert.deepEqual(loadJessePresentation(storage), { mode: 'room', focus: 'evidence', objectId: 'cmp-1' });
    storage.setItem(JESSE_PRESENTATION_KEY, JSON.stringify({ mode: 'direct', focus: 'record', objectId: 'q-1' }));
    assert.deepEqual(loadJessePresentation(storage), { mode: 'compact', focus: 'record', objectId: 'q-1' });
  });

  it('save/load round trips a validated state', () => {
    const storage = memoryStorage();
    const state = { mode: 'compact' as const, focus: 'record' as const, objectId: 'q-1' };
    saveJessePresentation(storage, state);
    assert.deepEqual(loadJessePresentation(storage), state);
    assert.equal(storage.getItem(JESSE_PRESENTATION_KEY), JSON.stringify(state));
  });

  it('switching the view changes only the mode — focus and object survive', () => {
    const focused = { mode: 'room' as const, focus: 'evidence' as const, objectId: 'cmp-1' };
    const switched = switchJessePresentation(focused, 'compact');
    assert.deepEqual(switched, { mode: 'compact', focus: 'evidence', objectId: 'cmp-1' });
    assert.equal(focused.mode, 'room');
  });

  it('moving focus changes only focus and objectId — the mode survives', () => {
    const current = { mode: 'compact' as const, focus: 'desk' as const, objectId: null };
    const moved = applyJesseFocus(current, 'instruction', 'q-9');
    assert.deepEqual(moved, { mode: 'compact', focus: 'instruction', objectId: 'q-9' });
    assert.equal(current.focus, 'desk');
  });

  it('controller setPresentationMode persists without bumping revision', async () => {
    const { createJesseController } = await import('../lib/solana/controller.ts');
    const storage = memoryStorage();
    const controller = createJesseController({
      storage,
      ports: {
        quote: async () => { throw new Error('no quote'); },
        compare: async () => null,
      },
    });
    controller.restore();
    const before = controller.getState().revision;
    const outcome = controller.setPresentationMode('compact');
    assert.equal(outcome.ok, true);
    assert.equal(controller.getState().presentation.mode, 'compact');
    assert.equal(controller.getState().revision, before);
    assert.equal(loadJessePresentation(storage).mode, 'compact');
    controller.setPresentationMode('room');
    assert.equal(controller.getState().presentation.mode, 'room');
    assert.equal(controller.getState().revision, before);
  });

  it('controller accepts legacy night/direct aliases', async () => {
    const { createJesseController } = await import('../lib/solana/controller.ts');
    const storage = memoryStorage();
    const controller = createJesseController({
      storage,
      ports: {
        quote: async () => { throw new Error('no quote'); },
        compare: async () => null,
      },
    });
    controller.restore();
    assert.equal(controller.setPresentationMode('direct').ok, true);
    assert.equal(controller.getState().presentation.mode, 'compact');
    assert.equal(controller.setPresentationMode('night').ok, true);
    assert.equal(controller.getState().presentation.mode, 'room');
  });

  it('a write that cannot be verified throws', () => {
    const storage = memoryStorage();
    const broken: PaperStorage = {
      ...storage,
      setItem: () => { /* drops the write */ },
    };
    assert.throws(
      () => saveJessePresentation(broken, { mode: 'room', focus: 'desk', objectId: null }),
      /could not be verified/,
    );
  });
});
