import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { brokerTake } from '../lib/desk/broker-take';
import type { MarketClock } from '../lib/market-clock';
import type { DeskMark } from '../lib/trading/marks-shared';

const OPEN: MarketClock = { exchange: 'open', etLabel: 'Wed 11:00 AM ET', line: '', calendarKnown: true };
const CLOSED: MarketClock = { exchange: 'closed', etLabel: 'Sun 2:00 AM ET', line: '', calendarKnown: true };

function mark(symbol: string, bps: string | null, status: DeskMark['reference']['status'] = 'observed'): DeskMark {
  return {
    instrumentId: `sol:${symbol}`,
    symbol,
    name: symbol,
    reference: { status, source: 'jupiter-price-v3', priceUsdPerToken: '100', session: 'unknown', pauseStatus: 'unchecked' },
    stockReference: { priceUsd: '100', source: 'backed', differenceBps: bps },
  };
}

describe('broker take', () => {
  it('is silent without a clock and for desks without a voice', () => {
    assert.equal(brokerTake('hetty', [], null), null);
    assert.equal(brokerTake('jesse', [mark('AAPLx', '40')], null), null);
    assert.equal(brokerTake('isabel', [], OPEN), null);
  });

  it('gives Hetty a downside-first line for each exchange state', () => {
    assert.equal(brokerTake('hetty', [], CLOSED), 'The exchange is shut, so the onchain price is the only price tonight. Read what the slip costs you before the number you hope for.');
    assert.equal(brokerTake('hetty', [], OPEN), 'The exchange is open and the reference marks move with it. Count what being wrong would cost before you count anything else.');
  });

  it('has Jesse name the widest observed gap, over or under', () => {
    const marks = [mark('AAPLx', '12.4'), mark('NVDAx', '-42.0'), mark('TSLAx', '5')];
    assert.equal(
      brokerTake('jesse', marks, OPEN),
      'NVDAx is printing 42.0 bps under its stock reference on Solana. The gap is the tape talking — not a promise it closes.',
    );
    assert.equal(
      brokerTake('jesse', [mark('AAPLx', '13.6')], CLOSED),
      'AAPLx is printing 13.6 bps over its stock reference on Solana while the exchange is shut. The gap is the tape talking — not a promise it closes.',
    );
  });

  it('takes the first mark on a tie', () => {
    assert.match(brokerTake('jesse', [mark('AAPLx', '10'), mark('NVDAx', '-10')], OPEN)!, /^AAPLx is printing 10\.0 bps over/);
  });

  it('calls a sub-basis-point gap quiet', () => {
    assert.equal(brokerTake('jesse', [mark('AAPLx', '0.4')], OPEN), 'AAPLx is tracking its stock reference within a basis point. A quiet tape tells you something too.');
  });

  it('ignores stale marks and missing gaps, falling back to the clock', () => {
    const marks = [mark('AAPLx', '80', 'stale'), mark('NVDAx', null)];
    assert.equal(brokerTake('jesse', marks, CLOSED), 'The exchange is shut; the tape here is still printing. Watch the price, not the story.');
    assert.equal(brokerTake('jesse', [], OPEN), 'Both tapes are running. I watch where they disagree.');
  });
});
