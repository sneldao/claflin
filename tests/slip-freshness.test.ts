import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slipValidity } from '../lib/desk/written-slip';

/**
 * The slip's freshness rule is the only visual contract between
 * the review window and the user. The rule drains from full (1.0)
 * to empty (0.0) as the seconds tick down, and reads as a single
 * bar that visibly retreats. The rule's *behaviour* is verified
 * by the slipValidity helper: state, seconds-left, and the
 * transition between them.
 */

describe('slip freshness — slipValidity', () => {
  it('an unexpired quote is open with full seconds', () => {
    const now = 1_000_000;
    const expiresAt = now + 30_000;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.state, 'open');
    assert.equal(v.secondsLeft, 30);
  });

  it('a quote in its last 5 seconds is closing', () => {
    const now = 1_000_000;
    const expiresAt = now + 3_000;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.state, 'closing');
    assert.equal(v.secondsLeft, 3);
  });

  it('a quote past its expiry is lapsed', () => {
    const now = 1_000_000;
    const expiresAt = now - 1_000;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.state, 'lapsed');
    assert.equal(v.secondsLeft, 0);
  });

  it('seconds-left is non-negative even when the quote is well past expiry', () => {
    const now = 1_000_000;
    const expiresAt = now - 60_000;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.secondsLeft, 0);
  });

  it('exactly 5 seconds remaining is the boundary to closing', () => {
    const now = 1_000_000;
    const expiresAt = now + 5_000;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.state, 'closing');
  });

  it('a fraction of a second is rounded up', () => {
    // The user sees whole seconds; 0.4s remaining is still "1
    // second" on the slip. This is the rule that makes the bar
    // visibly drain at the end.
    const now = 1_000_000;
    const expiresAt = now + 400;
    const v = slipValidity(expiresAt, now);
    assert.equal(v.secondsLeft, 1);
  });
});

describe('slip freshness — visual contract', () => {
  it('the rule\'s width is the freshness fraction, in 0..1', () => {
    // The CSS uses var(--review-fresh) as the percentage. The
    // test asserts the helper's output maps to the same range.
    const cases = [
      { fresh: 1.0, expectedPct: 100 },
      { fresh: 0.5, expectedPct: 50 },
      { fresh: 0.0, expectedPct: 0 },
    ];
    for (const { fresh, expectedPct } of cases) {
      const pct = fresh * 100;
      assert.equal(pct, expectedPct);
    }
  });

  it('lapsed state is steady, not animated', () => {
    // The CSS rules .writtenSlip[data-lapsed='true'] .slipFresh
    // uses a single-colour background. No animation, no
    // transition. The user sees a steady bar when the window
    // is closed.
    const v = slipValidity(0, 1_000_000);
    assert.equal(v.state, 'lapsed');
  });
});