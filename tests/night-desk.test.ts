import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_DESK_FIXTURES } from '../lib/night-desk-fixtures';
import {
  initialNightDeskState,
  nightDeskReducer,
  parseNightDeskCommand,
  canKeepNightDesk,
  LEDGER_READONLY_LINE,
} from '../lib/night-desk-state';

describe('Night desk study state', () => {
  it('walks arrival to a filed 50 revision', () => {
    let state = initialNightDeskState;
    assert.equal(state.stage, 'arrival');
    assert.equal(state.view, 'desk');
    assert.equal(state.amount, null);
    assert.equal(state.keptAmount, null);
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.arrival);

    state = nightDeskReducer(state, { type: 'begin' });
    assert.equal(state.stage, 'conversation');
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.conversation);

    state = nightDeskReducer(state, { type: 'compare' });
    assert.equal(state.stage, 'evidence');
    assert.equal(state.view, 'evidence');

    state = nightDeskReducer(state, { type: 'quote', amount: '100' });
    assert.equal(state.stage, 'quote');
    assert.equal(state.view, 'review');
    assert.equal(state.amount, '100');
    assert.equal(NIGHT_DESK_FIXTURES.quotes[state.amount].receive, '0.490 AAPLx');

    state = nightDeskReducer(state, { type: 'quote', amount: '50' });
    assert.equal(state.stage, 'revised');
    assert.equal(state.amount, '50');
    assert.equal(NIGHT_DESK_FIXTURES.quotes[state.amount].receive, '0.245 AAPLx');
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.revised);

    assert.equal(canKeepNightDesk(state), true);
    state = nightDeskReducer(state, { type: 'keep' });
    assert.equal(state.stage, 'filed');
    assert.equal(state.view, 'ledger');
    assert.equal(state.keptAmount, '50');
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.filed);
  });

  it('unknown preserves stage, view, amount, and kept amount', () => {
    const state = nightDeskReducer(
      { ...initialNightDeskState, stage: 'quote', view: 'review', amount: '100', keptAmount: '50' },
      { type: 'unknown' },
    );
    assert.equal(state.stage, 'quote');
    assert.equal(state.view, 'review');
    assert.equal(state.amount, '100');
    assert.equal(state.keptAmount, '50');
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.unsupported);
  });

  it('keep without a slip says noQuote and keeps nothing', () => {
    const state = nightDeskReducer(initialNightDeskState, { type: 'keep' });
    assert.equal(state.stage, 'arrival');
    assert.equal(state.keptAmount, null);
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.noQuote);
  });

  it('duplicate keep returns the filed state unchanged', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '50' });
    state = nightDeskReducer(state, { type: 'keep' });
    const again = nightDeskReducer(state, { type: 'keep' });
    assert.deepEqual(again, state);
  });

  it('keep from the ledger with a prior entry and a new draft is read-only', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '50' });
    state = nightDeskReducer(state, { type: 'keep' });
    state = nightDeskReducer(state, { type: 'quote', amount: '100' });
    state = nightDeskReducer(state, { type: 'view', view: 'ledger' });
    const rejected = nightDeskReducer(state, { type: 'keep' });
    assert.equal(rejected.line, LEDGER_READONLY_LINE);
    assert.equal(rejected.keptAmount, '50');
    assert.equal(rejected.amount, '100');
  });

  it('keep is permitted after browsing evidence and returning to review', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '100' });
    state = nightDeskReducer(state, { type: 'compare' });
    assert.equal(canKeepNightDesk(state), false);
    state = nightDeskReducer(state, { type: 'view', view: 'review' });
    assert.equal(canKeepNightDesk(state), true);
    state = nightDeskReducer(state, { type: 'keep' });
    assert.equal(state.stage, 'filed');
    assert.equal(state.keptAmount, '100');
  });

  it('cancel clears the active draft but not a kept record', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '50' });
    state = nightDeskReducer(state, { type: 'keep' });
    state = nightDeskReducer(state, { type: 'quote', amount: '100' });
    state = nightDeskReducer(state, { type: 'cancel' });
    assert.equal(state.amount, null);
    assert.equal(state.keptAmount, '50');
    assert.equal(state.stage, 'conversation');
    assert.equal(state.view, 'desk');
    assert.equal(state.line, NIGHT_DESK_FIXTURES.lines.cancelled);
  });

  it('ledger view shows the kept amount, not a newer draft', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '50' });
    state = nightDeskReducer(state, { type: 'keep' });
    state = nightDeskReducer(state, { type: 'quote', amount: '100' });
    state = nightDeskReducer(state, { type: 'view', view: 'ledger' });
    assert.equal(state.view, 'ledger');
    assert.equal(state.amount, '100');
    assert.equal(state.keptAmount, '50');
  });

  it('reset returns to the initial state and restore files the kept slip', () => {
    let state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '100' });
    state = nightDeskReducer(state, { type: 'reset' });
    assert.deepEqual(state, initialNightDeskState);
    const restored = nightDeskReducer(state, { type: 'restore', amount: '50' });
    assert.equal(restored.stage, 'filed');
    assert.equal(restored.view, 'ledger');
    assert.equal(restored.keptAmount, '50');
  });

  it('direct 50 quotes are not revisions', () => {
    const state = nightDeskReducer(initialNightDeskState, { type: 'quote', amount: '50' });
    assert.equal(state.stage, 'quote');
    assert.equal(state.amount, '50');
    assert.equal(state.line, 'Fifty USDC. The example slip shows 0.245 Apple xStock units. Nothing has been placed. Take a look.');
  });
});

