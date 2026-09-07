import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMarksService, type FeedReading } from '../lib/trading/marks';
import { markPrice, type DeskMark } from '../lib/trading/marks-shared';

const NOW = 1_800_000_000_000;

function reading(price: number, updatedAtSec: number): FeedReading {
  return { answer: BigInt(Math.round(price * 1e8)), decimals: 8, updatedAt: updatedAtSec };
}

describe('Marks service', () => {
  test('returns marks for every quote-supported instrument, in catalog order', async () => {
    const service = createMarksService(async (feeds) => feeds.map((_, i) => reading(100 + i, NOW / 1000)), () => NOW);
    const result = await service();
    assert.equal(result.marks.length, 4);
    assert.deepEqual(result.marks.map(m => m.symbol), ['NVDAc', 'AAPLc', 'METAc', 'GOOGLc']);
    assert.equal(result.asOf, NOW);
  });

  test('per-feed failure yields an unavailable mark, not a thrown service', async () => {
    const service = createMarksService(async (feeds) => feeds.map((_, i) => i === 1 ? null : reading(50, NOW / 1000)), () => NOW);
    const result = await service();
    assert.equal(result.marks[1].reference.status, 'unavailable');
    assert.equal(result.marks[0].reference.status, 'observed');
  });

  test('old observations are labelled stale', async () => {
    const service = createMarksService(async (feeds) => feeds.map(() => reading(50, NOW / 1000 - 90000)), () => NOW);
    const result = await service();
    assert.equal(result.marks[0].reference.status, 'stale');
  });
});

describe('markPrice', () => {
  const base: DeskMark = { instrumentId: 'x', symbol: 'NVDAc', name: 'n', reference: { status: 'observed', source: 'chainlink', session: 'unknown', pauseStatus: 'unchecked', priceUsdPerToken: '189.42' } };
  test('formats observed prices', () => assert.equal(markPrice(base), '189.42'));
  test('keeps the last price on a stale mark — the tape labels it', () => {
    assert.equal(markPrice({ ...base, reference: { ...base.reference, status: 'stale' } }), '189.42');
    assert.equal(markPrice({ ...base, reference: { ...base.reference, status: 'unavailable', priceUsdPerToken: undefined } }), null);
  });
  test('rejects non-positive or non-finite values', () => {
    assert.equal(markPrice({ ...base, reference: { ...base.reference, priceUsdPerToken: '0' } }), null);
    assert.equal(markPrice({ ...base, reference: { ...base.reference, priceUsdPerToken: 'abc' } }), null);
  });
});
