import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { budgetRegressions, percentile } from '../scripts/room-budget-lib.mjs';

const view = { firstPaintMs: 100, webglMountMs: 200, jsGzipBytes: 1000, fpsMedian: 60, frameIntervalP95Ms: 17, drawCallsPerFrame: 10 };
const baseline = { views: { compact: { ...view, webglMountMs: null }, room: view } };

describe('room budget regression gate', () => {
  it('accepts real first measurements, not placeholder metrics', () => {
    assert.deepEqual(budgetRegressions(null, baseline), []);
    assert.equal(budgetRegressions(null, { views: { compact: null, room: null } }).length, 2);
  });
  it('rejects a larger payload and a collapsed frame rate', () => {
    const current = { views: { compact: baseline.views.compact, room: { ...view, jsGzipBytes: 1200, fpsMedian: 15 } } };
    assert.equal(budgetRegressions(baseline, current).length, 2);
  });
  it('absorbs SwiftShader timing noise on an unchanged code path', () => {
    const current = { views: { compact: baseline.views.compact, room: { ...view, firstPaintMs: 280, frameIntervalP95Ms: 45 } } };
    assert.deepEqual(budgetRegressions(baseline, current), []);
  });
  it('rejects missing frame samples and mismatched renderers', () => {
    assert.equal(budgetRegressions(null, {
      views: { compact: { ...view, fpsMedian: null }, room: view },
    }).length, 1);
    const recorded = { views: { compact: { ...view, renderer: 'SwiftShader' }, room: { ...view, renderer: 'SwiftShader' } } };
    assert.equal(budgetRegressions(recorded, {
      views: { compact: recorded.views.compact, room: { ...view, renderer: 'different GPU' } },
    }).length, 1);
  });
  it('treats a view losing its WebGL renderer as an improvement, not new hardware', () => {
    const withRenderer = { views: { compact: { ...view, renderer: 'SwiftShader' }, room: { ...view, renderer: 'SwiftShader' } } };
    const splitLanded = {
      views: {
        compact: { ...withRenderer.views.compact, renderer: null, webglMountMs: null },
        room: withRenderer.views.room,
      },
    };
    assert.deepEqual(budgetRegressions(withRenderer, splitLanded), []);
  });
  it('accepts improvements and handles an absent WebGL mount', () => {
    assert.deepEqual(budgetRegressions(baseline, baseline), []);
    assert.deepEqual(budgetRegressions(baseline, {
      views: { compact: baseline.views.compact, room: { ...view, firstPaintMs: 80, fpsMedian: 70 } },
    }), []);
  });
  it('computes measured percentiles without mutating samples', () => {
    const samples = [30, 10, 20];
    assert.equal(percentile(samples, 0.5), 20);
    assert.equal(percentile(samples, 0.95), 30);
    assert.deepEqual(samples, [30, 10, 20]);
    assert.equal(percentile([], 0.5), null);
  });
});
