import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MouthScheduler } from '../lib/desk/avatar-mouth';

function sampleAt(scheduler: MouthScheduler, t0: number, t: number): Record<string, number> {
  // Large dt converges fully onto the target — the mapping, not damping, is under test.
  return scheduler.sample(t0 + t, 10_000);
}

describe('avatar mouth scheduler', () => {
  it('maps vowels to their visemes', () => {
    const scheduler = new MouthScheduler();
    scheduler.scheduleChunk(1000, ['a', 'e', 'i', 'o', 'u'], [0, 100, 200, 300, 400], [100, 100, 100, 100, 100]);
    assert.equal(sampleAt(scheduler, 1000, 10).aa, 1);
    assert.equal(sampleAt(scheduler, 1000, 110).ee, 1);
    assert.equal(sampleAt(scheduler, 1000, 210).ih, 1);
    assert.equal(sampleAt(scheduler, 1000, 310).oh, 1);
    assert.equal(sampleAt(scheduler, 1000, 410).ou, 1);
  });

  it('closes on m/b/p and space', () => {
    const scheduler = new MouthScheduler();
    scheduler.scheduleChunk(0, ['m', ' ', 'p'], [0, 100, 200], [100, 100, 100]);
    const shut = sampleAt(scheduler, 0, 10);
    assert.deepEqual(shut, { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 });
  });

  it('carries the previous vowel through consonants at reduced weight', () => {
    const scheduler = new MouthScheduler();
    scheduler.scheduleChunk(0, ['a', 't'], [0, 100], [100, 100]);
    // 't' carries the 'a' at 0.45.
    assert.equal(sampleAt(scheduler, 0, 110).aa, 0.45);
  });

  it('maps y to ih and f to half ee', () => {
    const scheduler = new MouthScheduler();
    scheduler.scheduleChunk(0, ['y', 'f'], [0, 100], [100, 100]);
    assert.equal(sampleAt(scheduler, 0, 10).ih, 1);
    assert.equal(sampleAt(scheduler, 0, 110).ee, 0.5);
  });

  it('goes quiet after clear and reports speaking while a chunk runs', () => {
    const scheduler = new MouthScheduler();
    scheduler.scheduleChunk(0, ['a'], [0], [500]);
    assert.equal(scheduler.speaking(100), true);
    scheduler.clear();
    assert.equal(scheduler.speaking(100), false);
    const weights = sampleAt(scheduler, 0, 100);
    assert.deepEqual(weights, { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 });
  });

  it('drives from aggregate level when alignment is absent', () => {
    const scheduler = new MouthScheduler();
    scheduler.driveLevel(0.6, 1000);
    assert.equal(scheduler.speaking(1100), true);
    assert.equal(scheduler.speaking(1400), false);
  });
});
