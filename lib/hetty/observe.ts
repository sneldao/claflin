/**
 * Audience mode — joining the house room the host is publishing into.
 *
 * The token that gets here was minted subscribe-only, so the least privilege
 * is in the signature rather than in this file. Nothing here opens a
 * microphone, asks for a device, or knows how to publish: the observer's job
 * is to receive one audio track and a stream of scene state.
 *
 * Two things arrive on the same room:
 *   · the broker's voice, republished by the host as an ordinary audio track;
 *   · scene state on the data channel, decoded and re-emitted on the local
 *     scene-drive bus — so an observer's room is driven by the same events as
 *     the host's, and the scene does not know who is local.
 *
 * Autoplay is a browser rule, not ours: joining is allowed to succeed with
 * sound still blocked, and `startAudio` is the gesture-sized retry the Listen
 * control offers.
 */

'use client';

import { emitSceneDrive } from '@/lib/desk/scene-drive';
import { BROADCAST_TOPIC, decodeBroadcastState, sceneDriveFor } from './broadcast-state';

export type ObserverTicket = { url: string; token: string; room: string };

export type DeskObserver = {
  /** The room this observer joined — the value from the audience link. */
  readonly room: string;
  /** Audio is attached and the playback context is running. */
  audible: () => boolean;
  /**
   * Resume playback. Browsers require a user gesture before media may make
   * sound, so this belongs inside the Listen click, not in an effect.
   */
  startAudio: () => Promise<boolean>;
  stop: () => Promise<void>;
};

/** The element the broker's voice plays through — hidden, no layout, no controls. */
function sinkFor(element: HTMLMediaElement): HTMLMediaElement {
  element.dataset.claflinAudience = 'true';
  element.autoplay = true;
  element.setAttribute('aria-hidden', 'true');
  element.style.display = 'none';
  document.body.appendChild(element);
  return element;
}

export async function joinObservedRoom(ticket: ObserverTicket): Promise<DeskObserver> {
  const livekit = await import('livekit-client');
  const room = new livekit.Room({ adaptiveStream: false, dynacast: false });
  const sinks = new Map<string, HTMLMediaElement>();
  let audible = false;

  const detachAll = () => {
    for (const element of sinks.values()) element.remove();
    sinks.clear();
  };

  /* Every message is decoded on its own: a stale or hostile payload drops
     here and the observer keeps the last good state. */
  const onData = (payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) => {
    if (topic !== BROADCAST_TOPIC) return;
    const state = decodeBroadcastState(payload);
    if (!state) return;
    const event = sceneDriveFor(state);
    if (event) emitSceneDrive(event);
  };

  const onSubscribed = (track: { kind: string; sid?: string; attach: () => HTMLMediaElement }) => {
    if (track.kind !== livekit.Track.Kind.Audio) return;
    const key = track.sid ?? `${sinks.size}`;
    if (sinks.has(key)) return;
    sinks.set(key, sinkFor(track.attach()));
  };

  const onUnsubscribed = (track: { sid?: string; detach: () => HTMLMediaElement[] }) => {
    const key = track.sid ?? '';
    const element = sinks.get(key);
    if (element) {
      element.remove();
      sinks.delete(key);
    }
    try {
      for (const orphan of track.detach()) orphan.remove();
    } catch { /* the track may already be gone */ }
  };

  room.on(livekit.RoomEvent.DataReceived, onData);
  room.on(livekit.RoomEvent.TrackSubscribed, onSubscribed);
  room.on(livekit.RoomEvent.TrackUnsubscribed, onUnsubscribed);
  room.on(livekit.RoomEvent.Disconnected, () => {
    detachAll();
    audible = false;
    /* A host who drops mid-sentence would otherwise leave the mouth open
       forever. The room is over; say so on the bus. */
    emitSceneDrive({ type: 'speech-end', reason: 'disconnected' });
  });

  await room.connect(ticket.url, ticket.token);

  const startAudio = async (): Promise<boolean> => {
    try {
      await room.startAudio();
      audible = room.canPlaybackAudio;
    } catch {
      audible = false;
    }
    return audible;
  };

  /* Join is allowed to succeed unheard: some browsers permit it, some want
     the gesture. The caller reads the return and offers Listen when false. */
  await startAudio();

  return {
    room: ticket.room,
    audible: () => audible,
    startAudio,
    stop: async () => {
      detachAll();
      for (const event of [livekit.RoomEvent.DataReceived, livekit.RoomEvent.TrackSubscribed, livekit.RoomEvent.TrackUnsubscribed]) {
        try { room.off(event, event === livekit.RoomEvent.DataReceived ? onData : event === livekit.RoomEvent.TrackSubscribed ? onSubscribed : onUnsubscribed); } catch { /* already gone */ }
      }
      try { await room.disconnect(); } catch { /* the room may already be gone */ }
    },
  };
}
