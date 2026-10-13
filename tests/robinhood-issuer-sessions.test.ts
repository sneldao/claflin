import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRhjCache,
  fetchRhjAssets,
  parseTradingCapabilities,
  type RhjAsset,
} from '../lib/robinhood/rhj.ts';
import { readRobinhoodEvidence, type RobinhoodEvidence } from '../lib/robinhood/duplex.ts';
import { parseRobinhoodEvidence } from '../lib/robinhood/paper.ts';
import { ROBINHOOD_INSTRUMENTS } from '../lib/robinhood/catalog.ts';

const instrument = ROBINHOOD_INSTRUMENTS.find(i => i.symbol === 'NVDA')!;
const NOW = 1_900_000_000_000;

describe('rhj tradingCapabilities parsing', () => {
  it('maps the live nested whole/fractional shape', () => {
    const caps = parseTradingCapabilities({
      market: { whole: 'TRADING_STATUS_TRADABLE', fractional: 'TRADING_STATUS_TRADABLE' },
      extended: { whole: 'TRADING_STATUS_UNTRADABLE', fractional: 'TRADING_STATUS_UNTRADABLE' },
      overnight: { whole: 'TRADING_STATUS_TRADABLE', fractional: 'TRADING_STATUS_UNTRADABLE' },
    });
    assert.deepEqual(caps, { market: 'tradable', extended: 'untradable', overnight: 'tradable' });
  });

  it('maps the flat per-session string shape', () => {
    const caps = parseTradingCapabilities({
      market: 'TRADING_STATUS_TRADABLE',
      extended: 'TRADING_STATUS_UNTRADABLE',
      overnight: 'TRADING_STATUS_HYPOTHETICAL_FUTURE',
    });
    assert.deepEqual(caps, { market: 'tradable', extended: 'untradable', overnight: 'unknown' });
  });

  it('fails closed to unknown — never a permission', () => {
    assert.deepEqual(parseTradingCapabilities({}), { market: 'unknown', extended: 'unknown', overnight: 'unknown' });
    assert.deepEqual(parseTradingCapabilities({ market: 42, extended: null, overnight: 'nonsense' }),
      { market: 'unknown', extended: 'unknown', overnight: 'unknown' });
    assert.equal(parseTradingCapabilities(null), null);
    assert.equal(parseTradingCapabilities('TRADING_STATUS_TRADABLE'), null);
  });

  it('fetchRhjAssets carries parsed capabilities through', async () => {
    clearRhjCache();
    const assets = await fetchRhjAssets(async () => new Response(JSON.stringify([{
      tokenSymbol: 'NVDA',
      tokenName: 'NVIDIA',
      currentMultiplier: '1.000775',
      status: 'ASSET_STATUS_ACTIVE',
      deployments: [{ chainId: 4663, contractAddress: instrument.contractAddress }],
      tradingCapabilities: {
        market: { whole: 'TRADING_STATUS_TRADABLE', fractional: 'TRADING_STATUS_TRADABLE' },
        extended: { whole: 'TRADING_STATUS_TRADABLE', fractional: 'TRADING_STATUS_TRADABLE' },
        overnight: { whole: 'TRADING_STATUS_UNTRADABLE', fractional: 'TRADING_STATUS_UNTRADABLE' },
      },
    }]), { status: 200 }));
    assert.deepEqual(assets.get('NVDA')?.tradingCapabilities,
      { market: 'tradable', extended: 'tradable', overnight: 'untradable' });
  });
});

function issuerAsset(overrides: Partial<RhjAsset> = {}): RhjAsset {
  return {
    symbol: 'NVDA',
    name: 'NVIDIA',
    contractAddress: instrument.contractAddress,
    chainId: 4663,
    currentMultiplier: '1.000775',
    status: 'ASSET_STATUS_ACTIVE',
    tradingCapabilities: { market: 'tradable', extended: 'tradable', overnight: 'untradable' },
    ...overrides,
  };
}

