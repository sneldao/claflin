import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_ALIGNMENT_MS,
  COMPARISON_FRESHNESS_MS,
  buildMarketComparison,
  type FeedSnapshot,
} from '../lib/solana/market/compare.ts';
import { feedMappingFor, type JesseFeedMapping } from '../lib/solana/market/feeds.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';

const T0 = 1_900_000_000_000;
const aaplx = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const baseMapping = feedMappingFor(aaplx.id)!;

const scaledMapping: JesseFeedMapping = { ...baseMapping, tokenUnitBasis: 'usd-per-scaled-token', basisVerifiedAt: null };
const rawMapping: JesseFeedMapping = { ...baseMapping, tokenUnitBasis: 'usd-per-raw-token' };
const unverifiedMapping: JesseFeedMapping = { ...baseMapping, tokenUnitBasis: null, basisVerifiedAt: null };

function snap(feed: 'token' | 'equity', overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  const ref = feed === 'token' ? baseMapping.token : baseMapping.equity;
  return {
    feedId: ref.feedId,
    symbol: ref.symbol,
    price: feed === 'token' ? '101' : '100',
    confidence: '0.1',
    generatedAt: T0 - 1000,
    receivedAt: T0 - 500,
    session: 'regular',
    publisherCount: 3,
    ...overrides,
  };
}

function compare(overrides: Partial<Parameters<typeof buildMarketComparison>[0]> = {}) {
  return buildMarketComparison({
    mapping: scaledMapping,
    token: snap('token'),
    equity: snap('equity'),
    multiplierAtGeneration: '1.003270125',
    now: T0,
    id: 'cmp-test',
    ...overrides,
  });
}

describe('jesse comparison policy — plan arithmetic fixtures (§4.4)', () => {
  it('normalized token 101 vs equity 100 → 100.0 bps', () => {
    const c = compare();
    assert.equal(c.status, 'comparable');
    assert.equal(c.referenceDifferenceBps, '100.0');
  });

  it('normalized token 99 vs equity 100 → -100.0 bps', () => {
    const c = compare({ token: snap('token', { price: '99' }) });
    assert.equal(c.status, 'comparable');
    assert.equal(c.referenceDifferenceBps, '-100.0');
  });

  it('raw-token price 110 with multiplier 1.1 vs equity 100 → 0.0 bps (divided once)', () => {
    const c = compare({ mapping: rawMapping, token: snap('token', { price: '110' }), multiplierAtGeneration: '1.1' });
    assert.equal(c.status, 'comparable');
    assert.equal(c.referenceDifferenceBps, '0.0');
  });

  it('rounds to one decimal, half away from zero, symmetric for negatives', () => {
    const up = compare({ token: snap('token', { price: '101.0005' }) }); // exactly 100.05 bps
    assert.equal(up.referenceDifferenceBps, '100.1');
    const down = compare({ token: snap('token', { price: '98.9995' }) }); // exactly -100.05 bps
    assert.equal(down.referenceDifferenceBps, '-100.1');
  });
});

describe('jesse comparison policy — basis and availability', () => {
  it('unverified unit basis → unavailable, number suppressed', () => {
    const c = compare({ mapping: unverifiedMapping });
    assert.equal(c.status, 'unavailable');
    assert.equal(c.referenceDifferenceBps, null);
    assert.ok(c.reasonCodes.includes('unverified-unit-basis'));
  });

  it('shipped mapping uses verified raw-token basis', () => {
    assert.equal(baseMapping.tokenUnitBasis, 'usd-per-raw-token');
  });

  it('missing token snapshot → unavailable', () => {
    const c = compare({ token: null });
    assert.equal(c.status, 'unavailable');
    assert.ok(c.reasonCodes.includes('token-unavailable'));
  });

  it('a snapshot from the wrong feed is refused, not attributed', () => {
    const c = compare({ token: snap('token', { feedId: 999999, symbol: 'Crypto.DOGE/USD' }) });
    assert.equal(c.status, 'unavailable');
    assert.ok(c.reasonCodes.includes('feed-mismatch'));
  });

  it('zero or negative prices produce no spread', () => {
    const c = compare({ equity: snap('equity', { price: '0' }) });
    assert.equal(c.status, 'unavailable');
    assert.ok(c.reasonCodes.includes('nonpositive-price'));
  });

  it('raw basis without a multiplier → unavailable, never defaults to one', () => {
    const c = compare({ mapping: rawMapping, multiplierAtGeneration: null });
    assert.equal(c.status, 'unavailable');
    assert.ok(c.reasonCodes.includes('multiplier-unavailable'));
  });

  it('missing price or generation time → unavailable', () => {
    const noPrice = compare({ token: snap('token', { price: null }) });
    assert.equal(noPrice.status, 'unavailable');
    const noGen = compare({ equity: snap('equity', { generatedAt: null }) });
    assert.equal(noGen.status, 'unavailable');
  });
});

