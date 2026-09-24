import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mandateLabel,
  offeringCapabilityText,
  offeringGroupsForInstruction,
  soleOfferingForDesk,
  offeringProductGroups,
  openDesksForOffering,
  railLabel,
  venueLabel,
} from '../lib/desk/offerings-presentation';
import { INSTRUMENT_OFFERINGS } from '../lib/desk/offerings';

const overlapping = offeringProductGroups().find(group => group.offerings.length > 1)!;

describe('offering presentation', () => {
  it('gives each desk its own offering when a sentence matches both rails', () => {
    const hetty = soleOfferingForDesk('buy Apple for 100 USDC', 'hetty');
    const jesse = soleOfferingForDesk('buy Apple for 100 USDC', 'jesse');
    assert.ok(hetty);
    assert.ok(jesse);
    assert.notEqual(hetty, jesse);
    assert.equal(soleOfferingForDesk('', 'hetty'), null);
    assert.equal(soleOfferingForDesk('no such instrument', 'hetty'), null);
  });

  it('resolves an instruction to concrete comparable offerings', () => {
    const groups = offeringGroupsForInstruction('buy Apple for 100 USDC');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].underlyingSymbol, 'AAPL');
    assert.deepEqual(
      groups[0].offerings.map(offering => offering.symbol),
      ['AAPLc', 'AAPLx'],
    );
  });

  it('keeps matching by product, issuer, mandate, and settlement facts without exposing raw ids', () => {
    assert.equal(offeringGroupsForInstruction('NVIDIA')[0].underlyingSymbol, 'NVDA');
    assert.equal(offeringGroupsForInstruction('Backed Tesla')[0].underlyingSymbol, 'TSLA');
    assert.equal(offeringGroupsForInstruction('Alphabet')[0].underlyingSymbol, 'GOOGL');
    assert.equal(offeringGroupsForInstruction('no such instrument').length, 0);
  });

  it('presents only open desks that have coverage for the selected offering', () => {
    for (const offering of overlapping.offerings) {
      const desks = openDesksForOffering(offering);
      assert.equal(desks.length, 1);
      assert.equal(desks[0].id, offering.deskIds[0]);
    }

    const base = overlapping.offerings.find(offering => offering.rail.kind === 'evm')!;
    const solana = overlapping.offerings.find(offering => offering.rail.kind === 'solana')!;
    assert.equal(openDesksForOffering(base)[0].id, 'hetty');
    assert.equal(openDesksForOffering(solana)[0].id, 'jesse');
    assert.notEqual(base.instrumentId, solana.instrumentId);
  });

  it('uses neutral product-first labels while keeping the selected rail explicit', () => {
    for (const offering of INSTRUMENT_OFFERINGS) {
      assert.ok(mandateLabel(offering).length > 0);
      assert.ok(railLabel(offering.rail).length > 0);
      assert.ok(venueLabel(offering.venue).length > 0);
    }

    const solana = overlapping.offerings.find(offering => offering.rail.kind === 'solana')!;
    assert.equal(mandateLabel(solana), 'Backed xStocks');
    assert.equal(railLabel(solana.rail), 'Solana');
    assert.equal(venueLabel(solana.venue), 'Jupiter');
    assert.match(offeringCapabilityText(solana, ['jesse']), /Paper estimate/);
    assert.equal(offeringCapabilityText(solana, []), 'Paper estimate');
  });
});
