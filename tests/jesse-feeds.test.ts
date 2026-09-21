import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JESSE_FEED_MAPPINGS,
  allJesseFeedIds,
  feedMappingFor,
  feedMappingsAreCatalogBound,
  feedSymbolForId,
} from '../lib/solana/market/feeds.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';

describe('jesse pyth feed mapping (E2 item 1)', () => {
  it('covers exactly the allowlisted Jesse instruments', () => {
    assert.equal(JESSE_FEED_MAPPINGS.length, SOLANA_INSTRUMENTS.length);
    assert.equal(feedMappingsAreCatalogBound(), true);
    for (const instrument of SOLANA_INSTRUMENTS) {
      assert.ok(feedMappingFor(instrument.id), `missing mapping for ${instrument.symbol}`);
    }
  });

  it('carries the symbology-verified numeric ids (never Hermes hex)', () => {
    const aaplx = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
    const nvdax = SOLANA_INSTRUMENTS.find(i => i.symbol === 'NVDAx')!;
    const tslax = SOLANA_INSTRUMENTS.find(i => i.symbol === 'TSLAx')!;
    assert.equal(feedMappingFor(aaplx.id)?.equity.feedId, 922);
    assert.equal(feedMappingFor(aaplx.id)?.token.feedId, 1792);
    assert.equal(feedMappingFor(aaplx.id)?.redemptionRate.feedId, 1791);
    assert.equal(feedMappingFor(nvdax.id)?.equity.feedId, 1314);
    assert.equal(feedMappingFor(nvdax.id)?.token.feedId, 1833);
    assert.equal(feedMappingFor(nvdax.id)?.redemptionRate.feedId, 1832);
    assert.equal(feedMappingFor(tslax.id)?.equity.feedId, 1435);
    assert.equal(feedMappingFor(tslax.id)?.token.feedId, 1847);
    assert.equal(feedMappingFor(tslax.id)?.redemptionRate.feedId, 1846);
  });

  it('names the provider symbols and units truthfully', () => {
    for (const mapping of JESSE_FEED_MAPPINGS) {
      assert.match(mapping.equity.symbol, /^Equity\.US\.[A-Z]+\/USD$/);
      assert.equal(mapping.equity.unit, 'usd-per-share');
      assert.match(mapping.token.symbol, /^Crypto\.[A-Z]+X\/USD$/);
      assert.match(mapping.redemptionRate.symbol, /^Crypto\.[A-Z]+X\/[A-Z]+\.RR$/);
      assert.equal(mapping.basisSource.includes('pyth.dourolabs.app'), true);
      assert.equal(mapping.verifiedAt, '2026-09-17');
    }
  });

  it('locks the token unit basis to usd-per-raw-token after Lazer verification', () => {
    for (const mapping of JESSE_FEED_MAPPINGS) {
      assert.equal(mapping.tokenUnitBasis, 'usd-per-raw-token');
      assert.equal(mapping.basisVerifiedAt, '2026-09-21');
      assert.match(mapping.basisSource, /Pt≈Pe×R/);
    }
    assert.equal(feedSymbolForId(922), 'Equity.US.AAPL/USD');
    assert.equal(feedSymbolForId(1792), 'Crypto.AAPLX/USD');
  });

  it('lists every feed id for the daemon subscription, deduplicated', () => {
    const ids = allJesseFeedIds();
    assert.deepEqual(ids, [922, 1314, 1435, 1791, 1792, 1832, 1833, 1846, 1847]);
    assert.equal(new Set(ids).size, ids.length);
  });
});
