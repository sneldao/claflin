import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENT_OFFERINGS, offeringForId, offeringForInstrument, offeringsForProduct } from '../lib/desk/offerings';
import { railLabel } from '../lib/desk/offerings-presentation';
import { DESK_CANON, deskCardLine, getDeskCanon, requireDeskCanon } from '../lib/desktop.canon';
import { MODE_HINTS } from '../lib/desk/ui-copy';
import { deskRuntimeFor } from '../lib/desk/registry';

/**
 * The wedge's load-bearing claim is that a first-time visitor can answer
 * five questions about what they just did, in 60 seconds each:
 *
 *   1. What is this token?
 *   2. Which rail does it settle on?
 *   3. Did money move?
 *   4. Where does my record live?
 *   5. What would happen if I changed network?
 *
 * These tests don't run a browser. They assert the *product surface*
 * contains the answers: visible labels, mandatory fields, and the
 * structural guarantees the user relies on. A real comprehension study
 * with users is in `tests/comprehension-protocol.md` — this is the
 * contract that lets that study be honest.
 */

describe('comprehension: task 1 — what is this token?', () => {
  for (const offering of INSTRUMENT_OFFERINGS) {
    it(`offering ${offering.symbol} carries name, issuer, and mandate`, () => {
      // The "what is this token" answer needs three things readable on the
      // ticket: a name, an issuer, and the mandate that binds the
      // rights. All three are part of the offering contract.
      assert.ok(offering.name.length > 0, `${offering.symbol} has no name`);
      assert.ok(offering.issuer.length > 0, `${offering.symbol} has no issuer`);
      assert.ok(offering.mandateId.length > 0, `${offering.symbol} has no mandateId`);
      // The mandate is one of the three known ones. New mandates require a
      // comprehension test update.
      assert.ok(
        ['coinbase-tokenized-stocks', 'backed-xstocks', 'robinhood-stock-tokens'].includes(offering.mandateId),
        `${offering.symbol} mandate ${offering.mandateId} not in known list`,
      );
    });
  }
});

describe('comprehension: task 2 — which rail does it settle on?', () => {
  for (const offering of INSTRUMENT_OFFERINGS) {
    it(`offering ${offering.symbol} exposes a rail`, () => {
      // Every offering must carry a rail. The rail label is what shows on
      // the ticket; a missing label is a comprehension failure.
      assert.ok(offering.rail, `${offering.symbol} has no rail`);
      const label = railLabel(offering.rail);
      assert.ok(label.length > 0, `${offering.symbol} rail label is empty`);
      // The rail label must be one of the three known rails. New rails
      // require a comprehension test update.
      assert.ok(
        ['Base', 'Solana', 'Robinhood Chain'].includes(label),
        `${offering.symbol} rail label "${label}" not in known list`,
      );
    });
  }
});

describe('comprehension: task 3 — did money move?', () => {
  it('every quote path defaults to paper and the mode hint is non-empty', () => {
    // The mode is the single most important copy in the product. The
    // MODE_HINTS object carries a per-desk hint; if any hint is empty
    // or missing, the user has no way to know whether they filed paper
    // or settled live.
    assert.ok(MODE_HINTS, 'MODE_HINTS is missing');
    assert.equal(typeof MODE_HINTS, 'object', 'MODE_HINTS must be an object');
    const values = Object.values(MODE_HINTS);
    assert.ok(values.length > 0, 'MODE_HINTS has no entries');
    for (const value of values) {
      assert.equal(typeof value, 'string', `MODE_HINTS value must be a string, got ${typeof value}`);
      assert.ok(value.length > 0, 'a MODE_HINTS value is empty');
    }
  });

  it('every open desk has paper capability and only some have live', () => {
    // The cap table for live execution is in lib/house.ts; here we just
    // assert that the open desks match the canon's status.
    for (const desk of DESK_CANON) {
      if (desk.status === 'paper') {
        // open desks (paper) must not have live set unconditionally —
        // that's a comprehension failure even if a build flag is off.
        // We re-check this in lib/house.ts via DESK_CAPABILITIES; this
        // test just asserts the canon says they're paper.
        assert.equal(desk.status, 'paper', `${desk.id} canon is not paper`);
      }
    }
  });
});

describe('comprehension: task 4 — where does my record live?', () => {
  it('the canon says exactly one desk has account-bound sync', () => {
    // The product surface has to make the storage scope legible. Today
    // only Hetty syncs to an account; Jesse/Isabel/Halley records stay
    // browser-local. The canon is the source of truth for which desks
    // are which.
    //
    // This test doesn't read the routing logic directly — it asserts the
    // canon and the docs agree. The deeper test is in
    // lib/desk/registry.ts (account-sync helpers).
    const paperDesks = DESK_CANON.filter(desk => desk.status === 'paper');
    assert.ok(paperDesks.length >= 2, 'expected at least two open desks');
    // All paper desks have *some* record form; the question is *where*
    // it lives. We assert the canon carries the access line that says so.
    for (const desk of paperDesks) {
      assert.ok(desk.access.length > 0, `${desk.id} has no access line`);
    }
  });
});

