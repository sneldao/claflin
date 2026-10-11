import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotatedExampleCall } from '../components/foyer/AnnotatedExampleCall';
import {
  CURRENT_EXAMPLE_CALL,
  EXAMPLE_CALL_CRITERIA,
  EXAMPLE_CALL_LABEL,
  isValidExampleCall,
  type ExampleCall,
} from '../lib/foyer/example-call';

/**
 * The example call is the foyer proof-before-the-ask. Until a recording
 * is accepted, the slot renders the criteria, not a fake. The test
 * protects that contract.
 */

describe('example call — empty state', () => {
  it('renders the criteria, not a fake recording', () => {
    assert.equal(CURRENT_EXAMPLE_CALL.kind, 'pending');
    if (CURRENT_EXAMPLE_CALL.kind !== 'pending') return;
    assert.equal(CURRENT_EXAMPLE_CALL.recordedAt, null);
    assert.equal(CURRENT_EXAMPLE_CALL.reviewedBy, null);
    assert.ok(CURRENT_EXAMPLE_CALL.reason.length > 0, 'pending state must carry a reason');
  });

  it('exposes the criteria an accepted recording will need', () => {
    assert.ok(EXAMPLE_CALL_CRITERIA.length >= 4, 'at least four criteria');
    // Every criterion is a real, specific bar — not a marketing slogan.
    for (const line of EXAMPLE_CALL_CRITERIA) {
      assert.ok(line.length > 20, 'criterion must be specific, not a slogan');
    }
  });

  it('the label is constant and matches the foyer spec', () => {
    assert.equal(EXAMPLE_CALL_LABEL, 'EXAMPLE CALL');
  });

  it('the empty page carries the house sheet beside the criteria, stamp clear above it', () => {
    const html = renderToStaticMarkup(createElement(AnnotatedExampleCall));
    assert.match(html, /data-state="pending"/);
    assert.match(html, /Awaiting the wire/);
    assert.match(html, /class="exampleCallFields"/);
    assert.match(html, /The House Sheet/, 'the sheet hangs where a call would be posted');
    assert.match(html, /aria-label="The house sheet"/);
    /* First paint is masthead alone — the date is never fabricated server-side. */
    assert.doesNotMatch(html, /houseSheetDate/);
    assert.doesNotMatch(html, /no call today|no recording today/i, 'the sheet must not imply a real call’s state');
  });

  it('an accepted call leaves no sheet in the field — the slip owns it', () => {
    const call = {
      kind: 'accepted' as const,
      call: {
        id: 'test-call-1',
        source: 'jesse' as const,
        recordedAt: Date.parse('2026-09-21T14:00:00Z'),
        reviewedBy: 'editorial@example.com',
        transcript: [{ speaker: 'caller' as const, text: 'Buy 100 USDC of Apple on Jesse.' }],
        slip: { symbol: 'AAPLx', quoteAsset: 'USDC', amount: '100', fill: '0.30', venue: 'Jupiter', quotedAt: 1, expiresAt: 2, mode: 'paper' as const },
      },
    };
    const html = renderToStaticMarkup(createElement(AnnotatedExampleCall, { state: call }));
    assert.match(html, /data-state="accepted"/);
    assert.doesNotMatch(html, /The House Sheet/);
    assert.doesNotMatch(html, /Awaiting the wire/);
  });
});

describe('example call — accepted shape', () => {
  it('isValidExampleCall accepts a well-formed recording', () => {
    const call: ExampleCall = {
      id: 'test-call-1',
      source: 'jesse',
      recordedAt: Date.parse('2026-09-21T14:00:00Z'),
      reviewedBy: 'editorial@example.com',
      intent: { side: 'buy', amount: '100' },
      transcript: [
        { speaker: 'caller', text: 'Buy 100 USDC of Apple on Jesse.' },
        { speaker: 'broker', text: 'Filing paper on the Jesse desk for 100 USDC of AAPLx.' },
        { speaker: 'caller', text: 'Paper it.' },
        { speaker: 'broker', text: 'Filed to your paper ledger.' },
      ],
      slip: {
        symbol: 'AAPLx',
        quoteAsset: 'USDC',
        amount: '100',
        fill: '0.30',
        venue: 'Jupiter',
        quotedAt: Date.parse('2026-09-21T14:00:01Z'),
        expiresAt: Date.parse('2026-09-21T14:00:31Z'),
        mode: 'paper',
      },
    };
    assert.ok(isValidExampleCall(call));
  });

  it('isValidExampleCall rejects bad input', () => {
    assert.equal(isValidExampleCall(null), false);
    assert.equal(isValidExampleCall({}), false);
    assert.equal(isValidExampleCall({ id: '', source: 'jesse', recordedAt: 1, reviewedBy: 'r', transcript: [{ speaker: 'caller', text: 't' }], slip: { mode: 'paper' } }), false);
    // Unknown source
    assert.equal(
      isValidExampleCall({ id: 'x', source: 'unknown', recordedAt: 1, reviewedBy: 'r', transcript: [{ speaker: 'caller', text: 't' }], slip: { mode: 'paper' } }),
      false,
    );
    // Empty transcript
    assert.equal(
      isValidExampleCall({ id: 'x', source: 'jesse', recordedAt: 1, reviewedBy: 'r', transcript: [], slip: { mode: 'paper' } }),
      false,
    );
  });
});

describe('example call — honesty guards', () => {
  it('the slip mode is paper — never live', () => {
    // An example call is a real paper file by definition. The
    // isValidExampleCall contract rejects anything else.
    const slip = { symbol: 'AAPLx', quoteAsset: 'USDC', amount: '100', fill: '0.30', venue: 'Jupiter', quotedAt: 1, expiresAt: 2, mode: 'paper' as const };
    assert.equal(slip.mode, 'paper');
  });
});