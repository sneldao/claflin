import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emitSceneDrive, onSceneDrive } from '../lib/desk/scene-drive';

describe('scene drive bus', () => {
  it('delivers view events to subscribers', () => {
    const seen: string[] = [];
    const off = onSceneDrive(event => {
      if (event.type === 'view') seen.push(event.view);
    });
    emitSceneDrive({ type: 'view', view: 'evidence' });
    assert.deepEqual(seen, ['evidence']);
    off();
  });

  it('unsubscribe stops delivery', () => {
    let count = 0;
    const off = onSceneDrive(() => { count += 1; });
    off();
    emitSceneDrive({ type: 'tour', progress: 0.5 });
    assert.equal(count, 0);
  });

  it('carries speech alignment timings through', () => {
    const got: unknown[] = [];
    const off = onSceneDrive(event => {
      if (event.type === 'speech') got.push(event);
    });
    emitSceneDrive({
      type: 'speech',
      eventId: 7,
      chars: ['h', 'i'],
      charStartsMs: [0, 80],
      charDurationsMs: [80, 80],
    });
    assert.equal(got.length, 1);
    off();
  });

  it('carries premium, highlight and speech-end', () => {
    const types: string[] = [];
    const off = onSceneDrive(event => { types.push(event.type); });
    emitSceneDrive({ type: 'premium', focus: true });
    emitSceneDrive({ type: 'highlight', symbol: 'aapl' });
    emitSceneDrive({ type: 'speech-activity', level: 0.4 });
    emitSceneDrive({ type: 'speech-end', reason: 'idle' });
    assert.deepEqual(types, ['premium', 'highlight', 'speech-activity', 'speech-end']);
    off();
  });
});
