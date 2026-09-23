import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trackSuperseded, type SupersededSlip } from '../lib/desk/superseded.ts';
import { JESSE_VOCAB, slipOneLine } from '../lib/desk/written-slip.ts';
import { SOLANA_PAPER_ESTIMATE_FIXTURE } from '../lib/solana/fixtures.ts';

const q1 = SOLANA_PAPER_ESTIMATE_FIXTURE;
const q2 = { ...SOLANA_PAPER_ESTIMATE_FIXTURE, id: 'solana-fixture-quote-2' };
const q3 = { ...SOLANA_PAPER_ESTIMATE_FIXTURE, id: 'solana-fixture-quote-3' };
const q4 = { ...SOLANA_PAPER_ESTIMATE_FIXTURE, id: 'solana-fixture-quote-4' };

const line = (q: typeof q1) => slipOneLine(q, JESSE_VOCAB);
const before = (quote: typeof q1 | null, stage: string) => ({
  quoteId: quote?.id ?? null,
  line: quote ? line(quote) : null,
  stage,
});
const after = (quote: typeof q1 | null, stage: string, draftEmpty = false) => ({
  quoteId: quote?.id ?? null,
  stage,
  draftEmpty,
});

describe('trackSuperseded', () => {
  it('strikes the old price when a fresh estimate lands', () => {
    const next = trackSuperseded([], before(q1, 'review'), after(q2, 'review'), 1000);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, q1.id);
    assert.equal(next[0].reason, 'corrected');
    assert.match(next[0].line, /Sell 5\.5 scaled units of AAPLx/);
    assert.equal(next[0].at, 1000);
  });

  it('tags a cancelled quote as set aside', () => {
    const next = trackSuperseded([], before(q1, 'review'), after(null, 'cancelled'), 1000);
    assert.equal(next[0].reason, 'set-aside');
  });

  it('clears when the slip is filed or emptied', () => {
    const existing: SupersededSlip[] = [{ id: q1.id, line: 'x', reason: 'corrected', at: 1 }];
    assert.deepEqual(trackSuperseded(existing, before(q1, 'review'), after(q1, 'saved'), 2), []);
    assert.deepEqual(trackSuperseded(existing, before(q1, 'review'), after(null, 'draft', true), 2), []);
  });

  it('returns the same list untouched when nothing changed', () => {
    const prev: SupersededSlip[] = [];
    assert.equal(trackSuperseded(prev, before(null, 'draft'), after(null, 'draft'), 1), prev);
    assert.equal(trackSuperseded(prev, before(q1, 'review'), after(q1, 'review'), 1), prev);
    // First quote arriving is not a correction — nothing was struck.
    assert.equal(trackSuperseded(prev, before(null, 'draft'), after(q1, 'review'), 1), prev);
  });

  it('never duplicates an id', () => {
    let list: SupersededSlip[] = [];
    list = trackSuperseded(list, before(q1, 'review'), after(q2, 'review'), 1);
    list = trackSuperseded(list, before(q2, 'review'), after(q1, 'review'), 2);
    list = trackSuperseded(list, before(q1, 'review'), after(q2, 'review'), 3);
    assert.deepEqual(list.map(s => s.id).sort(), [q1.id, q2.id].sort());
  });

  it('caps at three, newest first', () => {
    let list: SupersededSlip[] = [];
    list = trackSuperseded(list, before(q1, 'review'), after(q2, 'review'), 1);
    list = trackSuperseded(list, before(q2, 'review'), after(q3, 'review'), 2);
    list = trackSuperseded(list, before(q3, 'review'), after(q4, 'review'), 3);
    list = trackSuperseded(list, before(q4, 'review'), after(q1, 'review'), 4);
    assert.equal(list.length, 3);
    assert.equal(list[0].id, q4.id);
    assert.ok(!list.some(s => s.id === q1.id));
  });
});
