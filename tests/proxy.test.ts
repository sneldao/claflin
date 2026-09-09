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

  it('lets the desk-aware quote and marks routes pass through', async () => {
    for (const path of ['/api/desk/hetty/quote', '/api/desk/hetty/marks']) {
      const response = proxy(new NextRequest(`http://localhost:3000${path}?instrumentId=foo`));
      assert.equal(response.status, 200, `${path} should be allowed`);
      assert.equal(await bodyJson(response), null, 'no JSON body is written for a real route');
    }
  });

  it('reflects CORS origin only for allowlisted origins, with credentials only for those', async () => {
    const request = (origin?: string) =>
      new NextRequest('http://localhost:3000/api/stocks/marks', origin ? { headers: { origin } } : undefined);

    const noOrigin = proxy(request());
    assert.equal(noOrigin.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(noOrigin.headers.get('Access-Control-Allow-Credentials'), null);

    const allowed = proxy(request('http://localhost:3000'));
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');

    const hostile = proxy(request('https://evil.example'));
    assert.equal(hostile.headers.get('Access-Control-Allow-Origin'), null, 'an unknown origin must not be reflected');
    assert.equal(hostile.headers.get('Access-Control-Allow-Credentials'), null);
  });
});
