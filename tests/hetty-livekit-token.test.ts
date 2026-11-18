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
    }
  });

  it('never reuses a room an observer named', async () => {
    const saved = saveEnv();
    connectEnv();
    try {
      const response = await POST(post('198.51.100.23', { role: 'host', room: ROOM }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as MintBody;
      assert.notEqual(body.room, ROOM);
    } finally {
      restoreEnv(saved);
    }
  });
});

describe('/api/hetty/livekit-token observer', () => {
  it('mints subscribe-only grants for the room it was given', async () => {
    const saved = saveEnv();
    connectEnv();
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
