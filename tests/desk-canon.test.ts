import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_CANON, getDeskCanon, requireDeskCanon, deskDescriptor, deskCardLine, type DeskId } from '../lib/desktop.canon';

/**
 * The canon is the product-copy source. These tests protect its shape so
 * the foyer, turret, and board can rely on it.
 */

test('every desk has a non-empty identity and role', () => {
  for (const desk of DESK_CANON) {
    assert.ok(desk.name.length > 0, `${desk.id} is missing a name`);
    assert.ok(desk.shortName.length > 0, `${desk.id} is missing a shortName`);
    assert.ok(desk.market.length > 0, `${desk.id} is missing a market`);
    assert.ok(desk.approach.length > 0, `${desk.id} is missing an approach`);
    assert.ok(desk.access.length > 0, `${desk.id} is missing an access line`);
    assert.ok(desk.capability.length > 0, `${desk.id} is missing a capability line`);
    assert.ok(desk.role.length > 0, `${desk.id} is missing a role line`);
    assert.ok(desk.kind === 'tape' || desk.kind === 'launch', `${desk.id} has invalid kind`);
    assert.ok(desk.status === 'paper' || desk.status === 'planned', `${desk.id} has invalid status`);
  }
});

test('desk role is a sentence, not just a noun fragment', () => {
  for (const desk of DESK_CANON) {
    // role should describe what the desk does, not just repeat its name
    assert.ok(desk.role.length > 16, `${desk.id} role should be a description, not a label`);
  }
});

test('Halley is the launch desk and is not named after his venue', () => {
  const halley = requireDeskCanon('halley');
  assert.equal(halley.kind, 'launch');
  assert.equal(halley.market, 'Solana');
  // role must mention launch, not "Meteora desk"
  assert.match(halley.role, /launch/i);
  assert.doesNotMatch(halley.role.toLowerCase(), /meteora desk/);
  assert.doesNotMatch(halley.shortName.toLowerCase(), /meteora/);
  assert.doesNotMatch(halley.name.toLowerCase(), /meteora/);
});

test('planned desks have no venue', () => {
  for (const desk of DESK_CANON) {
    if (desk.status === 'planned') {
      assert.equal(desk.venue, null, `${desk.id} is planned but has a venue set`);
    }
  }
});

test('getDeskCanon returns undefined for unknown ids and a record for known ones', () => {
  assert.equal(getDeskCanon('hetty')?.id, 'hetty');
  assert.equal(getDeskCanon('unknown'), undefined);
});

test('requireDeskCanon throws on unknown ids', () => {
  assert.throws(() => requireDeskCanon('not-a-desk' as DeskId), /Unknown desk id/);
});

test('deskDescriptor includes short name and role', () => {
  const desc = deskDescriptor('hetty');
  assert.match(desc, /Hetty/);
  assert.match(desc, /Base/);
});

test('deskCardLine distinguishes tape from launch', () => {
  const tape = deskCardLine('hetty');
  const launch = deskCardLine('halley');
  assert.match(tape, /Tape desk/);
  assert.match(launch, /Launch desk/);
  // Halley's card line must not say "Meteora desk"
  assert.doesNotMatch(launch, /Meteora desk/);
});

test('every open desk has a non-null venue', () => {
  // All currently paper desks must have a venue so the board can label it.
  for (const desk of DESK_CANON) {
    if (desk.status === 'paper') {
      assert.ok(desk.venue && desk.venue.length > 0, `${desk.id} is paper but missing a venue`);
    }
  }
});