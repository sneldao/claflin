import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseLightweightGraphics, parseGraphicsPreference, GRAPHICS_STORAGE_KEY, type GraphicsPreference } from '../lib/desk/graphics';

/**
 * The motion budget (docs/PERFORMANCE_ROOM_VIEW.md) calls for a clear
 * contract between user preference, device signals, and the WebGL
 * mount decision. These tests protect that contract — the user can
 * always opt in to Room, but auto-default respects reduced motion,
 * coarse pointers (touch), and save-data signals.
 */

describe('graphics preference — parse', () => {
  it('parses known values', () => {
    assert.equal(parseGraphicsPreference('auto'), 'auto');
    assert.equal(parseGraphicsPreference('lightweight'), 'lightweight');
    assert.equal(parseGraphicsPreference('full'), 'full');
  });
  it('falls back to auto for unknown values', () => {
    assert.equal(parseGraphicsPreference(null), 'auto');
    assert.equal(parseGraphicsPreference('turbo'), 'auto');
    assert.equal(parseGraphicsPreference(undefined), 'auto');
    assert.equal(parseGraphicsPreference(42), 'auto');
  });
});

describe('graphics preference — shouldUseLightweightGraphics', () => {
  const full: GraphicsPreference = 'full';
  const auto: GraphicsPreference = 'auto';
  const light: GraphicsPreference = 'lightweight';

  it('reduced motion always wins — full preference still lightweight', () => {
    assert.equal(shouldUseLightweightGraphics(full, { reducedMotion: true, coarsePointer: false, saveData: false }), true);
  });

  it('explicit lightweight preference always wins', () => {
    assert.equal(shouldUseLightweightGraphics(light, { reducedMotion: false, coarsePointer: false, saveData: false }), true);
  });

  it('explicit full preference unlocks the scene on a desktop with no signals', () => {
    assert.equal(shouldUseLightweightGraphics(full, { reducedMotion: false, coarsePointer: false, saveData: false }), false);
  });

  it('auto on a coarse pointer (touch device) defaults to lightweight', () => {
    // The plan: no WebGL on mobile by default; opt in via ?view=room or
    // the GraphicsControl panel. Coarse pointer is the proxy for "this
    // is a phone."
    assert.equal(shouldUseLightweightGraphics(auto, { reducedMotion: false, coarsePointer: true, saveData: false }), true);
  });

  it('auto on save-data defaults to lightweight', () => {
    assert.equal(shouldUseLightweightGraphics(auto, { reducedMotion: false, coarsePointer: false, saveData: true }), true);
  });

  it('auto on a desktop with fine pointer and no save-data unlocks the scene', () => {
    assert.equal(shouldUseLightweightGraphics(auto, { reducedMotion: false, coarsePointer: false, saveData: false }), false);
  });
});

describe('graphics preference — storage key', () => {
  it('is versioned and namespaced', () => {
    // A versioned key means we can change the format without
    // colliding with old saved values.
    assert.match(GRAPHICS_STORAGE_KEY, /^claflin\.graphics\.v\d+/);
  });
});

describe('graphics preference — motion budget honesty', () => {
  it('does not opt in to full scene under reduced motion, regardless of preference', () => {
    // The plan: reduced motion is a hard gate. A user who has set
    // preference=full but has reduced-motion enabled still gets the
    // static end-state.
    for (const preference of ['auto', 'lightweight', 'full'] as GraphicsPreference[]) {
      const result = shouldUseLightweightGraphics(preference, { reducedMotion: true, coarsePointer: false, saveData: false });
      assert.equal(result, true, `preference=${preference} should be lightweight under reduced motion`);
    }
  });
});