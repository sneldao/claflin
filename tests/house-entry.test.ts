import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSE_DESK_PREFERENCE_KEY,
  entryIntentWithInstruction,
  loadLastDesk,
  parseDeskQuery,
  parseEntryIntent,
  parseOfferingQuery,
  parseRecordQuery,
  resolveHouseEntry,
  saveLastDesk,
} from '../lib/house-entry.ts';
import { offeringForInstrument } from '../lib/desk/offerings.ts';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    setItem(key: string, value: string) { map.set(key, String(value)); },
    removeItem(key: string) { map.delete(key); },
    key() { return null; },
  };
}

describe('house entry', () => {
  it('parses known desk query values and rejects unknowns', () => {
    assert.equal(parseDeskQuery('jesse'), 'jesse');
    assert.equal(parseDeskQuery('HETTY'), 'hetty');
    assert.equal(parseDeskQuery('nope'), null);
    assert.equal(parseDeskQuery(null), null);
  });

  it('prefers ?desk= over a saved preference', () => {
    const storage = memoryStorage({ [HOUSE_DESK_PREFERENCE_KEY]: 'hetty' });
    assert.deepEqual(resolveHouseEntry('jesse', storage), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'query',
      offeringId: null,
      intent: null,
      recordId: null,
    });
  });

  it('keeps a bare visit on the foyer even when a last desk is saved', () => {
    const storage = memoryStorage();
    saveLastDesk(storage, 'jesse');
    assert.equal(loadLastDesk(storage), 'jesse');
    assert.deepEqual(resolveHouseEntry(null, storage), { kind: 'foyer' });
  });

  it('shows the foyer when nothing is chosen yet', () => {
    assert.deepEqual(resolveHouseEntry(null, memoryStorage()), { kind: 'foyer' });
  });

  it('does not restore a planned desk from preference alone', () => {
    const storage = memoryStorage({ [HOUSE_DESK_PREFERENCE_KEY]: 'isabel' });
    assert.deepEqual(resolveHouseEntry(null, storage), { kind: 'foyer' });
  });

  it('carries an offering only when the selected desk is eligible', () => {
    const base = offeringForInstrument(DESK_INSTRUMENTS[0].id)!;
    const solana = offeringForInstrument(SOLANA_INSTRUMENTS[0].id)!;

    assert.equal(parseOfferingQuery(solana.offeringId, 'jesse'), solana.offeringId);
    assert.equal(parseOfferingQuery(base.offeringId, 'hetty'), base.offeringId);
    assert.equal(parseOfferingQuery(solana.offeringId, 'hetty'), null);
    assert.equal(parseOfferingQuery(base.offeringId, 'jesse'), null);
    assert.equal(parseOfferingQuery('not-an-offering', 'jesse'), null);

    assert.deepEqual(resolveHouseEntry('jesse', memoryStorage(), solana.offeringId), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'query',
      offeringId: solana.offeringId,
      intent: null,
      recordId: null,
    });
    assert.deepEqual(resolveHouseEntry('jesse', memoryStorage(), base.offeringId), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'query',
      offeringId: null,
      intent: null,
      recordId: null,
    });
  });

  it('parses ?side=&amount= into a carried intent and rejects junk', () => {
    assert.deepEqual(parseEntryIntent('buy', '100'), { side: 'buy', amount: '100' });
    assert.deepEqual(parseEntryIntent('sell', '2.5'), { side: 'sell', amount: '2.5' });
    assert.deepEqual(parseEntryIntent('buy', null), { side: 'buy', amount: null });
    assert.deepEqual(parseEntryIntent(null, '50'), { side: null, amount: '50' });
    assert.deepEqual(parseEntryIntent('hold', '100'), { side: null, amount: '100' });
    assert.equal(parseEntryIntent(null, null), null);
    assert.equal(parseEntryIntent('hold', 'abc'), null);
    assert.deepEqual(parseEntryIntent('buy', '1e5'), { side: 'buy', amount: null });
    assert.deepEqual(parseEntryIntent('buy', '0.5'), { side: 'buy', amount: '0.5' });
    assert.deepEqual(parseEntryIntent('buy', '-10'), { side: 'buy', amount: null });
    assert.deepEqual(parseEntryIntent('buy', 'abc'), { side: 'buy', amount: null });
    assert.deepEqual(resolveHouseEntry('hetty', memoryStorage(), null, { side: 'buy', amount: '25' }), {
      kind: 'desk',
      deskId: 'hetty',
      source: 'query',
      offeringId: null,
      intent: { side: 'buy', amount: '25' },
      recordId: null,
    });
  });

  it('keeps the caller’s exact words and how they arrived on the intent', () => {
    const intent = entryIntentWithInstruction('  buy $25 of Apple  ', 'typed');
    assert.ok(intent);
    assert.equal(intent.instruction?.text, 'buy $25 of Apple');
    assert.equal(intent.instruction?.source, 'typed');
    assert.equal(intent.side, 'buy');
    assert.equal(intent.amount, '25');
    assert.equal(intent.instruction?.spans?.side, 'buy');
    assert.equal(intent.instruction?.spans?.amount, '$25');
  });

  it('keeps instrument-only phrases — an instruction with no side or amount still carries its words', () => {
    const intent = entryIntentWithInstruction('Apple', 'spoken');
    assert.ok(intent);
    assert.equal(intent.instruction?.text, 'Apple');
    assert.equal(intent.instruction?.source, 'spoken');
    assert.equal(intent.side, null);
    assert.equal(intent.amount, null);
    assert.equal(intent.instruction?.spans, undefined);
  });

  it('rejects empty instructions and caps long ones', () => {
    assert.equal(entryIntentWithInstruction('   ', 'typed'), null);
    assert.equal(entryIntentWithInstruction('', 'spoken'), null);
    const long = entryIntentWithInstruction('x'.repeat(1500), 'typed');
    assert.equal(long?.instruction?.text.length, 1000);
  });

  it('never puts instruction text or source in the URL contract', () => {
    const fromUrl = parseEntryIntent('buy', '25');
    assert.deepEqual(fromUrl, { side: 'buy', amount: '25' });
    assert.equal(fromUrl?.instruction, undefined);
    assert.equal(parseEntryIntent('typed:buy', 'buy $25 of Apple')?.instruction, undefined);
  });

  it('parses ?record= into a record deep link and rejects junk ids', () => {
    assert.equal(parseRecordQuery('rec-123_abc'), 'rec-123_abc');
    assert.equal(parseRecordQuery('plain'), 'plain');
    assert.equal(parseRecordQuery(''), null);
    assert.equal(parseRecordQuery(null), null);
    assert.equal(parseRecordQuery('has spaces'), null);
    assert.equal(parseRecordQuery('dots.bad'), null);
    assert.equal(parseRecordQuery('a'.repeat(101)), null);

    assert.deepEqual(resolveHouseEntry('hetty', memoryStorage(), null, null, 'rec-42'), {
      kind: 'desk',
      deskId: 'hetty',
      source: 'query',
      offeringId: null,
      intent: null,
      recordId: 'rec-42',
    });
    /* A junk record id must not poison an otherwise-valid desk entry. */
    assert.deepEqual(resolveHouseEntry('jesse', memoryStorage(), null, null, 'bad id!'), {
      kind: 'desk',
      deskId: 'jesse',
      source: 'query',
      offeringId: null,
      intent: null,
      recordId: null,
    });
  });
});
