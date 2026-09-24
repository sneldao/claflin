import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bellLine, formatBellCountdown, marketClock, nextBell } from '../lib/market-clock';

const at = (iso: string) => new Date(iso);

describe('market clock', () => {
  it('is open during the NYSE regular session', () => {
    // Wed 2026-09-23 10:00 ET (EDT, UTC-4)
    const clock = marketClock(at('2026-09-23T14:00:00Z'));
    assert.equal(clock.exchange, 'open');
    assert.equal(clock.calendarKnown, true);
    assert.match(clock.etLabel, /^Wed 10:00 AM ET$/);
    assert.match(clock.line, /^NYSE open · Wed 10:00 AM ET — the onchain book trades alongside\.$/);
  });

  it('treats the session bounds as open-inclusive, close-exclusive', () => {
    assert.equal(marketClock(at('2026-09-23T13:29:00Z')).exchange, 'closed'); // 09:29 ET
    assert.equal(marketClock(at('2026-09-23T13:30:00Z')).exchange, 'open');  // 09:30 ET
    assert.equal(marketClock(at('2026-09-23T20:00:00Z')).exchange, 'closed'); // 16:00 ET
  });

  it('is closed on weekends', () => {
    // Sat 2026-09-26 11:00 ET
    const clock = marketClock(at('2026-09-26T15:00:00Z'));
    assert.equal(clock.exchange, 'closed');
    assert.match(clock.line, /^NYSE closed · Sat 11:00 AM ET — the onchain book is open\.$/);
  });

  it('is closed on a full holiday even inside session hours', () => {
    // Thu 2026-11-26 11:00 ET (EST, UTC-5) — Thanksgiving
    assert.equal(marketClock(at('2026-11-26T16:00:00Z')).exchange, 'closed');
  });

  it('honours the 13:00 early close', () => {
    // Fri 2026-11-27 — day after Thanksgiving
    assert.equal(marketClock(at('2026-11-27T17:59:00Z')).exchange, 'open');   // 12:59 ET
    assert.equal(marketClock(at('2026-11-27T18:00:00Z')).exchange, 'closed'); // 13:00 ET
  });

  it('maps UTC correctly across the fall DST change', () => {
    // Mon 2026-11-02 09:31 ET — EST (UTC-5) after fall-back
    assert.equal(marketClock(at('2026-11-02T14:31:00Z')).exchange, 'open');
  });

  it('maps UTC correctly in EDT', () => {
    // Mon 2026-03-09 09:31 ET — EDT (UTC-4)
    assert.equal(marketClock(at('2026-03-09T13:31:00Z')).exchange, 'open');
  });
});

describe('next bell', () => {
  it('counts down to the close during the session', () => {
    // Thu 2026-09-24 11:21 ET → 16:00 ET close
    assert.deepEqual(nextBell(at('2026-09-24T15:21:00Z')), { kind: 'closes', minutes: 279 });
  });

  it('counts down to the next open overnight', () => {
    // Thu 2026-09-24 16:00 ET → Fri 09:30 ET
    assert.deepEqual(nextBell(at('2026-09-24T20:00:00Z')), { kind: 'opens', minutes: 17 * 60 + 30 });
  });

  it('skips the weekend', () => {
    // Sat 2026-09-26 11:00 ET → Mon 09:30 ET
    assert.deepEqual(nextBell(at('2026-09-26T15:00:00Z')), { kind: 'opens', minutes: 46 * 60 + 30 });
  });

  it('skips a full holiday', () => {
    // Wed 2026-11-25 16:00 ET → Thanksgiving closed → Fri 11-27 09:30 ET
    assert.deepEqual(nextBell(at('2026-11-25T21:00:00Z')), { kind: 'opens', minutes: 41 * 60 + 30 });
  });

  it('knows the early close', () => {
    // Fri 2026-11-27 12:00 ET → 13:00 ET early close
    assert.deepEqual(nextBell(at('2026-11-27T17:00:00Z')), { kind: 'closes', minutes: 60 });
  });

  it('refuses to guess outside the known calendar', () => {
    assert.equal(nextBell(at('2028-03-01T15:00:00Z')), null);
  });

  it('formats the countdown in words a kicker can carry', () => {
    assert.equal(formatBellCountdown(45), '45m');
    assert.equal(formatBellCountdown(9 * 60 + 12), '9h 12m');
    assert.equal(formatBellCountdown(2 * 24 * 60 + 3 * 60 + 5), '2d 3h');
  });

  it('writes the kicker from the bell, or the clock line without one', () => {
    const now = at('2026-09-24T15:21:00Z');
    const clock = marketClock(now);
    assert.equal(bellLine(clock, nextBell(now)), 'NYSE open · closes in 4h 39m');
    assert.equal(bellLine(clock, null), clock.line);
  });
});
