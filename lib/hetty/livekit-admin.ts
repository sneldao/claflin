/**
 * LiveKit's admin surface, over plain HTTP.
 *
 * The token route mints its own JWTs by hand, so this deliberately does not
 * pull in livekit-server-sdk: the calls we need are Twirp POSTs, and the
 * grants are the same HMAC shape we already sign. Keeping it here means the
 * server bundle grows by one small module, not a second SDK.
 *
 * Everything in this file is advisory: a list, a count, and `null` whenever
 * the question cannot be answered. The caller decides whether silence means
 * "allow" or "refuse" — for an audience, an admin outage must not lock people
 * out of a room that is working perfectly well.
 */

import { createHmac } from 'node:crypto';
import { isLivekitRoomName } from './room-name';

/**
 * The identity prefixes the token route writes into every grant. An admin
 * listing uses them to tell the broadcaster from the crowd — the only
 * definition of "the desk is live" that survives zombie rooms.
 */
export const HOST_IDENTITY_PREFIX = 'hetty-host-';
export const OBSERVER_IDENTITY_PREFIX = 'hetty-observer-';

/** LiveKit serves HTTP where it serves websockets — same origin, other scheme. */
export function livekitHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    else if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * An admin grant, shaped to the call it signs. `room` scopes a roomAdmin
 * grant to one room (ListParticipants); `roomList` enumerates rooms
 * (ListRooms). Short-lived on purpose.
 */
export function mintAdminToken(args: {
  apiKey: string;
  apiSecret: string;
  room?: string;
  roomList?: boolean;
  ttlSeconds?: number;
  nowSeconds?: number;
}): string {
  const ttl = args.ttlSeconds ?? 120;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const video: Record<string, unknown> = {};
  if (args.room) {
    video.room = args.room;
    video.roomAdmin = true;
  }
  if (args.roomList) video.roomList = true;
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        iss: args.apiKey,
        sub: args.apiKey,
        iat: now,
        nbf: now,
        exp: now + ttl,
        video,
      }),
    ),
  );
  const signature = base64url(createHmac('sha256', args.apiSecret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

export type AdminKey = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

/** One Twirp call. Returns the parsed body, or null on any failure. */
async function twirp<T>(
  args: AdminKey,
  grant: { room?: string; roomList?: boolean },
  method: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  const base = livekitHttpUrl(args.url);
  if (!base) return null;
  const token = mintAdminToken({ apiKey: args.apiKey, apiSecret: args.apiSecret, ...grant });
  try {
    const response = await fetch(`${base}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type RoomSummary = { name: string; participants: number };

/** Every room LiveKit currently knows, or null when we cannot tell. */
export async function listRooms(args: AdminKey): Promise<RoomSummary[] | null> {
  const body = await twirp<{ rooms?: unknown }>(args, { roomList: true }, 'ListRooms', {});
  if (!body || !Array.isArray(body.rooms)) return null;
  const rooms: RoomSummary[] = [];
  for (const entry of body.rooms as Record<string, unknown>[]) {
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (!name) continue;
    rooms.push({ name, participants: Number(entry.num_participants ?? entry.numParticipants ?? 0) });
  }
  return rooms;
}

export type RoomParticipant = { identity: string };

/** Who is in one room, or null when we cannot tell. */
export async function listRoomParticipants(args: AdminKey, room: string): Promise<RoomParticipant[] | null> {
  const body = await twirp<{ participants?: unknown }>(args, { room }, 'ListParticipants', { room });
  if (!body || !Array.isArray(body.participants)) return null;
  return (body.participants as Record<string, unknown>[]).map(entry => ({
    identity: typeof entry.identity === 'string' ? entry.identity : '',
  }));
}

export type LiveBroadcast = {
  room: string;
  /** Everyone in the room who is not the host. */
  listening: number;
};

/**
 * Which of the house's rooms have a live host — the only rooms that count
 * as a broadcast. A room full of listeners with no host is a stale link
 * somebody still has open, not a desk that is open, and it must never
 * light the presence lamp.
 *
 * Null when the room list itself cannot be read: callers treat that as
 * "unknown", never as proof the desk is dark.
 */
export async function liveBroadcasts(args: AdminKey): Promise<LiveBroadcast[] | null> {
  const rooms = await listRooms(args);
  if (!rooms) return null;
  const live: LiveBroadcast[] = [];
  for (const room of rooms) {
    if (!isLivekitRoomName(room.name) || room.participants === 0) continue;
    const parts = await listRoomParticipants(args, room.name);
    /* Advisory: an unreadable roster is skipped, not counted as hostless. */
    if (!parts) continue;
    const hosts = parts.filter(p => p.identity.startsWith(HOST_IDENTITY_PREFIX)).length;
    if (hosts > 0) live.push({ room: room.name, listening: parts.length - hosts });
  }
  return live;
}
