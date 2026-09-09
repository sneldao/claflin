import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// API Client Resilience Tests
// ============================================
// Enforces the failure-handling contract that keeps the UI delightful:
//   - Typed errors (offline/network/timeout/http/parse), never raw "Failed to fetch"
//   - Retries only for idempotent methods and transient failures
//   - Backoff stays within jittered exponential bounds
//   - Friendly, product-voice copy for every failure mode

import {
  ApiError,
  apiFetch,
  classifyFetchFailure,
  computeBackoffDelay,
  friendlyMessageFor,
  isRetryableStatus,
} from '../lib/api-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('isRetryableStatus', () => {
  it('treats transient statuses as retryable', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      assert.ok(isRetryableStatus(status), `${status} should be retryable`);
    }
  });

  it('treats permanent client errors as non-retryable', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      assert.equal(isRetryableStatus(status), false, `${status} should not be retryable`);
    }
  });
});

describe('friendlyMessageFor', () => {
  it('returns distinct human copy for every kind', () => {
    const kinds = ['offline', 'network', 'timeout', 'http', 'parse'] as const;
    const messages = new Set(kinds.map((k) => friendlyMessageFor(k, 500)));
    assert.equal(messages.size, kinds.length, 'each kind should have its own message');
    for (const message of messages) {
      assert.ok(message.length > 10, 'message should be a real sentence');
      assert.ok(!/failed to fetch/i.test(message), 'must never leak raw browser errors');
    }
  });

  it('has specific copy for rate limiting', () => {
    assert.match(friendlyMessageFor('http', 429), /too many calls/i);
  });
});

describe('classifyFetchFailure', () => {
  it('classifies TypeError (CORS/DNS/TLS failures) as retryable network errors', () => {
    // Browsers throw TypeError("Failed to fetch") for CORS blocks too.
    const err = classifyFetchFailure(new TypeError('Failed to fetch'));
    assert.equal(err.kind, 'network');
    assert.equal(err.retryable, true);
  });

  it('classifies AbortError as timeout', () => {
    const err = classifyFetchFailure(new DOMException('Aborted', 'AbortError'));
    assert.equal(err.kind, 'timeout');
    assert.equal(err.retryable, true);
  });

  it('passes ApiError through untouched', () => {
    const original = new ApiError('http', 'boom', { status: 500 });
    assert.equal(classifyFetchFailure(original), original);
  });
});

describe('computeBackoffDelay', () => {
  it('is bounded by base * 2^attempt', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ceiling = 800 * 2 ** attempt;
      const delay = computeBackoffDelay(attempt, 800, 100_000, () => 0.9999);
      assert.ok(delay <= ceiling, `attempt ${attempt}: ${delay} <= ${ceiling}`);
      assert.ok(computeBackoffDelay(attempt, 800, 100_000, () => 0) >= 0);
    }
  });

  it('respects the max delay cap', () => {
    const delay = computeBackoffDelay(10, 800, 8_000, () => 0.9999);
    assert.ok(delay <= 8_000);
  });
});

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    const fetchImpl = async () => jsonResponse(200, { agents: [1, 2] });
    const data = await apiFetch<{ agents: number[] }>('/api/agents', { fetchImpl: fetchImpl as typeof fetch });
    assert.deepEqual(data.agents, [1, 2]);
  });

  it('retries transient 5xx for GET then throws a typed error', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return jsonResponse(502, { error: 'bad gateway' });
    };
    const err = await apiFetch('/api/agents', { fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'http');
    assert.equal((err as ApiError).status, 502);
    assert.equal(calls, 3, 'GET should attempt 1 + 2 retries');
  });

  it('recovers when a retry succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return calls < 2 ? jsonResponse(503, { error: 'restarting' }) : jsonResponse(200, { ok: true });
    };
    const data = await apiFetch<{ ok: boolean }>('/api/agents', { fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 });
    assert.equal(data.ok, true);
    assert.equal(calls, 2);
  });

  it('does NOT retry permanent client errors', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return jsonResponse(400, { error: 'bad request' });
    };
    const err = await apiFetch('/api/agents', { fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).status, 400);
    assert.equal(calls, 1);
  });

  it('never retries mutations by default (no replayed payments)', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return jsonResponse(500, { error: 'boom' });
    };
    await apiFetch('/api/payments/settle', { method: 'POST', fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 })
      .then(() => assert.fail('should have thrown'), () => {});
    assert.equal(calls, 1, 'POST must not be retried implicitly');
  });

  it('classifies fetch rejection (CORS/network) as network kind', async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    const err = await apiFetch('/api/agents', { fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'network');
    assert.match((err as ApiError).friendlyMessage, /broker desk/i);
  });

  it('times out hung requests instead of spinning forever', async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
    const err = await apiFetch('/api/agents', { fetchImpl, timeoutMs: 10, retries: 0 })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'timeout');
  });

  it('surfaces invalid JSON as a parse error', async () => {
    const fetchImpl = async () => new Response('<html>proxy error</html>', { status: 200 });
    const err = await apiFetch('/api/agents', { fetchImpl: fetchImpl as typeof fetch, retryBaseMs: 1 })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'parse');
  });

  it('times out a slow body read, not just slow headers', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 50)),
    } as unknown as Response);
    const start = Date.now();
    const err = await apiFetch('/api/agents', { fetchImpl, timeoutMs: 10, retries: 0 })
      .then(() => null, (e: unknown) => e);
    const elapsed = Date.now() - start;
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'timeout');
    assert.ok(elapsed < 30, 'timeout should fire before the body finishes');
  });

  it('aborts a Retry-After wait when the caller cancels', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '1' : null) },
      json: async () => ({ error: 'rate_limited' }),
    } as unknown as Response);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const start = Date.now();
    const err = await apiFetch('/api/agents', { fetchImpl, signal: controller.signal, retryBaseMs: 1, timeoutMs: 60_000 })
      .then(() => null, (e: unknown) => e);
    const elapsed = Date.now() - start;
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).kind, 'timeout');
    assert.ok(elapsed < 100, 'cancellation must break the Retry-After wait');
  });
});
