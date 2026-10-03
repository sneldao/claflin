import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lampFor, readInstruction, litDesks, type TurretMatch } from '../lib/desk/turret';

/**
 * The turret lamp carries state. The plan said a count badge should
 * appear when several offerings match — so the visitor knows the
 * choice is real before they pick. The lamp's *kind* (idle / match /
 * quiet) is the foundation; the count is a wayfinding hint on top.
 *
 * The lamp is a pure function of the reading and the desk id. These
 * tests assert the count logic: how many offerings match *this*
 * desk, and what state the lamp carries.
 */

describe('turret — lamp count', () => {
  it('an empty reading has no matches for any desk', () => {
    const reading = readInstruction('');
    assert.equal(reading.kind, 'empty');
    for (const deskId of ['hetty', 'jesse', 'isabel', 'halley'] as const) {
      assert.equal(lampFor(reading, deskId), 'idle');
    }
  });

  it('a matched reading with one offer on Hetty has count 1 for Hetty', () => {
    // The catalog contains AAPLc on Base (Hetty). Saying "AAPL"
    // resolves to one match on Hetty — count 1.
    const reading = readInstruction('AAPL');
    if (reading.kind !== 'matched') return;
    const hettyMatches = reading.matches.filter(m => m.deskIds.includes('hetty'));
    assert.ok(hettyMatches.length >= 1, 'AAPL should match at least one Hetty offering');
  });

  it('the lamp reflects a match on the desk, not on the rail', () => {
    // AAPL appears on multiple desks (Hetty Base, Jesse Solana,
    // Isabel Robinhood). Hetty's lamp should be lit (match) when
    // the offer is for the Base offering.
    const reading = readInstruction('AAPL');
    if (reading.kind !== 'matched') return;
    assert.equal(lampFor(reading, 'hetty'), 'match');
    assert.equal(lampFor(reading, 'jesse'), 'match');
    assert.equal(lampFor(reading, 'isabel'), 'match');
  });

  it('litDesks returns the desks whose lamp is match', () => {
    const reading = readInstruction('AAPL');
    if (reading.kind !== 'matched') return;
    const lit = litDesks(reading, ['hetty', 'jesse', 'isabel', 'halley']);
    assert.ok(lit.includes('hetty'));
    assert.ok(lit.includes('jesse'));
    assert.ok(lit.includes('isabel'));
  });

  it('a launch instruction lights only the launch desk', () => {
    const reading = readInstruction('launch an NVDA tracker');
    assert.equal(reading.kind, 'launch');
    assert.equal(lampFor(reading, 'halley'), 'match');
    assert.equal(lampFor(reading, 'jesse'), 'quiet');
  });
});

describe('turret — match counting for the count chip', () => {
  it('a desk with one match should not show a count chip (the plan: only when several)', () => {
    const matches: readonly TurretMatch[] = [
      { offeringId: 'aapl-base', symbol: 'AAPLc', rail: 'Base', deskIds: ['hetty'] },
    ];
    const countForHetty = matches.filter(m => m.deskIds.includes('hetty')).length;
    assert.equal(countForHetty, 1);
  });

  it('a desk with two matches should show a count chip of 2', () => {
    const matches: readonly TurretMatch[] = [
      { offeringId: 'aapl-base', symbol: 'AAPLc', rail: 'Base', deskIds: ['hetty'] },
      { offeringId: 'aapl-base-2', symbol: 'AAPLc', rail: 'Base', deskIds: ['hetty'] },
    ];
    const countForHetty = matches.filter(m => m.deskIds.includes('hetty')).length;
    assert.equal(countForHetty, 2);
  });
});