describe('Night desk parser', () => {
  it('maps each scripted sample line to its action', () => {
    assert.deepEqual(parseNightDeskCommand(NIGHT_DESK_FIXTURES.sampleLines.compare), { type: 'compare' });
    assert.deepEqual(parseNightDeskCommand(NIGHT_DESK_FIXTURES.sampleLines.quote), { type: 'quote', amount: '100' });
    assert.deepEqual(parseNightDeskCommand(NIGHT_DESK_FIXTURES.sampleLines.revise), { type: 'quote', amount: '50' });
    assert.deepEqual(parseNightDeskCommand(NIGHT_DESK_FIXTURES.sampleLines.file), { type: 'keep' });
    assert.deepEqual(parseNightDeskCommand(NIGHT_DESK_FIXTURES.sampleLines.cancel), { type: 'cancel' });
  });

  it('accepts direct legitimate 100 and 50 variants', () => {
    assert.deepEqual(parseNightDeskCommand('compare apple'), { type: 'compare' });
    assert.deepEqual(parseNightDeskCommand('buy 100 USDC of Apple'), { type: 'quote', amount: '100' });
    assert.deepEqual(parseNightDeskCommand('quote one hundred USDC of Apple'), { type: 'quote', amount: '100' });
    assert.deepEqual(parseNightDeskCommand('buy 50 USDC of Apple'), { type: 'quote', amount: '50' });
    assert.deepEqual(parseNightDeskCommand('quote fifty USDC of Apple'), { type: 'quote', amount: '50' });
    assert.deepEqual(parseNightDeskCommand('change to 50 USDC'), { type: 'quote', amount: '50' });
    assert.deepEqual(parseNightDeskCommand('file this example slip'), { type: 'keep' });
    assert.deepEqual(parseNightDeskCommand('cancel'), { type: 'cancel' });
  });

  it('rejects unsupported, unsafe, or incomplete instructions', () => {
    for (const text of [
      'buy -100 USDC of Apple',
      'buy 100 USDC of Tesla',
      'buy 100 USDC of Apple if it drops',
      'buy 100 USDC of Apple and sell half',
      'buy Apple',
      'execute this trade',
      'buy 200 USDC of Apple',
      'buy two hundred USDC of Apple',
      'sell two AAPLx',
      'sign the transaction',
      'quote 100 and 50 USDC of Apple',
      'do not buy 100 USDC of Apple',
      'buy 100 shares of Apple',
      'buy 100 EUR of Apple',
      'buy 100 USDC of Apple unless it falls',
      'keep this example slip without filing',
      '',
      'what time is it in Singapore',
    ]) {
      assert.deepEqual(parseNightDeskCommand(text), { type: 'unknown' }, text);
    }
  });
});
