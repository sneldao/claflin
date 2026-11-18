import { createHmac } from 'node:crypto';
import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';
import { accountFromRequest } from '@/lib/auth';
import { isLivekitRoomName, livekitRoomName } from '@/lib/hetty/room-name';
import {
  HOST_IDENTITY_PREFIX,
  OBSERVER_IDENTITY_PREFIX,
  listRoomParticipants,
  listRooms,
  liveBroadcasts,
} from '@/lib/hetty/livekit-admin';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hetty/livekit-token
 *
 * Phase B slice 1: mints a short-lived LiveKit access token so the
 * caller's browser can join a per-broadcast room. The API key/secret
 * stay server-side; the browser only ever sees the 10-minute JWT.
 *
 * Two roles, least privilege by default:
 *   { role: "host" }      → fresh room, may publish audio + data
 *   { role: "observer", room } → that room, subscribe-only
 *
 * Observers must name the room they are joining (the name is the
 * broadcast link — unguessable `hetty-<uuid>`), and a missing role is
 * an observer: a caller never gets publish rights by omitting a field.
 * Read-only is enforced in the signature, not in the observer's client
 * code, so a modified observer page still cannot publish.
 *
 * The host's room is always minted here and single-use per ring; an
 * existing room is never reused for a new host, so a stale link cannot
 * be revived into a live microphone. Two bounds ride on the same mint:
 * the house carries one broadcast at a time (a second host ring is 409),
 * and an observer joins only a room that exists with a host in it, up
 * to the observer cap — both read from LiveKit's own admin surface, and
 * both advisory: when the room list cannot be read the mint proceeds.
 *
 * Mirrors /api/hetty/session's budget posture (instance + per-user /
 * per-anon-IP), with a second, wider instance budget for observers —
 * the audience is many and each join mints one token. Answers 503 when
 * LiveKit is not connected on this deployment; the client then stays on
 * the ElevenLabs line.
 *
 * The token is minted by hand (HMAC-SHA256 over the standard LiveKit
 * JWT claims) so Phase B needs no new dependency until the host-side
 * publish path lands; the claim shape matches livekit-server-sdk's
 * AccessToken with roomJoin + publish/subscribe + data grants.
 */

export type LivekitRole = 'host' | 'observer';

/** Host rings are the rare, privileged event. */
const hostInstanceBudget = requestBudget(12);
const hostAnonIpBudget = keyedBudget(3);
const hostUserBudget = keyedBudget(5);

/** Observers join the broadcast; the cap is the room cap, not this. */
const observerInstanceBudget = requestBudget(240);
const observerAnonIpBudget = keyedBudget(12);
const observerUserBudget = keyedBudget(20);

/**
 * How many listeners a room carries before a join is refused. The egress
 * bill grows per observer, and a room that reads as packed is kinder than
 * one that degrades silently — the cap is a posted limit, not a queue.
 */
function observerCap(): number {
  const raw = Number(process.env.HETTY_OBSERVER_CAP);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 48;
}

/* Room names live in lib/hetty/room-name.ts so the audience client applies
   exactly the same check the server does. Re-exported here because this
   route is where the pattern is enforced and where the tests look. */
