import './jsdom-setup';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestRingOnArrival, consumeRingOnArrival } from '../lib/trading/line-signal';

const KEY = 'claflin:ring-on-arrival';

describe('ring on arrival', () => {
  beforeEach(() => {
    window.sessionStorage.removeItem(KEY);
  });

  it('a matching desk consumes the pending ring exactly once', () => {
    requestRingOnArrival('hetty');
    assert.equal(consumeRingOnArrival('hetty'), true);
    assert.equal(consumeRingOnArrival('hetty'), false, 'second call finds nothing');
    assert.equal(window.sessionStorage.getItem(KEY), null);
  });

  it('a different desk does not ring and still clears the key', () => {
    requestRingOnArrival('hetty');
    assert.equal(consumeRingOnArrival('jesse'), false);
    assert.equal(window.sessionStorage.getItem(KEY), null);
  });

  it('a stale request does not ring', () => {
    requestRingOnArrival('jesse');
    const later = Date.now() + 11_000;
    assert.equal(consumeRingOnArrival('jesse', later), false);
    assert.equal(window.sessionStorage.getItem(KEY), null);
  });
});
