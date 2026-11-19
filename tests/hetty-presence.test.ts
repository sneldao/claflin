import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/hetty/presence/route';
import {
  HOST_IDENTITY_PREFIX,
  OBSERVER_IDENTITY_PREFIX,
  listRooms,
  liveBroadcasts,
  livekitHttpUrl,
  mintAdminToken,
} from '../lib/hetty/livekit-admin';
import { formatBroadcastWindow, nextBroadcastWindow, type BroadcastWindow } from '../lib/hetty/desk-hours';
import { livekitRoomName } from '../lib/hetty/room-name';
import { HETTY_BROADCAST_MAX_MS } from '../lib/hetty/broadcast-flags';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const ADMIN = { url: 'wss://hetty-mix.livekit.cloud', apiKey: 'k', apiSecret: 's' };
const ROOM = livekitRoomName();

const realFetch = globalThis.fetch;

/** Answers the Twirp POSTs the admin client makes, LiveKit-style. */
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

function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

function saveEnv() {
  return { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
}

function restoreEnv(saved: ReturnType<typeof saveEnv>) {
  for (const [k, v] of [['LIVEKIT_URL', saved.url], ['LIVEKIT_API_KEY', saved.key], ['LIVEKIT_API_SECRET', saved.secret]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

function connectEnv() {
  process.env.LIVEKIT_URL = ADMIN.url;
  process.env.LIVEKIT_API_KEY = ADMIN.apiKey;
  process.env.LIVEKIT_API_SECRET = ADMIN.apiSecret;
}

function clearEnv() {
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('livekitHttpUrl', () => {
  it('speaks HTTP where LiveKit speaks websockets — same origin, other scheme', () => {
    assert.equal(livekitHttpUrl('wss://hetty-mix.livekit.cloud'), 'https://hetty-mix.livekit.cloud');
    assert.equal(livekitHttpUrl('ws://localhost:7880'), 'http://localhost:7880');
    assert.equal(livekitHttpUrl('https://hetty-mix.livekit.cloud'), 'https://hetty-mix.livekit.cloud');
  });

  it('refuses a URL that is not one of those schemes', () => {
    assert.equal(livekitHttpUrl('ftp://hetty-mix.livekit.cloud'), null);
    assert.equal(livekitHttpUrl('not a url'), null);
  });
});

describe('mintAdminToken', () => {
  it('scopes a roomAdmin grant to one room for the roster read', () => {
    const token = mintAdminToken({ apiKey: 'k', apiSecret: 's', room: ROOM, nowSeconds: 1_700_000_000 });
    const payload = decodePayload(token) as { video?: Record<string, unknown> };
    assert.equal(payload.video?.room, ROOM);
    assert.equal(payload.video?.roomAdmin, true);
    assert.equal(payload.video?.roomList, undefined);
  });

  it('carries roomList for the enumeration read', () => {
    const token = mintAdminToken({ apiKey: 'k', apiSecret: 's', roomList: true });
    const payload = decodePayload(token) as { video?: Record<string, unknown> };
    assert.equal(payload.video?.roomList, true);
    assert.equal(payload.video?.room, undefined);
  });
});

describe('liveBroadcasts', () => {
  it('counts a room live only when a host is in it', async () => {
    stubAdmin(
      [{ name: ROOM, participants: 3 }],
      { [ROOM]: [`${HOST_IDENTITY_PREFIX}u9`, `${OBSERVER_IDENTITY_PREFIX}a`, `${OBSERVER_IDENTITY_PREFIX}b`] },
    );
    try {
      const live = await liveBroadcasts(ADMIN);
      assert.deepEqual(live, [{ room: ROOM, listening: 2 }]);
    } finally {
      restoreFetch();
    }
  });

  it('does not light the lamp for a room of listeners whose host is gone', async () => {
    stubAdmin(
      [{ name: ROOM, participants: 2 }],
      { [ROOM]: [`${OBSERVER_IDENTITY_PREFIX}a`, `${OBSERVER_IDENTITY_PREFIX}b`] },
    );
    try {
      assert.deepEqual(await liveBroadcasts(ADMIN), []);
    } finally {
      restoreFetch();
    }
  });

  it('skips rooms that are not ours and empty rooms entirely', async () => {
    stubAdmin(
      [{ name: 'someone-elses-room', participants: 4 }, { name: ROOM, participants: 0 }],
      { 'someone-elses-room': [`${HOST_IDENTITY_PREFIX}x`] },
    );
    try {
      assert.deepEqual(await liveBroadcasts(ADMIN), []);
    } finally {
      restoreFetch();
    }
  });

  it('answers null when the room list cannot be read — unknown, not closed', async () => {
    globalThis.fetch = (async () => { throw new Error('admin unreachable'); }) as typeof fetch;
    try {
      assert.equal(await liveBroadcasts(ADMIN), null);
      assert.equal(await listRooms(ADMIN), null);
    } finally {
      restoreFetch();
    }
  });
});

describe('/api/hetty/presence', () => {
  it('answers unknown when LiveKit is not connected — never guesses open', async () => {
    const saved = saveEnv();
    clearEnv();
    try {
      const body = (await (await GET()).json()) as { state?: string };
      assert.equal(body.state, 'unknown');
    } finally {
      restoreEnv(saved);
    }
  });

  /* The route caches its answer for 15s per instance, so one process gets
     one admin-backed read: the open case is the one that carries data. The
     closed and unreachable branches are covered at liveBroadcasts above,
     and the mapping between them is asserted from source below. */
  it('answers open with the room and how many are listening', async () => {
    const saved = saveEnv();
    connectEnv();
    stubAdmin(
      [{ name: ROOM, participants: 3 }],
      { [ROOM]: [`${HOST_IDENTITY_PREFIX}u9`, `${OBSERVER_IDENTITY_PREFIX}a`, `${OBSERVER_IDENTITY_PREFIX}b`] },
    );
    try {
      const body = (await (await GET()).json()) as { state?: string; room?: string; listening?: number };
      assert.equal(body.state, 'open');
      assert.equal(body.room, ROOM);
      assert.equal(body.listening, 2);
    } finally {
      restoreEnv(saved);
      restoreFetch();
    }
  });

  it('keeps the three states distinct and caches the answer briefly', () => {
    const route = source('app/api/hetty/presence/route.ts');
    assert.match(route, /state: 'unknown'/);
    assert.match(route, /state: 'closed'/);
    assert.match(route, /state: 'open'/);
    assert.match(route, /live === null/, 'an unreadable list is unknown, not closed');
    assert.match(route, /CACHE_MS/, 'a crowded front page must not hammer the admin API');
    assert.match(route, /no-store/, 'the response itself is never cached downstream');
  });
});

describe('desk hours', () => {
  const marathon: BroadcastWindow = {
    label: 'the launch marathon',
    opensAt: '2026-11-28T15:00:00Z',
    closesAt: '2026-11-28T21:00:00Z',
  };
  const later: BroadcastWindow = {
    label: 'the december sitting',
    opensAt: '2026-12-05T15:00:00Z',
    closesAt: '2026-12-05T18:00:00Z',
  };

  it('picks the next sitting that has not fully passed', () => {
    const before = Date.parse('2026-11-27T00:00:00Z');
    assert.deepEqual(nextBroadcastWindow(before, [later, marathon]), marathon);
    const during = Date.parse('2026-11-28T18:00:00Z');
    assert.deepEqual(nextBroadcastWindow(during, [later, marathon]), marathon);
    const after = Date.parse('2026-11-29T00:00:00Z');
    assert.deepEqual(nextBroadcastWindow(after, [later, marathon]), later);
  });

  it('answers null when every posted sitting has passed or none is posted', () => {
    const after = Date.parse('2027-01-01T00:00:00Z');
    assert.equal(nextBroadcastWindow(after, [marathon, later]), null);
    assert.equal(nextBroadcastWindow(after, []), null);
  });

  it('ignores a malformed entry rather than posting nonsense hours', () => {
    const bad = { label: 'typo', opensAt: 'not a date', closesAt: 'also not' } as BroadcastWindow;
    const before = Date.parse('2026-11-27T00:00:00Z');
    assert.deepEqual(nextBroadcastWindow(before, [bad, marathon]), marathon);
  });

  it('prints a sitting the way the sheet would', () => {
    assert.equal(formatBroadcastWindow(marathon), 'the launch marathon · Nov 28');
  });
});

describe('the broadcast session cap', () => {
  it('defaults to six hours and is configurable by env', () => {
    assert.equal(HETTY_BROADCAST_MAX_MS, 360 * 60_000);
    assert.match(source('lib/hetty/broadcast-flags.ts'), /NEXT_PUBLIC_HETTY_BROADCAST_MAX_MINUTES/);
  });

  it('ends the call the deliberate way when the cap fires', () => {
    const session = source('components/desk/HettyCallSession.tsx');
    assert.match(session, /capTimerRef\.current = setTimeout/);
    assert.match(session, /endCallRef\.current\?\.\(\)/, 'the cap runs the same end as the button');
    assert.match(session, /stopBroadcast\('closed'\)/, 'an ended call tells the room it closed');
    assert.match(session, /stopBroadcast\('disconnected'\)/, 'a failed line reports the drop');
    assert.match(session, /clearTimeout\(capTimerRef\.current\)/, 'a stopped broadcast clears its cap');
  });

  it('publishes the ending before disconnecting', () => {
    const broadcast = source('lib/hetty/broadcast.ts');
    const close = broadcast.indexOf('const close = async');
    const publish = broadcast.indexOf('publishData', close);
    const stop = broadcast.indexOf('await stop()', close);
    assert.ok(close > -1 && publish > close && stop > publish, 'the room hears the ending first');
    assert.match(broadcast, /reliable: true/);
  });
});