describe('jesse comparison policy — freshness and time boundaries', () => {
  it('age exactly 15s is fresh; 15.001s is stale', () => {
    const fresh = compare({
      token: snap('token', { generatedAt: T0 - COMPARISON_FRESHNESS_MS }),
      equity: snap('equity', { generatedAt: T0 - COMPARISON_FRESHNESS_MS }),
    });
    assert.equal(fresh.status, 'comparable');
    const stale = compare({ token: snap('token', { generatedAt: T0 - COMPARISON_FRESHNESS_MS - 1 }) });
    assert.notEqual(stale.status, 'comparable');
    assert.ok(stale.reasonCodes.includes('token-stale'));
  });

  it('a carried-forward price in a fresh envelope stays stale (generatedAt rules)', () => {
    const c = compare({ equity: snap('equity', { receivedAt: T0, generatedAt: T0 - 20_000 }) });
    assert.equal(c.status, 'last-observation');
    assert.equal(c.equity.status, 'stale');
    assert.ok(c.reasonCodes.includes('equity-stale'));
    // number still allowed: fresh token, non-future equity within 7 days
    assert.equal(c.referenceDifferenceBps, '100.0');
  });

  it('alignment exactly 5s is comparable; 5.001s is a gap, in either direction', () => {
    const aligned = compare({ token: snap('token', { generatedAt: T0 - COMPARISON_ALIGNMENT_MS }), equity: snap('equity', { generatedAt: T0 }) });
    assert.equal(aligned.status, 'comparable');
    const gap = compare({ token: snap('token', { generatedAt: T0 - COMPARISON_ALIGNMENT_MS - 1 }), equity: snap('equity', { generatedAt: T0 }) });
    assert.equal(gap.status, 'last-observation');
    assert.ok(gap.reasonCodes.includes('generation-gap-exceeded'));
    // reversed arrival order — equity older than token beyond the window — is no better
    const reversed = compare({ token: snap('token', { generatedAt: T0 }), equity: snap('equity', { generatedAt: T0 - COMPARISON_ALIGNMENT_MS - 1 }) });
    assert.equal(reversed.status, 'last-observation');
    assert.ok(reversed.reasonCodes.includes('generation-gap-exceeded'));
  });

  it('more than 2s in the future is invalid; smaller skew is labelled uncertain, not comparable', () => {
    const invalid = compare({ token: snap('token', { generatedAt: T0 + 2_001 }) });
    assert.equal(invalid.status, 'unavailable');
    assert.equal(invalid.token.status, 'unavailable');
    assert.ok(invalid.reasonCodes.includes('future-timestamp-invalid'));

    const skew = compare({ token: snap('token', { generatedAt: T0 + 1_000 }) });
    assert.notEqual(skew.status, 'comparable');
    assert.equal(skew.status, 'last-observation'); // labelled uncertain, number allowed
    assert.ok(skew.reasonCodes.includes('future-skew-uncertain'));
  });

  it('a future-skewed equity suppresses the number (rule 6 requires non-future equity)', () => {
    const c = compare({ equity: snap('equity', { generatedAt: T0 + 1_000 }) });
    assert.equal(c.status, 'unavailable');
    assert.equal(c.referenceDifferenceBps, null);
    assert.ok(c.reasonCodes.includes('future-skew-uncertain'));
  });

  it('equity older than 7 days suppresses the number', () => {
    const c = compare({ equity: snap('equity', { generatedAt: T0 - 8 * 86_400_000 }) });
    assert.equal(c.status, 'unavailable');
    assert.equal(c.referenceDifferenceBps, null);
    assert.ok(c.reasonCodes.includes('equity-older-than-7-days'));
  });
});

describe('jesse comparison policy — session and confidence gates', () => {
  it('non-regular equity session → last-observation with the number, never comparable', () => {
    const c = compare({ equity: snap('equity', { session: 'postMarket' }) });
    assert.equal(c.status, 'last-observation');
    assert.equal(c.referenceDifferenceBps, '100.0');
    assert.ok(c.reasonCodes.includes('session-not-regular'));
    assert.equal(c.equity.session, 'postMarket');
  });

  it('confidence at exactly 0.5% is comparable; above it is not', () => {
    const atBound = compare({ token: snap('token', { price: '101', confidence: '0.505' }) });
    assert.equal(atBound.status, 'comparable');
    const over = compare({ token: snap('token', { price: '101', confidence: '0.5051' }) });
    assert.equal(over.status, 'last-observation');
    assert.ok(over.reasonCodes.includes('confidence-excessive'));
    // confidence gates comparable only — the labelled number still shows
    assert.equal(over.referenceDifferenceBps, '100.0');
  });

  it('unknown confidence is not comparable but does not suppress the number', () => {
    const c = compare({ equity: snap('equity', { confidence: null }) });
    assert.equal(c.status, 'last-observation');
    assert.equal(c.referenceDifferenceBps, '100.0');
    assert.ok(c.reasonCodes.includes('confidence-unknown'));
  });
});

describe('jesse comparison policy — observation integrity', () => {
  it('carries units, prices, sessions, and timing through untouched', () => {
    const c = compare({ id: 'cmp-abc' });
    assert.equal(c.id, 'cmp-abc');
    assert.equal(c.version, 1);
    assert.equal(c.instrumentId, aaplx.id);
    assert.equal(c.token.unit, 'usd-per-scaled-token');
    assert.equal(c.equity.unit, 'usd-per-share');
    assert.equal(c.token.price, '101');
    assert.equal(c.equity.price, '100');
    assert.equal(c.multiplier, '1.003270125');
    assert.equal(c.observedAt, Math.max(c.token.receivedAt, c.equity.receivedAt));
    assert.equal(c.token.source, 'pyth-pro');
  });

  it('raw-basis observations are labelled usd-per-raw-token', () => {
    const c = compare({ mapping: rawMapping, token: snap('token', { price: '110' }), multiplierAtGeneration: '1.1' });
    assert.equal(c.token.unit, 'usd-per-raw-token');
  });
});
