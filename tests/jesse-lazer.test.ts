import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLazerSubscribeMessage,
  extractLazerFeeds,
  lazerRowToSnapshot,
  mantissaToDecimal,
  parseLazerPriceFeed,
} from '../lib/solana/market/lazer.ts';

describe('pyth lazer parsing', () => {
  it('formats mantissa × 10^exponent without floats', () => {
    assert.equal(mantissaToDecimal(33861225n, -5), '338.61225');
    assert.equal(mantissaToDecimal(100n, -2), '1');
    assert.equal(mantissaToDecimal(5n, -3), '0.005');
    assert.equal(mantissaToDecimal(-150n, -2), '-1.5');
  });

  it('parses a streamUpdated payload into snapshots', () => {
    const message = {
      type: 'streamUpdated',
      parsed: {
        timestampUs: '1790006842000000',
        priceFeeds: [
          {
            priceFeedId: 922,
            price: '33861225',
            confidence: '1000',
            exponent: -5,
            marketSession: 'regular',
            feedUpdateTimestamp: 1790006842000000,
            publisherCount: 4,
          },
        ],
      },
    };
    const rows = extractLazerFeeds(message);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.priceFeedId, 922);
    const snap = lazerRowToSnapshot(rows[0]!, 1_900_000_000_000);
    assert.equal(snap?.symbol, 'Equity.US.AAPL/USD');
    assert.equal(snap?.price, '338.61225');
    assert.equal(snap?.session, 'regular');
    assert.equal(snap?.generatedAt, 1_790_006_842_000);
  });

  it('refuses unknown feed ids at snapshot time', () => {
    const row = parseLazerPriceFeed({
      priceFeedId: 999999,
      price: '1',
      exponent: -2,
      marketSession: 'regular',
      feedUpdateTimestamp: 1000,
    });
    assert.ok(row);
    assert.equal(lazerRowToSnapshot(row!, 1), null);
  });

  it('builds an off-chain subscribe message', () => {
    const body = JSON.parse(buildLazerSubscribeMessage([922, 1792]));
    assert.equal(body.type, 'subscribe');
    assert.deepEqual(body.formats, []);
    assert.equal(body.channel, 'fixed_rate@1000ms');
    assert.equal(body.ignoreInvalidFeeds, true);
  });
});
