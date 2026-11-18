import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/hetty/session/route.ts';

type Capture = { url: string; headers: Record<string, string> };

function post(ip: string, transport?: 'webrtc'): NextRequest {
  const url = transport
    ? `http://localhost:3000/api/hetty/session?transport=${transport}`
    : 'http://localhost:3000/api/hetty/session';
  return new NextRequest(url, { method: 'POST', headers: { 'x-forwarded-for': ip } });
}

function saveEnv() {
  return {
    key: process.env.ELEVENLABS_API_KEY,
    agent: process.env.ELEVENLABS_AGENT_HETTY,
    fetch: globalThis.fetch,
  };
}

function restoreEnv(saved: ReturnType<typeof saveEnv>) {
  if (saved.key === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = saved.key;
  if (saved.agent === undefined) delete process.env.ELEVENLABS_AGENT_HETTY; else process.env.ELEVENLABS_AGENT_HETTY = saved.agent;
  globalThis.fetch = saved.fetch;
}

function connectEnv() {
  process.env.ELEVENLABS_API_KEY = 'xi-test-key';
  process.env.ELEVENLABS_AGENT_HETTY = 'agent_hetty';
}

describe('/api/hetty/session unconfigured', () => {
  it('answers 503 without reaching ElevenLabs', async () => {
    const saved = saveEnv();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_AGENT_HETTY;
    let called = 0;
    globalThis.fetch = (async () => { called += 1; return new Response('{}'); }) as typeof fetch;
    try {
      const response = await POST(post('203.0.113.10'));
      assert.equal(response.status, 503);
      assert.equal(((await response.json()) as Record<string, unknown>).error, 'not_connected');
      assert.equal(called, 0);
    } finally {
      restoreEnv(saved);
    }
  });
});

describe('/api/hetty/session transports', () => {
  it('mints a signed URL by default, keeping the key server-side', async () => {
    const saved = saveEnv();
    connectEnv();
    let seen: Capture | null = null;
    globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
      seen = { url: String(input), headers: init?.headers ?? {} };
      return new Response(JSON.stringify({ signed_url: 'wss://signed' }), { status: 200 });
    }) as typeof fetch;
    try {
      const response = await POST(post('203.0.113.11'));
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.signedUrl, 'wss://signed');
      assert.equal('conversationToken' in body, false);
      assert.match(seen!.url, /\/convai\/conversation\/get-signed-url\?agent_id=agent_hetty$/);
      assert.equal(seen!.headers['xi-api-key'], 'xi-test-key');
      assert.equal(JSON.stringify(body).includes('xi-test-key'), false);
    } finally {
      restoreEnv(saved);
    }
  });

  it('mints a WebRTC conversation token when asked', async () => {
    const saved = saveEnv();
    connectEnv();
    let seenUrl = '';
    globalThis.fetch = (async (input: unknown) => {
      seenUrl = String(input);
      return new Response(JSON.stringify({ token: 'conv-token', conversation_id: 'conv_1' }), { status: 200 });
    }) as typeof fetch;
    try {
      const response = await POST(post('203.0.113.12', 'webrtc'));
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.conversationToken, 'conv-token');
      assert.equal('signedUrl' in body, false);
      assert.match(seenUrl, /\/convai\/conversation\/token\?agent_id=agent_hetty$/);
    } finally {
      restoreEnv(saved);
    }
  });

  it('answers 502 and leaks nothing when the token endpoint fails', async () => {
    const saved = saveEnv();
    connectEnv();
    globalThis.fetch = (async () =>
      new Response('upstream said no: key xi-test-key', { status: 500 })) as typeof fetch;
    try {
      const response = await POST(post('203.0.113.13', 'webrtc'));
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.equal(text.includes('xi-test-key'), false);
      assert.equal((JSON.parse(text) as Record<string, unknown>).error, 'line_unavailable');
    } finally {
      restoreEnv(saved);
    }
  });

  it('answers 502 when the token endpoint returns no token', async () => {
    const saved = saveEnv();
    connectEnv();
    globalThis.fetch = (async () => new Response(JSON.stringify({ token: '' }), { status: 200 })) as typeof fetch;
    try {
      const response = await POST(post('203.0.113.14', 'webrtc'));
      assert.equal(response.status, 502);
    } finally {
      restoreEnv(saved);
    }
  });
});
