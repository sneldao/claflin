import { createHmac } from 'node:crypto';
import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';
import { accountFromRequest } from '@/lib/auth';
import { isLivekitRoomName, livekitRoomName } from '@/lib/hetty/room-name';
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
 * be revived into a live microphone.
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

  const identity = role === 'host'
    ? (userId ? `hetty-host-${userId}` : `hetty-host-anon-${crypto.randomUUID().slice(0, 8)}`)
    : (userId ? `hetty-observer-${userId}` : `hetty-observer-anon-${crypto.randomUUID().slice(0, 8)}`);

  // Hosts always get a fresh room; observers only ever join one that was named.
  const room = role === 'host' ? livekitRoomName() : (ask.room as string);
  const token = mintLivekitToken({ apiKey, apiSecret, identity, room, role });
  return Response.json({ url, token, room, identity, role }, { headers });
}