async function evidenceWithAssets(readAssets: () => Promise<Map<string, RhjAsset>>): Promise<RobinhoodEvidence> {
  return readRobinhoodEvidence({
    instrumentId: instrument.id,
    now: NOW,
    readAssets,
    readFeeds: async () => [{ answer: 231_396_630_28n, decimals: 8, updatedAt: Math.floor(NOW / 1000) - 60 }],
    fetchImpl: async (input) => {
      if (String(input).includes('/rhj/prices')) {
        return new Response(JSON.stringify([{
          symbol: 'NVDA',
          bid: 231.29,
          ask: 231.33,
          tokenBid: 231.46,
          tokenAsk: 231.50,
          isTradingHalt: false,
          generatedAt: '2026-10-01T22:45:48.022470597Z',
        }]), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
  });
}

describe('evidence tape session board', () => {
  it('surfaces issuer-declared sessions when the catalog agrees', async () => {
    const evidence = await evidenceWithAssets(async () => new Map([['NVDA', issuerAsset()]]));
    assert.equal(evidence.status, 'comparable');
    assert.deepEqual(evidence.issuerSessions, { market: 'tradable', extended: 'tradable', overnight: 'untradable' });
    assert.ok(!evidence.reasonCodes.includes('issuer-catalog-drift'));
    assert.ok(!evidence.reasonCodes.includes('issuer-inactive'));
  });

  it('labels a contract-address drift against the live issuer catalog', async () => {
    const evidence = await evidenceWithAssets(async () =>
      new Map([['NVDA', issuerAsset({ contractAddress: '0x' + 'ab'.repeat(20) })]]));
    assert.ok(evidence.reasonCodes.includes('issuer-catalog-drift'));
    assert.ok(evidence.issuerSessions);
  });

  it('labels an inactive asset even while the quote still answers', async () => {
    const evidence = await evidenceWithAssets(async () =>
      new Map([['NVDA', issuerAsset({ status: 'ASSET_STATUS_CANCELLED' })]]));
    assert.ok(evidence.reasonCodes.includes('issuer-inactive'));
  });

  it('labels a catalogued symbol missing from the live asset list', async () => {
    const evidence = await evidenceWithAssets(async () => new Map());
    assert.ok(evidence.reasonCodes.includes('issuer-catalog-drift'));
    assert.equal(evidence.issuerSessions, null);
  });

  it('stays silent on the drift question when the catalog cannot answer', async () => {
    const evidence = await evidenceWithAssets(async () => { throw new Error('provider-unavailable'); });
    assert.equal(evidence.issuerSessions, null);
    assert.ok(!evidence.reasonCodes.includes('issuer-catalog-drift'));
    assert.ok(!evidence.reasonCodes.includes('issuer-inactive'));
  });
});

function freshEvidence(): RobinhoodEvidence {
  return {
    version: 1,
    source: 'venue-triplex',
    instrumentId: instrument.id,
    symbol: 'NVDA',
    contractAddress: instrument.contractAddress,
    observedAt: NOW,
    status: 'comparable',
    issuer: {
      underlyingBid: '231.29',
      underlyingAsk: '231.33',
      tokenBid: '231.46',
      tokenAsk: '231.5',
      halted: false,
      generatedAt: null,
    },
    issuerSessions: { market: 'tradable', extended: 'unknown', overnight: 'untradable' },
    onchain: null,
    venue: null,
    venueVsIssuerBps: null,
    onchainVsIssuerBps: null,
    venueVsOnchainBps: null,
    reasonCodes: ['issuer-catalog-drift'],
    disclaimer: 'x',
  };
}

describe('evidence schema round trip', () => {
  it('accepts the session board and the new reason codes', () => {
    const parsed = parseRobinhoodEvidence(freshEvidence());
    assert.deepEqual(parsed.issuerSessions, { market: 'tradable', extended: 'unknown', overnight: 'untradable' });
  });

  it('reads records filed before the session board existed', () => {
    const legacy: Record<string, unknown> = { ...freshEvidence() };
    delete legacy.issuerSessions;
    const parsed = parseRobinhoodEvidence(legacy);
    assert.equal(parsed.issuerSessions, null);
  });

  it('refuses a session status the issuer never declared', () => {
    const forged = freshEvidence();
    forged.issuerSessions = { market: 'tradable', extended: 'tradable', overnight: 'guaranteed' } as never;
    assert.throws(() => parseRobinhoodEvidence(forged));
  });
});
