import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { watchPaperLaunch, priceAlongPath } from '../lib/meteora/watch';
import type { HalleyPaperRecord } from '../lib/meteora/paper';

const HOUR = 3_600_000;

function record(over: { id?: string; createdAt?: number } = {}): HalleyPaperRecord {
  const estimate = {
    version: 1,
    id: over.id ?? 'halley-test-1',
    kind: 'launch-estimate',
    mode: 'paper',
    deskId: 'halley',
    mandateId: 'meteora-launch',
    network: 'solana:mainnet',
    venue: 'meteora-dbc',
    intent: {
      name: 'Test Tracker', symbol: 'TTRK', anchorSymbol: 'NVDA',
      quoteSymbol: 'USDC', curve: 'equity-pair', supply: '1000000', graduationQuote: '150',
    },
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwygTD',
    quoteDecimals: 6,
    quoteBadge: null,
    anchor: null,
    openingPriceQuote: '227.1',
    graduationPriceQuote: '250.5',
    sqrtStart: '1', sqrtMin: '1', sqrtMax: '2',
    migrationQuoteThreshold: '150000000',
    path: [
      { progress: '0', priceQuote: '227.1' },
      { progress: '0.1111111111111111', priceQuote: '229.7' },
      { progress: '0.2222222222222222', priceQuote: '232.3' },
      { progress: '0.3333333333333333', priceQuote: '234.9' },
      { progress: '0.4444444444444444', priceQuote: '237.5' },
      { progress: '0.5555555555555556', priceQuote: '240.1' },
      { progress: '0.6666666666666666', priceQuote: '242.7' },
      { progress: '0.7777777777777778', priceQuote: '245.3' },
      { progress: '0.8888888888888888', priceQuote: '247.9' },
      { progress: '1', priceQuote: '250.5' },
    ],
    migration: { target: 'damm-v2', config: '', lockedLiquidityBps: 1000 },
    tradingFeeBps: 100,
    migrationFeeBps: 25,
    quotedAt: over.createdAt ?? 1_000,
    expiresAt: (over.createdAt ?? 1_000) + 60_000,
    assumptions: 'test',
  };
  return {
    version: 2,
    id: estimate.id,
    mode: 'paper',
    deskId: 'halley',
    owner: 'anonymous',
    createdAt: over.createdAt ?? 1_000,
    estimate,
  } as unknown as HalleyPaperRecord;
}

describe('priceAlongPath', () => {
  const path = [
    { progress: '0', priceQuote: '100' },
    { progress: '0.5', priceQuote: '200' },
    { progress: '1', priceQuote: '300' },
  ];
  it('hits the nodes exactly', () => {
    assert.equal(priceAlongPath(path, 0), 100);
    assert.equal(priceAlongPath(path, 0.5), 200);
    assert.equal(priceAlongPath(path, 1), 300);
  });
  it('interpolates between nodes', () => {
    assert.equal(priceAlongPath(path, 0.25), 150);
    assert.equal(priceAlongPath(path, 0.75), 250);
  });
});

describe('watchPaperLaunch', () => {
  const createdAt = 1_000;
  const rec = record({ createdAt });

  it('starts at the opening of the curve', () => {
    const tape = watchPaperLaunch(rec, createdAt);
    assert.equal(tape.progress, 0);
    assert.equal(tape.collectedQuote, 0);
    assert.equal(tape.currentPriceQuote, 227.1);
    assert.equal(tape.graduated, false);
  });

  it('is deterministic — same record, same clock, same reading', () => {
    const now = createdAt + 5 * HOUR;
    assert.deepEqual(watchPaperLaunch(rec, now), watchPaperLaunch(rec, now));
  });

  it('fills toward graduation as the tape runs', () => {
    const early = watchPaperLaunch(rec, createdAt + HOUR);
    const later = watchPaperLaunch(rec, createdAt + 24 * HOUR);
    assert.ok(later.progress > early.progress);
    assert.ok(later.progress <= 1);
    assert.ok(later.currentPriceQuote >= early.currentPriceQuote);
  });

  it('never over-collects the threshold, and graduates on the replay', () => {
    const tape = watchPaperLaunch(rec, createdAt + 96 * HOUR);
    assert.ok(tape.collectedQuote <= 150 + 1e-9);
    assert.ok(tape.collectedQuote >= 149);
    assert.equal(tape.graduated, true);
    assert.equal(tape.hoursToGraduation, 0);
  });

  it('counts time backwards from creation, never before launch', () => {
    const tape = watchPaperLaunch(rec, createdAt - 10 * HOUR);
    assert.equal(tape.progress, 0);
  });

  it('reports the quote symbol and prices in the filed estimate\'s units', () => {
    const tape = watchPaperLaunch(rec, createdAt + 2 * HOUR);
    assert.equal(tape.quoteSymbol, 'USDC');
    assert.equal(tape.openingPriceQuote, 227.1);
    assert.equal(tape.graduationPriceQuote, 250.5);
  });
});
