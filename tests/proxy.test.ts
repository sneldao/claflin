import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

async function bodyJson(response: Response) {
  try { return await response.json(); } catch { return null; }
}

describe('proxy routing', () => {
  it('lets the ElevenLabs webhook pass through instead of returning a generic 404', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/elevenlabs', { method: 'POST' });
    const response = proxy(request);
    assert.equal(response.status, 200, 'the proxy must not intercept the existing webhook route');
    assert.equal(await bodyJson(response), null, 'no JSON body is written for a real route');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  });

  it('returns a 410 for retired marketplace paths', async () => {
    for (const path of ['/api/agents', '/api/agents/general_helper', '/api/sdk/register', '/api/ratings']) {
      const response = proxy(new NextRequest(`http://localhost:3000${path}`));
      assert.equal(response.status, 410, `${path} should be retired`);
      const body = await bodyJson(response);
      assert.equal(body?.error, 'marketplace_retired');
    }
  });

  it('returns an honest JSON 404 for unknown API paths', async () => {
    const response = proxy(new NextRequest('http://localhost:3000/api/retired/v1/widgets'));
    assert.equal(response.status, 404);
    const body = await bodyJson(response);
    assert.equal(body?.error, 'not_found');
  });

  it('still allows known non-retired API routes', async () => {
    for (const path of ['/api/stocks/quote', '/api/stocks/marks', '/api/paper', '/api/hetty/session', '/api/eligibility']) {
      const response = proxy(new NextRequest(`http://localhost:3000${path}?instrumentId=foo`));
      assert.equal(response.status, 200, `${path} should be allowed`);
    }
  });
});
