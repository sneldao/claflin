/**
 * Broadcast state — the wire format for "the room's state, not video of the
 * room". A host browser publishes these messages on a LiveKit data channel;
 * observer browsers decode them and drive a locally-rendered scene, so the
 * scene stays real for everyone while only the broker's voice is media.
 *
 * This module is pure: no LiveKit, no React, no scene. It owns the version,
 * the caps and the defensive decode, so a malformed or hostile message can
 * only ever fail to render — never reach a controller with nonsense.
 */

import type { NightDeskView } from '@/lib/night-desk-fixtures';
import type { SceneDriveEvent } from '@/lib/desk/scene-drive';

/** Data-channel topic. Observers ignore every other topic. */
export const BROADCAST_TOPIC = 'claflin.desk.state';

/** Bump when the shape changes; observers drop unknown versions. */
export const BROADCAST_VERSION = 1;

/** Alignment chunks are the largest message; keep well under LiveKit's cap. */
const SPEECH_CHARS_MAX = 240;
const SYMBOL_MAX = 16;
const VIEWS: readonly NightDeskView[] = ['desk', 'evidence', 'review', 'ledger'];
const END_REASONS = ['interrupted', 'disconnected', 'idle'] as const;

export type BroadcastEndReason = (typeof END_REASONS)[number];

export type BroadcastState =
  | { v: 1; t: 'view'; view: NightDeskView }
  | { v: 1; t: 'tour'; progress: number | null }
  | { v: 1; t: 'premium'; focus: boolean }
  | { v: 1; t: 'highlight'; symbol: string | null }
  | {
      v: 1;
      t: 'speech';
      eventId: number;
      chars: string[];
      starts: number[];
      durations: number[];
    }
  | { v: 1; t: 'activity'; level: number }
  | { v: 1; t: 'end'; reason: BroadcastEndReason };

function clamp01(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/**
 * Translate one scene-drive event into a broadcast message, or null when the
 * event is not room state (nothing on the bus is private, but every message
 * still has to be worth the wire).
 */
export function broadcastStateFor(event: SceneDriveEvent): BroadcastState | null {
  switch (event.type) {
    case 'view':
      return { v: BROADCAST_VERSION, t: 'view', view: event.view };
    case 'tour': {
      const progress = event.progress === null ? null : clamp01(event.progress);
      return { v: BROADCAST_VERSION, t: 'tour', progress };
    }
    case 'premium':
      return { v: BROADCAST_VERSION, t: 'premium', focus: event.focus === true };
    case 'highlight':
      return {
        v: BROADCAST_VERSION,
        t: 'highlight',
        symbol: event.symbol === null ? null : event.symbol.slice(0, SYMBOL_MAX),
      };
    case 'speech': {
      const count = Math.min(event.chars.length, SPEECH_CHARS_MAX);
      if (count === 0) return null;
      /* Alignment arrays are indexed by char; truncate them together so an
         observer can never read a duration for a character it did not get. */
      return {
        v: BROADCAST_VERSION,
        t: 'speech',
        eventId: event.eventId,
        chars: event.chars.slice(0, count),
        starts: event.charStartsMs.slice(0, count),
        durations: event.charDurationsMs.slice(0, count),
      };
    }
    case 'speech-activity': {
      const level = clamp01(event.level);
      if (level === null) return null;
      return { v: BROADCAST_VERSION, t: 'activity', level };
    }
    case 'speech-end':
      return { v: BROADCAST_VERSION, t: 'end', reason: event.reason };
    default:
      return null;
  }
}

/**
 * The inverse of {@link broadcastStateFor}: turn a decoded message back into
 * a scene-drive event. This is what makes an observer's room the same room —
 * the local scene subscribes to one bus, and it does not know or care whether
 * an event came from the broker's own callbacks or from the wire.
 */
export function sceneDriveFor(state: BroadcastState): SceneDriveEvent | null {
  switch (state.t) {
    case 'view':
      return { type: 'view', view: state.view };
    case 'tour':
      return { type: 'tour', progress: state.progress };
    case 'premium':
      return { type: 'premium', focus: state.focus };
    case 'highlight':
      return { type: 'highlight', symbol: state.symbol };
    case 'speech':
      return {
        type: 'speech',
        eventId: state.eventId,
        chars: state.chars,
        charStartsMs: state.starts,
        charDurationsMs: state.durations,
      };
    case 'activity':
      return { type: 'speech-activity', level: state.level };
    case 'end':
      return { type: 'speech-end', reason: state.reason };
    default:
      return null;
  }
}

/** Encoded as a plain ArrayBuffer-backed view: LiveKit's data publish takes
 *  `Uint8Array<ArrayBuffer>`, and a shared-buffer view does not qualify. */
export function encodeBroadcastState(state: BroadcastState): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  return bytes;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberArray(value: unknown, expected: number): number[] | null {
  if (!Array.isArray(value) || value.length < expected) return null;
  const out: number[] = [];
  for (let i = 0; i < expected; i += 1) {
    const item = value[i];
    if (!finite(item)) return null;
    out.push(item);
  }
  return out;
}

/**
 * Decode a data-channel payload. Anything that does not match the current
 * version exactly is null — an observer renders the last good state rather
 * than guessing at a newer or truncated message.
 */
export function decodeBroadcastState(data: Uint8Array): BroadcastState | null {
  if (!data || data.byteLength === 0 || data.byteLength > 16_384) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  if (message.v !== BROADCAST_VERSION) return null;

  switch (message.t) {
    case 'view': {
      const view = message.view;
      if (typeof view !== 'string' || !(VIEWS as readonly string[]).includes(view)) return null;
      return { v: BROADCAST_VERSION, t: 'view', view: view as NightDeskView };
    }
    case 'tour': {
      if (message.progress === null) return { v: BROADCAST_VERSION, t: 'tour', progress: null };
      const progress = clamp01(message.progress);
      if (progress === null) return null;
      return { v: BROADCAST_VERSION, t: 'tour', progress };
    }
    case 'premium':
      return { v: BROADCAST_VERSION, t: 'premium', focus: message.focus === true };
    case 'highlight': {
      if (message.symbol === null) return { v: BROADCAST_VERSION, t: 'highlight', symbol: null };
      if (typeof message.symbol !== 'string' || message.symbol.length > SYMBOL_MAX) return null;
      return { v: BROADCAST_VERSION, t: 'highlight', symbol: message.symbol };
    }
    case 'speech': {
      const chars = message.chars;
      if (!Array.isArray(chars) || chars.length === 0 || chars.length > SPEECH_CHARS_MAX) return null;
      if (!chars.every(ch => typeof ch === 'string' && ch.length <= 8)) return null;
      const starts = numberArray(message.starts, chars.length);
      const durations = numberArray(message.durations, chars.length);
      if (!starts || !durations || !finite(message.eventId)) return null;
      return {
        v: BROADCAST_VERSION,
        t: 'speech',
        eventId: message.eventId,
        chars: chars as string[],
        starts,
        durations,
      };
    }
    case 'activity': {
      const level = clamp01(message.level);
      if (level === null) return null;
      return { v: BROADCAST_VERSION, t: 'activity', level };
    }
    case 'end': {
      const reason = message.reason;
      if (typeof reason !== 'string' || !(END_REASONS as readonly string[]).includes(reason)) return null;
      return { v: BROADCAST_VERSION, t: 'end', reason: reason as BroadcastEndReason };
    }
    default:
      return null;
  }
}
