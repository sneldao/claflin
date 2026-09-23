import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJesseSpeech } from '../lib/jesse/speech.ts';
import { handMarks, markFor, mergeProvenance, provenanceFromFields, spansInVerbatim } from '../lib/desk/slip-provenance.ts';
import { provenanceFromParse } from '../lib/jesse/slip-provenance.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import type { JesseDraft } from '../lib/solana/contracts.ts';

const apple = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const emptyDraft: JesseDraft = { instrumentId: null, side: null, unit: null, amount: null };
const buyDraft: JesseDraft = { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' };

describe('speech spans', () => {
  it('captures the literal words that wrote each field', () => {
    const parse = parseJesseSpeech('buy 100 USDC of AAPLx');
    assert.equal(parse.command?.type, 'draft');
    assert.equal(parse.spans?.instrument, 'AAPLx');
    assert.equal(parse.spans?.side, 'buy');
    assert.equal(parse.spans?.amount, '100 USDC');
  });

  it('captures the $ amount form as written', () => {
    const parse = parseJesseSpeech('buy $100 of AAPLx');
    assert.equal(parse.command?.type, 'draft');
    assert.equal(parse.spans?.amount, '$100');
  });
});

describe('provenanceFromParse', () => {
  it('marks every said field on a fresh instruction', () => {
    const parse = parseJesseSpeech('buy 100 USDC of AAPLx');
    const prov = provenanceFromParse(parse, emptyDraft);
    assert.equal(prov.side?.kind, 'said');
    assert.equal(prov.amount?.kind, 'said');
    assert.equal(prov.instrument?.kind, 'said');
    if (prov.instrument?.kind === 'said') {
      assert.equal(prov.instrument.phrase, 'buy 100 USDC of AAPLx');
      assert.equal(prov.instrument.excerpt, 'AAPLx');
    }
    assert.equal(prov.amount?.value, '100');
  });

  it('keeps a side the correction did not say', () => {
    const parse = parseJesseSpeech('make that 50 USDC', buyDraft);
    const prov = provenanceFromParse(parse, buyDraft);
    assert.equal(prov.side?.kind, 'kept');
    assert.equal(prov.amount?.kind, 'said');
    assert.equal(prov.instrument?.kind, 'kept');
  });

  it('flags a side the parser inferred against the prior slip', () => {
    const sellDraft: JesseDraft = { instrumentId: apple.id, side: 'sell', unit: 'scaled-token', amount: '5' };
    const parse = parseJesseSpeech('make that 50 USDC', sellDraft);
    const prov = provenanceFromParse(parse, sellDraft);
    assert.equal(prov.side?.kind, 'inferred');
  });

  it('returns nothing for non-draft commands', () => {
    const parse = parseJesseSpeech('cancel');
    assert.deepEqual(provenanceFromParse(parse, buyDraft), {});
  });
});

describe('markFor', () => {
  it('returns the mark while the slip holds the recorded value', () => {
    const prov = provenanceFromParse(parseJesseSpeech('buy 100 USDC of AAPLx'), emptyDraft);
    const mark = markFor(prov, 'amount', '100');
    assert.equal(mark?.kind, 'said');
  });

  it('returns null on a value mismatch — stale marks never render', () => {
    const prov = provenanceFromParse(parseJesseSpeech('buy 100 USDC of AAPLx'), emptyDraft);
    assert.equal(markFor(prov, 'amount', '50'), null);
    assert.equal(markFor(prov, 'amount', null), null);
  });
});

describe('mergeProvenance', () => {
  it('lets newer marks replace older ones per field', () => {
    const first = provenanceFromParse(parseJesseSpeech('buy 100 USDC of AAPLx'), emptyDraft);
    const merged = mergeProvenance(first, { amount: { kind: 'hand', value: '50' } });
    assert.equal(merged.amount?.kind, 'hand');
    assert.equal(merged.side?.kind, 'said');
  });
});

describe('handMarks', () => {
  it('marks only the field the client actually touched', () => {
    const prov = handMarks({ amount: '5', side: 'buy', unit: 'USDC' }, 'amount');
    assert.deepEqual(prov, { amount: { kind: 'hand', value: '5' } });
    assert.equal(handMarks({ side: 'sell' }, 'side').side?.kind, 'hand');
    assert.equal(handMarks({ side: 'buy' }, 'amount').amount, undefined);
    /* 'units' edits are side edits. */
    assert.equal(handMarks({ side: 'sell' }, 'units').side?.value, 'sell');
  });
});

describe('spansInVerbatim', () => {
  it('keeps a span the client actually said and drops rewrite-only words', () => {
    /* "Um buy uh 100 of Nvidia" cleaned to "Buy 100 USDC of NVDA": the
       rewrite's 'USDC' span was never spoken. */
    const spans = { side: 'buy', amount: '100 USDC', instrument: 'Nvidia' };
    const kept = spansInVerbatim(spans, 'Um buy uh 100 of Nvidia');
    assert.equal(kept?.side, 'buy');
    assert.equal(kept?.amount, undefined);
    assert.equal(kept?.instrument, 'Nvidia');
  });
  it('normalizes case and whitespace when checking the verbatim', () => {
    const kept = spansInVerbatim({ amount: 'twenty five dollars' }, 'buy  twenty   five  dollars of apple');
    assert.equal(kept?.amount, 'twenty five dollars');
  });
  it('passes spans through when there is no verbatim to check', () => {
    const spans = { side: 'buy' };
    assert.equal(spansInVerbatim(spans, null), spans);
    assert.equal(spansInVerbatim(undefined, 'buy 100'), undefined);
  });
});