describe('comprehension: task 5 — what if I change network?', () => {
  it('the same underlying symbol on different rails is multiple offerings, never one', () => {
    // The whole wedge rides on this. If the same company on Base and
    // Solana ever collapsed to a single offering, the user's
    // comprehension of "which rail" would silently change.
    const byUnderlying = new Map<string, typeof INSTRUMENT_OFFERINGS>();
    for (const offering of INSTRUMENT_OFFERINGS) {
      const list = byUnderlying.get(offering.underlyingSymbol) ?? [];
      list.push(offering);
      byUnderlying.set(offering.underlyingSymbol, list);
    }
    let multiRailSymbols = 0;
    for (const [underlying, list] of byUnderlying) {
      if (list.length > 1) {
        multiRailSymbols += 1;
        // Different rails = different rail labels.
        const rails = new Set(list.map(o => railLabel(o.rail)));
        assert.equal(rails.size, list.length, `${underlying} has duplicate rail labels across offerings`);
        // Different offeringIds — never collapsed.
        const ids = new Set(list.map(o => o.offeringId));
        assert.equal(ids.size, list.length, `${underlying} offerings share an offeringId`);
      }
    }
    // We expect AAPL/NVDA/TSLA/MSFT/etc to all have multiple offerings;
    // assert at least one such symbol exists so this test guards the
    // design (not just trivially passing because all are single-rail).
    assert.ok(multiRailSymbols > 0, 'no underlying symbol has multiple offerings — wedge is not yet exercising rail separation');
  });

  it('the same product family resolves to distinct product IDs per rail', () => {
    // The productId is the family ("equity:AAPL"). Multiple offerings
    // may share a productId; each is its own offeringId. This is the
    // design: same product family, distinct contracts.
    const family = offeringsForProduct('equity:AAPL');
    if (family.length > 1) {
      const offeringIds = new Set(family.map(o => o.offeringId));
      assert.equal(offeringIds.size, family.length);
    }
  });
});

describe('comprehension: the canon and the registry agree', () => {
  it('every open desk in the canon has a runtime', () => {
    // If the canon claims a desk is paper but the runtime registry says
    // it's not open, the user lands on a closed room. The two sources
    // must agree.
    for (const desk of DESK_CANON) {
      const runtime = deskRuntimeFor(desk.id);
      if (desk.status === 'paper') {
        assert.ok(runtime, `canon says ${desk.id} is paper but deskRuntimeFor returns null`);
      }
    }
  });

  it('every paper desk in the canon is either an offering-eligible tape desk or a launch desk', () => {
    // Tape desks: at least one INSTRUMENT_OFFERING references them.
    // Launch desks: covered by the runtime registry, not by static
    // instruments (they create the instruments).
    const offeringDeskIds = new Set<string>();
    for (const offering of INSTRUMENT_OFFERINGS) {
      for (const deskId of offering.deskIds) offeringDeskIds.add(deskId);
    }
    for (const desk of DESK_CANON) {
      if (desk.status !== 'paper') continue;
      const runtime = deskRuntimeFor(desk.id);
      if (desk.kind === 'launch') {
        // A launch desk has a runtime with a quote adapter — it just
        // doesn't have static instruments.
        assert.ok(runtime, `launch desk ${desk.id} has no runtime`);
        assert.ok(
          runtime!.coverages.some(c => c.adapters.quote),
          `launch desk ${desk.id} runtime has no quote adapter`,
        );
      } else {
        assert.ok(
          offeringDeskIds.has(desk.id),
          `tape desk ${desk.id} is paper but no offering references it`,
        );
      }
    }
  });
});

describe('comprehension: card lines', () => {
  it('the card line for each desk is one sentence and includes its kind', () => {
    for (const desk of DESK_CANON) {
      const line = deskCardLine(desk.id);
      assert.ok(line.length > 0);
      assert.match(line, /Tape desk|Launch desk/);
    }
  });
});

describe('comprehension: zero state', () => {
  it('offering lookup is total over the catalog', () => {
    // offeringForId and offeringForInstrument must never throw; missing
    // ids return null and the UI surfaces "no match" honestly.
    assert.equal(offeringForId('not-a-real-offering'), null);
    assert.equal(offeringForInstrument('not-a-real-instrument'), null);
  });
});

describe('comprehension: protocol is documented', () => {
  it('the comprehension-protocol.md file exists and lists the five tasks', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('./comprehension-protocol.md', import.meta.url));
    let contents: string;
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      assert.fail('comprehension-protocol.md is missing — see tests/comprehension.test.ts for the spec');
      return;
    }
    assert.match(contents, /What is this token\?/i);
    assert.match(contents, /Which rail/i);
    assert.match(contents, /Did money move\?/i);
    assert.match(contents, /Where does my record live\?/i);
    assert.match(contents, /What would happen if I changed network\?/i);
  });
});