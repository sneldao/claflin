import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as paperGet } from '../app/api/paper/route.ts';
import { POST as dictationPost } from '../app/api/dictation/route.ts';

describe('/api/paper abuse budget', () => {
  it('answers 429 once one address exceeds its minute budget, before touching auth', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      const response = await paperGet(new NextRequest('http://localhost:3000/api/paper', { headers: { 'x-forwarded-for': '198.51.100.7' } }));
      statuses.push(response.status);
    }
    /* Anonymous callers get 401 until the budget runs out, then 429. */
    assert.ok(statuses.slice(0, 60).every(status => status === 401), 'within budget, auth still decides');
    assert.equal(statuses[60], 429);
  });

  it('keeps budgets per address', async () => {
    const response = await paperGet(new NextRequest('http://localhost:3000/api/paper', { headers: { 'x-forwarded-for': '198.51.100.8' } }));
    assert.equal(response.status, 401);
  });
});

describe('/api/dictation error hygiene', () => {
  it('never forwards the upstream error body to the client', async () => {
    const saved = { key: process.env.ASSEMBLYAI_API_KEY, endpoint: process.env.ASSEMBLYAI_DICTATION_ENDPOINT, fetch: globalThis.fetch, warn: console.warn };
    process.env.ASSEMBLYAI_API_KEY = 'test-key';
    process.env.ASSEMBLYAI_DICTATION_ENDPOINT = 'https://sync.assemblyai.com/transcribe';
    globalThis.fetch = (async () => new Response('internal trace: model=xyz shard=7 token=abc', { status: 500 })) as typeof fetch;
    console.warn = () => {};
    try {
      const form = new FormData();
      form.append('audio', new File([new Uint8Array([1, 2, 3])], 'recording.wav', { type: 'audio/wav' }));
      const response = await dictationPost(new NextRequest('http://localhost:3000/api/dictation', { method: 'POST', body: form }));
      assert.equal(response.status, 502);
      const text = await response.text();
      const body = JSON.parse(text) as Record<string, unknown>;
      assert.equal(body.error, 'dictation_failed');
      assert.equal('details' in body, false);
      assert.doesNotMatch(text, /internal trace|shard|token=abc/);
    } finally {
      globalThis.fetch = saved.fetch;
      console.warn = saved.warn;
      if (saved.key === undefined) delete process.env.ASSEMBLYAI_API_KEY; else process.env.ASSEMBLYAI_API_KEY = saved.key;
      if (saved.endpoint === undefined) delete process.env.ASSEMBLYAI_DICTATION_ENDPOINT; else process.env.ASSEMBLYAI_DICTATION_ENDPOINT = saved.endpoint;
    }
  });
});
