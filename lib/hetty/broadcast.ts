/**
 * Host broadcast — republishing the broker's voice into the house's own
 * LiveKit room, and putting scene state on its data channel.
 *
 * Deliberate off-label use, isolated here: `Conversation.connection` is
 * `protected` in @elevenlabs/client, so reaching `getRoom()` is a compile-time
 * violation that works at runtime. Two consequences, both accepted:
 *   · `@elevenlabs/react` / `@elevenlabs/client` are pinned in package.json;
 *   · this file is the only place that knows. If an upgrade closes the door,
 *     the failure is `agent_room_unavailable` from one module, not a hunt.
 *
 * The republished track is the agent's own RemoteAudioTrack — no decode, no
 * re-synthesis, no tab capture. The host's microphone is never published, so
 * observers hear the broker and not the room.
 *
 * Nothing here authorizes anything: a broadcast can move a camera, aim a lamp
 * or carry a mouth shape. It cannot sign, submit or record.
 */

'use client';

import {
  BROADCAST_TOPIC,
  encodeBroadcastState,
  type BroadcastState,
} from './broadcast-state';

type Livekit = typeof import('livekit-client');
type Room = import('livekit-client').Room;
type RemoteTrack = import('livekit-client').RemoteTrack;

export type BroadcastTicket = { url: string; token: string; room: string };

export type HostBroadcast = {
  /** Room observers join — the operator shares this, nothing else. */
  readonly room: string;
  /** Whether the agent's room was reached; audio may still arrive later. */
  attached: () => boolean;
  /** Wire the agent's room. False when the SDK shape moved. */
  attach: (conversation: unknown) => boolean;
  /** Publish one scene-state message. Never throws. */
  send: (state: BroadcastState) => void;
  stop: () => Promise<void>;
};

/**
 * The agent's own LiveKit room, via the ElevenLabs connection. The one
 * off-label read in the codebase — see the module note.
 */
export function agentRoomOf(conversation: unknown): Room | null {
  const connection = (conversation as { connection?: { getRoom?: () => unknown } } | null)?.connection;
  if (!connection || typeof connection.getRoom !== 'function') return null;
  try {
    const room = connection.getRoom();
    return room && typeof (room as Room).on === 'function' ? (room as Room) : null;
  } catch {
    return null;
  }
}

/**
 * Join the house room before the session starts, so the broker's first word
 * is not lost while we connect. Audio is attached once the conversation
 * exists and the agent's track subscribes.
 */
export async function openHostBroadcast(ticket: BroadcastTicket): Promise<HostBroadcast> {
  const livekit: Livekit = await import('livekit-client');
  const out = new livekit.Room({ adaptiveStream: false, dynacast: false });
  await out.connect(ticket.url, ticket.token);

  const published = new Set<string>();
  let attachedToAgentRoom = false;
  let agentRoom: Room | null = null;
  let detach: (() => void) | null = null;

  const publishAudio = async (track: RemoteTrack | undefined): Promise<void> => {
    if (!track || track.kind !== 'audio') return;
    const media = track.mediaStreamTrack;
    if (!media || published.has(media.id)) return;
    published.add(media.id);
    try {
      await out.localParticipant.publishTrack(media, {
        name: 'hetty-voice',
        source: livekit.Track.Source.Microphone,
      });
    } catch {
      published.delete(media.id);
    }
  };

  const attach = (conversation: unknown): boolean => {
    const source = agentRoomOf(conversation);
    if (!source) return false;
    agentRoom = source;
    attachedToAgentRoom = true;

    const onSubscribed = (track: RemoteTrack) => { void publishAudio(track); };
    const onUnsubscribed = (track: RemoteTrack) => {
      const media = track?.mediaStreamTrack;
      if (!media) return;
      published.delete(media.id);
      for (const publication of out.localParticipant.trackPublications.values()) {
        if (publication.track?.mediaStreamTrack?.id === media.id) {
          void out.localParticipant.unpublishTrack(publication.track).catch(() => undefined);
        }
      }
    };

    source.on(livekit.RoomEvent.TrackSubscribed, onSubscribed);
    source.on(livekit.RoomEvent.TrackUnsubscribed, onUnsubscribed);
    detach = () => {
      try { source.off(livekit.RoomEvent.TrackSubscribed, onSubscribed); } catch { /* already gone */ }
      try { source.off(livekit.RoomEvent.TrackUnsubscribed, onUnsubscribed); } catch { /* already gone */ }
    };

    /* The agent may have subscribed before we asked; publish what exists. */
    for (const participant of source.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.isSubscribed && publication.track) {
          void publishAudio(publication.track as RemoteTrack);
        }
      }
    }
    return true;
  };

  const send = (state: BroadcastState): void => {
    try {
      void out.localParticipant
        .publishData(encodeBroadcastState(state), { reliable: true, topic: BROADCAST_TOPIC })
        .catch(() => undefined);
    } catch { /* a dropped state message must not break the call */ }
  };

  const stop = async (): Promise<void> => {
    detach?.();
    detach = null;
    agentRoom = null;
    try { await out.disconnect(); } catch { /* the call is over; the room may already be gone */ }
  };

  return { room: ticket.room, attached: () => attachedToAgentRoom, attach, send, stop };
}
