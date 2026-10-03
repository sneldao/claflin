import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { budgetRegressions, percentile } from '../scripts/room-budget-lib.mjs';

const view = { firstPaintMs: 100, webglMountMs: 200, jsGzipBytes: 1000, fpsMedian: 60, frameIntervalP95Ms: 17 };
const baseline = { views: { compact: { ...view, webglMountMs: null }, room: view } };

describe('room budget regression gate', () => {
  it('accepts real first measurements, not placeholder metrics', () => {
    assert.deepEqual(budgetRegressions(null, baseline), []);
    assert.equal(budgetRegressions(null, { views: { compact: null, room: null } }).length, 2);
  });
  it('rejects a larger payload and a slower frame rate', () => {
    const current = { views: { compact: baseline.views.compact, room: { ...view, jsGzipBytes: 1200, fpsMedian: 45 } } };
    assert.equal(budgetRegressions(baseline, current).length, 2);
  });
  it('rejects missing frame samples and mismatched renderers', () => {
    assert.equal(budgetRegressions(null, {
      views: { compact: { ...view, fpsMedian: null }, room: view },
    }).length, 1);
    assert.equal(budgetRegressions(baseline, {
      views: { compact: baseline.views.compact, room: { ...view, renderer: 'different GPU' } },
    }).length, 1);
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