export { livekitRoomName, isLivekitRoomName } from '@/lib/hetty/room-name';

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mintLivekitToken(args: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  room: string;
  role: LivekitRole;
  ttlSeconds?: number;
  nowSeconds?: number;
}): string {
  const ttl = args.ttlSeconds ?? 600;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const canPublish = args.role === 'host';
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        iss: args.apiKey,
        sub: args.identity,
        iat: now,
        nbf: now,
        exp: now + ttl,
        video: {
          roomJoin: true,
          room: args.room,
          canPublish,
          canSubscribe: true,
          canPublishData: canPublish,
        },
      }),
    ),
  );
  const signature = base64url(createHmac('sha256', args.apiSecret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

type ParsedAsk =
  | { ok: true; role: LivekitRole; room: string | null }
  | { ok: false; error: string; message: string };

async function parseAsk(req: NextRequest): Promise<ParsedAsk> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const rawRole = record.role;
  if (rawRole !== undefined && rawRole !== 'host' && rawRole !== 'observer') {
    return { ok: false, error: 'invalid_role', message: 'Role must be "host" or "observer".' };
  }
  const role: LivekitRole = rawRole === 'host' ? 'host' : 'observer';

  const rawRoom = record.room;
  if (rawRoom !== undefined && typeof rawRoom !== 'string') {
    return { ok: false, error: 'invalid_room', message: 'Room must be a broadcast room name.' };
  }
  if (typeof rawRoom === 'string' && !isLivekitRoomName(rawRoom)) {
    return { ok: false, error: 'invalid_room', message: 'Room must be a broadcast room name.' };
  }

  if (role === 'observer' && typeof rawRoom !== 'string') {
    return { ok: false, error: 'room_required', message: 'Observers must name the room they are joining.' };
  }

  return { ok: true, role, room: typeof rawRoom === 'string' ? rawRoom : null };
}

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  let userId: string | null = null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized', message: 'Sign in again to join Hetty’s room.' }, { status: 401, headers });
  }

  const ask = await parseAsk(req);
  if (!ask.ok) {
    return Response.json({ error: ask.error, message: ask.message }, { status: 400, headers });
  }
  const { role } = ask;

  const instanceBudget = role === 'host' ? hostInstanceBudget : observerInstanceBudget;
  const anonIpBudget = role === 'host' ? hostAnonIpBudget : observerAnonIpBudget;
  const userBudget = role === 'host' ? hostUserBudget : observerUserBudget;

  if (!instanceBudget()) {
    return busyResponse('Too many call requests. Please wait a moment.');
  }
  const allowed = userId ? userBudget(`user:${userId}`) : anonIpBudget(clientKeyFromRequest(req));
  if (!allowed) {
    return busyResponse('Too many call requests. Please wait a moment.');
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return Response.json({ error: 'not_connected', message: 'Hetty’s room is not connected on this deployment.' }, { status: 503, headers });
  }

  const admin = { url, apiKey, apiSecret };

  /* The house has one voice. A second host ring while a broadcast is live
     is refused outright — never joined into the room to share it. An
     unreadable room list does not block: the admin surface is advisory. */
  if (role === 'host') {
    const live = await liveBroadcasts(admin);
    if (live && live.length > 0) {
      return Response.json(
        { error: 'session_active', message: 'The desk is already live. The broadcast is one room at a time.' },
        { status: 409, headers },
      );
    }
  } else {
    const room = ask.room as string;
    /* A dead link must not mint a seat in an empty room: the room list is
       definitive on existence, the roster on whether a host is present —
       observer-only zombie rooms are not the desk. Both admin reads are
       advisory: unreachable means allow, and LiveKit refuses what it must. */
    const [rooms, parts] = await Promise.all([
      listRooms(admin),
      listRoomParticipants(admin, room),
    ]);
    const roomExists = rooms === null ? null : rooms.some(entry => entry.name === room);
    const hostPresent = parts === null ? null : parts.some(p => p.identity.startsWith(HOST_IDENTITY_PREFIX));
    if (roomExists === false || hostPresent === false) {
      return Response.json(
        { error: 'room_not_open', message: 'The desk is not open right now.' },
        { status: 409, headers },
      );
    }
    if (parts !== null) {
      const seated = parts.filter(p => !p.identity.startsWith(HOST_IDENTITY_PREFIX)).length;
      if (seated >= observerCap()) {
        return Response.json(
          { error: 'room_full', message: 'The room is full. Try again shortly — listeners come and go.' },
          { status: 409, headers },
        );
      }
    }
  }

  const identity = role === 'host'
    ? (userId ? `${HOST_IDENTITY_PREFIX}${userId}` : `${HOST_IDENTITY_PREFIX}anon-${crypto.randomUUID().slice(0, 8)}`)
    : (userId ? `${OBSERVER_IDENTITY_PREFIX}${userId}` : `${OBSERVER_IDENTITY_PREFIX}anon-${crypto.randomUUID().slice(0, 8)}`);

  // Hosts always get a fresh room; observers only ever join one that was named.
  const room = role === 'host' ? livekitRoomName() : (ask.room as string);
  const token = mintLivekitToken({ apiKey, apiSecret, identity, room, role });
  return Response.json({ url, token, room, identity, role }, { headers });
}
