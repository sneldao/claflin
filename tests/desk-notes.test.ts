import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_DESKS, getHouseDesk, isOpenDesk, OPEN_DESK_ID } from '../lib/house';
import { deskNoteOfTheDay } from '../lib/desk-notes';
import { fetchJson } from '../lib/api-client';

describe('the house roster', () => {
  it('names every broker with a full name and a room-ready short name', () => {
    for (const desk of HOUSE_DESKS) {
      assert.ok(desk.name.trim().length > 0, `${desk.id} needs a name`);
      assert.ok(desk.name.includes(' '), `${desk.name} should carry a full name`);
      assert.ok(desk.shortName.length > 0 && desk.shortName.length <= desk.name.length);
    }
    assert.equal(getHouseDesk('hetty')?.name, 'Hetty Green');
    assert.equal(getHouseDesk('arbitrum')?.name, 'Jay Cooke');
  });
  it('keeps Hetty as the only open desk and the desk order stable', () => {
    assert.equal(OPEN_DESK_ID, 'hetty');
    assert.ok(isOpenDesk('hetty'));
    assert.ok(!isOpenDesk('arbitrum'));
    assert.deepEqual(HOUSE_DESKS.map(d => d.market), ['Base', 'Solana', 'Robinhood Chain', 'Arbitrum']);
  });
  it('gives the Arbitrum desk its rails-first approach instead of a placeholder', () => {
    const arbitrum = getHouseDesk('arbitrum')!;
    assert.doesNotMatch(arbitrum.approach, /TBD|to be defined/i);
    assert.match(arbitrum.approach, /rails|distribution|money/i);
  });
});

describe('desk notes of the day', () => {
  it('is stable within a day and varies across days', () => {
    const morning = new Date('2026-09-09T09:00:00');
    const evening = new Date('2026-09-09T21:00:00');
    const tomorrow = new Date('2026-09-10T09:00:00');
    const a = deskNoteOfTheDay('hetty', morning);
    assert.deepEqual(deskNoteOfTheDay('hetty', evening), a);
    assert.notDeepEqual(deskNoteOfTheDay('hetty', tomorrow), a);
  });
  it('varies by desk on the same day', () => {
    const day = new Date('2026-09-09T12:00:00');
    const desks = ['hetty', 'jesse', 'isabel', 'arbitrum'] as const;
    const notes = desks.map(id => deskNoteOfTheDay(id, day).text);
    assert.equal(new Set(notes).size, notes.length);
  });
  it('never speaks in imperative trading advice', () => {
    const day = new Date('2026-09-09T12:00:00');
    for (const desk of HOUSE_DESKS) {
      for (let offset = 0; offset < 40; offset++) {
        const note = deskNoteOfTheDay(desk.id, new Date(day.getTime() + offset * 86_400_000));
        assert.doesNotMatch(note.text, /\b(you should|you must|buy now|sell now|guaranteed|risk-free)\b/i);
        assert.ok(note.text.length > 20 && note.text.length < 240, `note length out of range: ${note.text}`);
      }
    }
  });
  it('labels every attributed line and keeps unattributed lines clearly generic', () => {
    const day = new Date('2026-09-09T12:00:00');
    for (const desk of HOUSE_DESKS) {
      for (let offset = 0; offset < 40; offset++) {
        const note = deskNoteOfTheDay(desk.id, new Date(day.getTime() + offset * 86_400_000));
        if (note.attribution) assert.ok(note.attribution.startsWith('attributed to') || note.attribution.length <= 20);
        else assert.ok(!/^[“"]/.test(note.text) || note.text.includes('Hetty') || note.text.includes('Cooke'), `unattributed quote-like line: ${note.text}`);
      }
    }
  });
  it('falls back to the open desk for an unknown desk id', () => {
    const note = deskNoteOfTheDay('unknown' as never, new Date('2026-09-09T12:00:00'));
    assert.ok(note.text.length > 0);
  });
});

describe('json-safe client responses', () => {
  it('returns a discriminated result and never throws', async () => {
    const ok = await fetchJson('/https://example.invalid', { method: 'GET' });
    assert.equal(ok.ok, false);
    if (!ok.ok) assert.equal(ok.error.status, 0);
  });
  it('maps every failure to copy, never a parse error', async () => {
    const result = await fetchJson('/https://example.invalid');
    assert.ok(!result.ok);
    if (!result.ok) {
      assert.ok(result.error.message.length > 0);
      assert.doesNotMatch(result.error.message, /Unexpected token|DOCTYPE|JSON/i);
    }
  });
});
