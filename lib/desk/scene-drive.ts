/**
 * Scene drive — the bus between a broker's voice session and the shared
 * room. When a call is live, its client tools and alignment callbacks emit
 * here; the house scene (components/desk/HouseScene.tsx), the room overlay
 * and the desk avatar subscribe. Nothing here knows about three.js or
 * React, and nothing authorizes: a drive event can move a camera, aim a
 * lamp or open a readout — never sign, submit or record.
 *
 * Speech alignment rides the same bus so the avatar mouth can be driven
 * without threading ElevenLabs callbacks through the scene tree.
 */

import type { NightDeskView } from '@/lib/night-desk-fixtures';

export type SceneDriveEvent =
  | { type: 'view'; view: NightDeskView }
  | { type: 'tour'; progress: number | null }
  | { type: 'premium'; focus: boolean }
  | { type: 'highlight'; symbol: string | null }
  /** A chunk of agent speech is playing now; timings are ms from t0. */
  | {
      type: 'speech';
      eventId: number;
      chars: readonly string[];
      charStartsMs: readonly number[];
      charDurationsMs: readonly number[];
    }
  /** Aggregate mouth drive when the provider gives no alignment. */
  | { type: 'speech-activity'; level: number }
  | { type: 'speech-end'; reason: 'interrupted' | 'disconnected' | 'idle' };

type Listener = (event: SceneDriveEvent) => void;

const listeners = new Set<Listener>();

/** Emit a scene-drive event. Safe to call anywhere on the client. */
export function emitSceneDrive(event: SceneDriveEvent): void {
  listeners.forEach(listener => listener(event));
}

/** Subscribe to scene-drive events. Returns an unsubscribe function. */
export function onSceneDrive(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
