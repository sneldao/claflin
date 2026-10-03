import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BROKER_CONTRACTS, getBrokerContract, allForbiddenPhrases, findForbiddenMatches } from '../lib/brokers/contracts';
import { HOUSE_DESKS } from '../lib/house';

/**
 * The voice-tone contract protects the brokers from crossing the line
 * from observation to recommendation. These tests assert:
 *   - every desk has a contract
 *   - every contract carries a signature line, attribution, and at
 *     least one fact-check ref
 *   - the forbidden-phrase categories are non-empty and the patterns
 *     match the categories the docs claim
 *   - a transcript the contract should reject is rejected
 */

describe('broker contracts — shape', () => {
  for (const desk of HOUSE_DESKS) {
    it(`${desk.id} has a contract`, () => {
      const c = getBrokerContract(desk.id);
      assert.equal(c.deskId, desk.id);
      assert.ok(c.signatureLine.length > 0, 'signature line is required');
      assert.ok(c.attribution.length > 0, 'attribution is required');
      assert.ok(c.lens.length > 0, 'lens is required');
    });
  }

  it('every open desk has at least one fact-check ref', () => {
    for (const desk of HOUSE_DESKS) {
      if (desk.status !== 'paper') continue;
      const c = getBrokerContract(desk.id);
      assert.ok(c.factCheckRefs.length >= 1, `${desk.id} has no fact-check refs`);
    }
  });

  it('every fact-check ref is a real URL', () => {
    for (const desk of HOUSE_DESKS) {
      const c = getBrokerContract(desk.id);
      for (const ref of c.factCheckRefs) {
        assert.match(ref.url, /^https?:\/\//, `${desk.id} ref ${ref.label} is not a URL`);
        assert.ok(ref.label.length > 0, `${desk.id} ref has no label`);
      }
    }
  });

  it('the contract matches the canon desk name', () => {
    for (const desk of HOUSE_DESKS) {
      const c = getBrokerContract(desk.id);
      assert.equal(c.name, desk.name);
    }
  });
});

describe('broker contracts — forbidden phrases', () => {
  it('every open desk has a non-empty forbidden list', () => {
    for (const desk of HOUSE_DESKS) {
      if (desk.status !== 'paper') continue;
      const phrases = allForbiddenPhrases(desk.id);
      assert.ok(phrases.length >= 3, `${desk.id} has fewer than 3 forbidden phrases`);
    }
  });

  it('every open desk inherits the common list (recommendation / prediction / portfolio / pretend authority)', () => {
    for (const desk of HOUSE_DESKS) {
      if (desk.status !== 'paper') continue;
      const phrases = allForbiddenPhrases(desk.id);
      const categories = new Set(phrases.map(p => p.category));
      for (const required of ['recommendation', 'prediction', 'portfolio advice', 'pretend authority']) {
        assert.ok(categories.has(required), `${desk.id} missing common category "${required}"`);
      }
    }
  });

  it('matches recommendation language', () => {
    const matches = findForbiddenMatches('hetty', 'You should buy 100 USDC of NVDA right now.');
    assert.ok(matches.length > 0, 'did not catch "you should buy"');
    assert.equal(matches[0].category, 'recommendation');
  });

  it('matches prediction language', () => {
    const matches = findForbiddenMatches('jesse', 'I think the price will go up to the moon.');
    assert.ok(matches.length > 0, 'did not catch prediction language');
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('prediction'));
  });

  it('matches portfolio-construction language', () => {
    const matches = findForbiddenMatches('isabel', 'Put all your money in this, you can\'t lose.');
    assert.ok(matches.length > 0);
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('portfolio advice'));
  });

  it('matches fake authority', () => {
    const matches = findForbiddenMatches('halley', 'I am a licensed financial advisor');
    assert.ok(matches.length > 0);
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('pretend authority'));
  });

  it('does not over-fire on a clean transcript', () => {
    const transcript = 'The quote expires in 30 seconds. I read 0.30 of AAPLx at 100 USDC on Jupiter. The stock reference is 330.17 on Coinbase Exchange. The gap is 0.5 bps. Filing as paper.';
    for (const desk of HOUSE_DESKS) {
      if (desk.status !== 'paper') continue;
      const matches = findForbiddenMatches(desk.id, transcript);
      assert.equal(matches.length, 0, `${desk.id} matched clean transcript: ${JSON.stringify(matches)}`);
    }
  });

  it('Halley\'s contract rejects fake-provenance language', () => {
    // Halley is the launch desk — fake "backed by" language is
    // especially harmful for him.
    const matches = findForbiddenMatches('halley', 'This token is fully collateralized and audited.');
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('fake provenance'), 'did not catch "fully collateralized"');
  });

  it('Hetty\'s contract rejects overconfidence', () => {
    const matches = findForbiddenMatches('hetty', 'This is a sure thing.');
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('overconfidence'), 'did not catch "sure thing"');
  });

  it('Jesse\'s contract rejects FOMO language', () => {
    const matches = findForbiddenMatches('jesse', "Don't miss out on this last chance.");
    const categories = new Set(matches.map(m => m.category));
    assert.ok(categories.has('fomo'));
  });
});

describe('broker contracts — voice samples', () => {
  it('every open desk with a voice sample has one', () => {
    // Today every paper desk has a sample. The plan's rule:
    // "A voice-preview control must play an actual, representative
    // sample. Omit it when no usable sample exists; a descriptive
    // toast is not a preview." We assert the contract field is
    // consistent with that rule.
    for (const desk of HOUSE_DESKS) {
      const c = getBrokerContract(desk.id);
      if (c.voiceSample) {
        assert.ok(c.voiceSample.line.length > 0, `${desk.id} voice sample has no line`);
        assert.ok(c.voiceSample.attribution.length > 0, `${desk.id} voice sample has no attribution`);
      }
    }
  });

  it('planned desks may have no voice sample (Jay, today)', () => {
    const c = getBrokerContract('arbitrum');
    assert.equal(c.voiceSample, null);
  });
});