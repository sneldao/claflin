import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BROADCAST_VERSION,
  broadcastStateFor,
  decodeBroadcastState,
  encodeBroadcastState,
  sceneDriveFor,
  type BroadcastState,
} from '../lib/hetty/broadcast-state';
import type { SceneDriveEvent } from '../lib/desk/scene-drive';

function roundTrip(state: BroadcastState): BroadcastState | null {
  return decodeBroadcastState(encodeBroadcastState(state));
}

function raw(value: unknown): Uint8Array {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
}

describe('broadcastStateFor', () => {
  it('carries the room views the scene understands', () => {
    for (const view of ['desk', 'evidence', 'review', 'ledger'] as const) {
      assert.deepEqual(broadcastStateFor({ type: 'view', view }), { v: BROADCAST_VERSION, t: 'view', view });
    }
  });

  it('clamps tour progress and keeps "end of walk" as null', () => {
    assert.deepEqual(broadcastStateFor({ type: 'tour', progress: 0.4 }), { v: 1, t: 'tour', progress: 0.4 });
    assert.deepEqual(broadcastStateFor({ type: 'tour', progress: 4 }), { v: 1, t: 'tour', progress: 1 });
    assert.deepEqual(broadcastStateFor({ type: 'tour', progress: -1 }), { v: 1, t: 'tour', progress: 0 });
    assert.deepEqual(broadcastStateFor({ type: 'tour', progress: null }), { v: 1, t: 'tour', progress: null });
  });

  it('shortens a mark symbol rather than sending an unbounded string', () => {
    const long = 'x'.repeat(40);
    const state = broadcastStateFor({ type: 'highlight', symbol: long });
    assert.equal(state?.t, 'highlight');
    assert.equal((state as { symbol: string }).symbol.length, 16);
    assert.deepEqual(broadcastStateFor({ type: 'highlight', symbol: null }), { v: 1, t: 'highlight', symbol: null });
  });

  it('truncates speech chars and their timings together', () => {
    const count = 400;
    const state = broadcastStateFor({
      type: 'speech',
      eventId: 3,
      chars: Array.from({ length: count }, () => 'a'),
      charStartsMs: Array.from({ length: count }, (_, i) => i * 10),
      charDurationsMs: Array.from({ length: count }, () => 10),
    });
    assert.equal(state?.t, 'speech');
    const speech = state as { chars: string[]; starts: number[]; durations: number[] };
    assert.equal(speech.chars.length, 240);
    assert.equal(speech.starts.length, 240);
    assert.equal(speech.durations.length, 240);
    assert.equal(speech.starts[239], 2390);
  });

  it('drops an empty alignment instead of sending a mouth with no shape', () => {
    assert.equal(broadcastStateFor({ type: 'speech', eventId: 1, chars: [], charStartsMs: [], charDurationsMs: [] }), null);
  });

  it('clamps activity and refuses a non-finite level', () => {
    assert.deepEqual(broadcastStateFor({ type: 'speech-activity', level: 2 }), { v: 1, t: 'activity', level: 1 });
    assert.deepEqual(broadcastStateFor({ type: 'speech-activity', level: -0.2 }), { v: 1, t: 'activity', level: 0 });
    assert.equal(broadcastStateFor({ type: 'speech-activity', level: Number.NaN }), null);
  });

  it('carries every speech-end reason', () => {
    for (const reason of ['interrupted', 'disconnected', 'idle'] as const) {
      assert.deepEqual(broadcastStateFor({ type: 'speech-end', reason }), { v: 1, t: 'end', reason });
    }
  });
});

describe('broadcast state wire format', () => {
  it('round-trips each message', () => {
    const states: BroadcastState[] = [
      { v: 1, t: 'view', view: 'evidence' },
      { v: 1, t: 'tour', progress: null },
      { v: 1, t: 'tour', progress: 0.25 },
      { v: 1, t: 'premium', focus: true },
      { v: 1, t: 'highlight', symbol: 'nvda' },
      { v: 1, t: 'speech', eventId: 9, chars: ['h', 'i'], starts: [0, 70], durations: [70, 70] },
      { v: 1, t: 'activity', level: 0.5 },
      { v: 1, t: 'end', reason: 'interrupted' },
    ];
    for (const state of states) assert.deepEqual(roundTrip(state), state);
  });

  it('refuses a message from another version rather than guessing', () => {
    assert.equal(decodeBroadcastState(raw({ v: 2, t: 'view', view: 'desk' })), null);
    assert.equal(decodeBroadcastState(raw({ v: 0, t: 'view', view: 'desk' })), null);
  });

  it('refuses unknown types, junk and truncation', () => {
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'sign', intent: 'buy' })), null);
    assert.equal(decodeBroadcastState(raw('not json')), null);
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'view', view: 'e' })), null);
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'view', view: 'desk' }).slice(0, 10)), null);
    assert.equal(decodeBroadcastState(new Uint8Array()), null);
  });

  it('refuses a speech payload whose timings do not cover its chars', () => {
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'speech', eventId: 1, chars: ['a', 'b'], starts: [0], durations: [70] })), null);
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'speech', eventId: 1, chars: ['a'], starts: [0], durations: ['70'] })), null);
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'speech', eventId: 1, chars: [], starts: [], durations: [] })), null);
  });

  it('refuses an oversized payload before parsing it', () => {
    const huge = new Uint8Array(17_000).fill(65);
    assert.equal(decodeBroadcastState(huge), null);
  });

  it('refuses a highlight string beyond the cap', () => {
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'highlight', symbol: 'x'.repeat(17) })), null);
    assert.deepEqual(decodeBroadcastState(raw({ v: 1, t: 'highlight', symbol: null })), { v: 1, t: 'highlight', symbol: null });
  });

  it('refuses an unknown end reason', () => {
    assert.equal(decodeBroadcastState(raw({ v: 1, t: 'end', reason: 'hung-up' })), null);
  });
});

describe('sceneDriveFor', () => {
  it('round-trips every scene event the wire carries', () => {
    const events: SceneDriveEvent[] = [
      { type: 'view', view: 'ledger' },
      { type: 'tour', progress: 0.5 },
      { type: 'tour', progress: null },
      { type: 'premium', focus: true },
      { type: 'highlight', symbol: 'nvda' },
      { type: 'highlight', symbol: null },
      { type: 'speech', eventId: 4, chars: ['h', 'i'], charStartsMs: [0, 90], charDurationsMs: [90, 90] },
      { type: 'speech-activity', level: 0.3 },
      { type: 'speech-end', reason: 'idle' },
    ];
    for (const event of events) {
      const state = broadcastStateFor(event);
      assert.ok(state, `${event.type} should be broadcastable`);
      assert.deepEqual(sceneDriveFor(state), event, `${event.type} should survive the round trip`);
    }
  });

  it('survives encode → decode → drive, which is the observer path', () => {
    const original: SceneDriveEvent = { type: 'speech', eventId: 9, chars: ['y', 'o'], charStartsMs: [10, 80], charDurationsMs: [70, 70] };
    const wire = encodeBroadcastState(broadcastStateFor(original) as BroadcastState);
    const driven = decodeBroadcastState(wire);
    assert.ok(driven);
    assert.deepEqual(sceneDriveFor(driven), original);
  });

  it('returns null rather than guessing at an unknown message', () => {
    const unknown = { v: 1, t: 'nonsense' } as unknown as BroadcastState;
    assert.equal(sceneDriveFor(unknown), null);
  });
});
