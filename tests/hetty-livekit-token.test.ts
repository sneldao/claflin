import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST, livekitRoomName, mintLivekitToken } from '../app/api/hetty/livekit-token/route.ts';

function post(ip: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/hetty/livekit-token', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function decodePayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

type Grants = {
  roomJoin?: boolean;
  room?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
};

type MintBody = { url?: string; token?: string; room?: string; identity?: string; role?: string };

const ROOM = livekitRoomName();

/* The route asks LiveKit's own admin surface who is in a room. These stubs
   answer the Twirp POSTs the way LiveKit would — a room's roster is the
   only truth the cap and the session check read. */
const realFetch = globalThis.fetch;

function stubAdmin(rooms: Array<{ name: string; participants: number }>, rosters: Record<string, string[]>): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('ListRooms')) {
      return Response.json({ rooms: rooms.map(r => ({ name: r.name, num_participants: r.participants })) });
    }
    if (url.includes('ListParticipants')) {
      const room = init?.body ? (JSON.parse(String(init.body)) as { room?: string }).room : undefined;
      const list = room ? rosters[room] : undefined;
      if (!list) return new Response('room does not exist', { status: 404 });
      return Response.json({ participants: list.map(identity => ({ identity })) });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function stubAdminDown(): void {
  globalThis.fetch = (async () => { throw new Error('admin unreachable'); }) as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

function saveEnv() {
  return { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
}

function clearEnv() {
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
}

function connectEnv() {
  process.env.LIVEKIT_URL = 'wss://hetty-mix.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-long-enough';
}

function restoreEnv(saved: ReturnType<typeof saveEnv>) {
  if (saved.url === undefined) delete process.env.LIVEKIT_URL; else process.env.LIVEKIT_URL = saved.url;
  if (saved.key === undefined) delete process.env.LIVEKIT_API_KEY; else process.env.LIVEKIT_API_KEY = saved.key;
  if (saved.secret === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = saved.secret;
}

describe('/api/hetty/livekit-token unconfigured', () => {
  it('answers 503, never leaks key material, when LiveKit is not connected', async () => {
    const saved = saveEnv();
    clearEnv();
    try {
      const response = await POST(post('198.51.100.21', { role: 'host' }));
      assert.equal(response.status, 503);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.error, 'not_connected');
      assert.equal('token' in body, false);
    } finally {
      restoreEnv(saved);
    }
  });
});

describe('/api/hetty/livekit-token host', () => {
  it('mints a fresh room with publish+subscribe+data grants', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin([], {});
    try {
      const response = await POST(post('198.51.100.22', { role: 'host' }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as MintBody;
      assert.equal(body.url, 'wss://hetty-mix.livekit.cloud');
      assert.equal(body.role, 'host');
      assert.match(body.room ?? '', /^hetty-[0-9a-f-]{36}$/);
      assert.match(body.identity ?? '', /^hetty-host-anon-/);
      const payload = decodePayload(body.token as string) as {
        iss?: string; sub?: string; exp?: number; iat?: number; video?: Grants;
      };
      assert.equal(payload.iss, 'test-key');
      assert.equal(payload.sub, body.identity);
      assert.equal(payload.video?.roomJoin, true);
      assert.equal(payload.video?.room, body.room);
      assert.equal(payload.video?.canPublish, true);
      assert.equal(payload.video?.canSubscribe, true);
      assert.equal(payload.video?.canPublishData, true);
      assert.equal((payload.exp as number) - (payload.iat as number), 600);
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('never reuses a room an observer named', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin([], {});
    try {
      const response = await POST(post('198.51.100.23', { role: 'host', room: ROOM }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as MintBody;
      assert.notEqual(body.room, ROOM);
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('refuses a second host while a broadcast is live — the house has one voice', async () => {
    const saved = saveEnv();
    connectEnv();
    const other = livekitRoomName();
    stubAdmin(
      [{ name: other, participants: 3 }],
      { [other]: ['hetty-host-u9', 'hetty-observer-a', 'hetty-observer-b'] },
    );
    try {
      const response = await POST(post('198.51.100.28', { role: 'host' }));
      assert.equal(response.status, 409);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'session_active');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('lets a host ring past a room that holds only listeners — a stale link is not a session', async () => {
    const saved = saveEnv();
    connectEnv();
    const zombie = livekitRoomName();
    stubAdmin(
      [{ name: zombie, participants: 2 }],
      { [zombie]: ['hetty-observer-a', 'hetty-observer-b'] },
    );
    try {
      const response = await POST(post('198.51.100.29', { role: 'host' }));
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as MintBody).role, 'host');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('mints a host token when the room list cannot be read — the admin surface is advisory', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdminDown();
    try {
      const response = await POST(post('198.51.100.30', { role: 'host' }));
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as MintBody).role, 'host');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });
});

describe('/api/hetty/livekit-token observer', () => {
  it('mints subscribe-only grants for the room it was given', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin(
      [{ name: ROOM, participants: 1 }],
      { [ROOM]: ['hetty-host-u9'] },
    );
    try {
      const response = await POST(post('198.51.100.24', { role: 'observer', room: ROOM }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as MintBody;
      assert.equal(body.role, 'observer');
      assert.equal(body.room, ROOM);
      assert.match(body.identity ?? '', /^hetty-observer-anon-/);
      const payload = decodePayload(body.token as string) as { video?: Grants };
      assert.equal(payload.video?.room, ROOM);
      assert.equal(payload.video?.roomJoin, true);
      assert.equal(payload.video?.canSubscribe, true);
      assert.equal(payload.video?.canPublish, false);
      assert.equal(payload.video?.canPublishData, false);
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('refuses an unnamed room rather than guessing one', async () => {
    const saved = saveEnv();
    connectEnv();
    try {
      for (const body of [undefined, {}, { role: 'observer' }]) {
        const response = await POST(post('198.51.100.25', body));
        assert.equal(response.status, 400);
        assert.equal(((await response.json()) as Record<string, unknown>).error, 'room_required');
      }
    } finally {
      restoreEnv(saved);
    }
  });

  it('refuses an unknown role instead of granting publish', async () => {
    const saved = saveEnv();
    connectEnv();
    try {
      const response = await POST(post('198.51.100.26', { role: 'publisher', room: ROOM }));
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'invalid_role');
    } finally {
      restoreEnv(saved);
    }
  });

  it('refuses a room name that is not one of ours', async () => {
    const saved = saveEnv();
    connectEnv();
    try {
      const response = await POST(post('198.51.100.27', { role: 'observer', room: 'hetty-prod' }));
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'invalid_room');
    } finally {
      restoreEnv(saved);
    }
  });

  it('refuses a room the server cannot see — a stale link is not a broadcast', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin([], {});
    try {
      const response = await POST(post('198.51.100.31', { role: 'observer', room: ROOM }));
      assert.equal(response.status, 409);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'room_not_open');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('refuses a room whose host already left — listeners alone are not a show', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin(
      [{ name: ROOM, participants: 2 }],
      { [ROOM]: ['hetty-observer-a', 'hetty-observer-b'] },
    );
    try {
      const response = await POST(post('198.51.100.32', { role: 'observer', room: ROOM }));
      assert.equal(response.status, 409);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'room_not_open');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('refuses a seat when the audience is full', async () => {
    const saved = saveEnv();
    connectEnv();
    const cap = process.env.HETTY_OBSERVER_CAP;
    process.env.HETTY_OBSERVER_CAP = '2';
    stubAdmin(
      [{ name: ROOM, participants: 3 }],
      { [ROOM]: ['hetty-host-u9', 'hetty-observer-a', 'hetty-observer-b'] },
    );
    try {
      const response = await POST(post('198.51.100.33', { role: 'observer', room: ROOM }));
      assert.equal(response.status, 409);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'room_full');
    } finally {
      if (cap === undefined) delete process.env.HETTY_OBSERVER_CAP; else process.env.HETTY_OBSERVER_CAP = cap;
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('admits a listener when the room list cannot be read — the admin surface is advisory', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdminDown();
    try {
      const response = await POST(post('198.51.100.34', { role: 'observer', room: ROOM }));
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as MintBody).role, 'observer');
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });
});

describe('mintLivekitToken', () => {
  it('signs HS256 over header.payload and honours ttl/now overrides', () => {
    const token = mintLivekitToken({
      apiKey: 'k', apiSecret: 's', identity: 'hetty-host-u1', room: 'hetty-r1', role: 'host',
      ttlSeconds: 60, nowSeconds: 1_700_000_000,
    });
    const [header, payload, signature] = token.split('.');
    const expected = createHmac('sha256', 's').update(`${header}.${payload}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.equal(signature, expected);
    const claims = decodePayload(token) as { exp?: number; iat?: number };
    assert.equal(claims.iat, 1_700_000_000);
    assert.equal(claims.exp, 1_700_000_060);
  });

  it('carries publish rights only for the host role', () => {
    const base = { apiKey: 'k', apiSecret: 's', identity: 'i', room: 'hetty-r1' };
    const host = decodePayload(mintLivekitToken({ ...base, role: 'host' })) as { video: Grants };
    const observer = decodePayload(mintLivekitToken({ ...base, role: 'observer' })) as { video: Grants };
    assert.equal(host.video.canPublish, true);
    assert.equal(host.video.canPublishData, true);
    assert.equal(observer.video.canPublish, false);
    assert.equal(observer.video.canPublishData, false);
    assert.equal(observer.video.canSubscribe, true);
  });

  it('mints unique single-use rooms', () => {
    const rooms = new Set([livekitRoomName(), livekitRoomName(), livekitRoomName()]);
    assert.equal(rooms.size, 3);
  });
});
