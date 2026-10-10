import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { resetContainer, getRootElement } from './jsdom-setup';

import {
  isHalleyLaunchIntent,
  type HalleyAnchor,
  type HalleyLaunchIntent,
} from '../lib/meteora/contracts';
import { buildLaunchConfig, estimateLaunch, openingPriceFor, projectedPath } from '../lib/meteora/dbc';
import { quoteMintForSymbol, USDC_MINT } from '../lib/meteora/catalog';
import {
  HALLEY_DRAFT_KEY,
  HALLEY_MAX_HISTORY,
  HALLEY_PAPER_PREFIX,
  deleteHalleyPaperRecord,
  loadHalleyDraft,
  loadHalleyPaperRecords,
  parseHalleyEstimate,
  parseHalleyPaperRecord,
  saveHalleyDraft,
  saveHalleyPaperRecord,
} from '../lib/meteora/paper';
import { resolveAnchor } from '../lib/meteora/anchor';
import { useHalleyDesk, type HalleyDesk } from '../lib/meteora/useHalleyDesk';
import { ApiError } from '../lib/api-client';
import type { PaperStorage } from '../lib/trading/paper-records';
import type { SnapshotStore } from '../lib/solana/market/snapshots';
import { feedMappingFor } from '../lib/solana/market/feeds';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';

function memoryStorage(): PaperStorage & { removeItem(key: string): void } {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

const intent: HalleyLaunchIntent = {
  name: 'NVDA Tracker',
  symbol: 'NVDAT',
  anchorSymbol: 'NVDA',
  quoteSymbol: 'USDC',
  curve: 'equity-pair',
  supply: '1000000',
  graduationQuote: '150',
};

function observedAnchor(now: number, overrides: Partial<HalleyAnchor> = {}): HalleyAnchor {
  return {
    symbol: 'NVDA',
    source: 'pyth-pro',
    equityUsd: '182.50',
    pairRatio: null,
    quoteEquityUsd: null,
    observedAt: now,
    status: 'observed',
    ...overrides,
  };
}

describe('halley launch intent', () => {
  it('accepts a complete pair-first intent and a USDC fallback', () => {
    assert.ok(isHalleyLaunchIntent(intent));
    assert.ok(isHalleyLaunchIntent({ ...intent, quoteSymbol: 'AAPLx' }));
    assert.ok(isHalleyLaunchIntent({ ...intent, anchorSymbol: null }));
  });

  it('refuses malformed symbols, bad supply, and non-positive graduation lines', () => {
    assert.ok(!isHalleyLaunchIntent({ ...intent, symbol: 'x' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, symbol: 'NVDA TRACKER' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, supply: '1.5' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, supply: '0' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, graduationQuote: '0' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, graduationQuote: '-10' }));
    assert.ok(!isHalleyLaunchIntent({ ...intent, curve: 'steep' }));
    assert.ok(!isHalleyLaunchIntent(null));
  });
});

describe('halley curve estimate', () => {
  const now = 1_900_000_000_000;

  it('anchors the opening price to the Pyth equity mark for a USDC quote', () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    assert.equal(estimate.mode, 'paper');
    assert.equal(estimate.deskId, 'halley');
    assert.equal(estimate.quoteMint, USDC_MINT);
    assert.equal(estimate.quoteBadge, null);
    assert.ok(Math.abs(Number(estimate.openingPriceQuote) - 182.5) < 1);
    assert.ok(Number(estimate.graduationPriceQuote) > Number(estimate.openingPriceQuote));
    assert.equal(estimate.expiresAt - estimate.quotedAt, 60_000);
    assert.match(estimate.assumptions, /anchored to Pyth NVDA/);
    assert.match(estimate.assumptions, /not, and does not claim to be, stock ownership/);
    assert.equal(estimate.migration.target, 'damm-v2');
    assert.equal(estimate.migration.lockedLiquidityBps, 1000);
  });

  it('prices an xStock-quoted launch at the equity pair ratio', () => {
    const pairIntent: HalleyLaunchIntent = { ...intent, quoteSymbol: 'AAPLx' };
    const pair = observedAnchor(now, { pairRatio: '0.7', quoteEquityUsd: '260.71' });
    const estimate = estimateLaunch(pairIntent, pair, now);
    const quote = quoteMintForSymbol('AAPLx')!;
    assert.equal(estimate.quoteMint, quote.mint);
    assert.equal(estimate.quoteBadge, quote.badge);
    assert.ok(Math.abs(Number(estimate.openingPriceQuote) - 0.7) < 0.02);
    assert.match(estimate.assumptions, /NVDA\/AAPL ratio/);
    assert.match(estimate.assumptions, /badged xStock mint/);
  });

  it('serializes every estimate-boundary number as a string', () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    for (const key of ['openingPriceQuote', 'graduationPriceQuote', 'sqrtStart', 'sqrtMin', 'sqrtMax', 'migrationQuoteThreshold'] as const) {
      assert.equal(typeof estimate[key], 'string', key);
      assert.match(estimate[key], /^\d/);
    }
    for (const point of estimate.path) {
      assert.equal(typeof point.progress, 'string');
      assert.equal(typeof point.priceQuote, 'string');
    }
  });

  it('keeps the projected path monotonic and inside the curve', () => {
    const params = buildLaunchConfig(intent, quoteMintForSymbol('USDC')!, observedAnchor(now));
    const path = projectedPath(params, 6);
    assert.equal(path.length, 10);
    assert.equal(path[0].progress, '0');
    assert.equal(path[9].progress, '1');
    for (let i = 1; i < path.length; i++) {
      assert.ok(Number(path[i].priceQuote) >= Number(path[i - 1].priceQuote), `path dips at ${i}`);
    }
  });

  it('never lets a stale or unavailable anchor set the opening price', () => {
    const stale = observedAnchor(now, { status: 'stale', equityUsd: '182.50' });
    const missing = observedAnchor(now, { status: 'unavailable', equityUsd: '0' });
    assert.equal(openingPriceFor(intent, quoteMintForSymbol('USDC')!, stale), 1);
    assert.equal(openingPriceFor(intent, quoteMintForSymbol('USDC')!, missing), 1);
    const estimate = estimateLaunch(intent, stale, now);
    assert.ok(Math.abs(Number(estimate.openingPriceQuote) - 1) < 0.01);
    assert.match(estimate.assumptions, /was stale at quote time.*NOT anchored/);
  });

  it('an unanchored launch is disclosed, not silently priced', () => {
    const estimate = estimateLaunch({ ...intent, anchorSymbol: null }, null, now);
    assert.equal(estimate.anchor, null);
    assert.ok(Math.abs(Number(estimate.openingPriceQuote) - 1) < 0.01);
    assert.match(estimate.assumptions, /unanchored by choice/);
  });

  it('throws on a quote asset outside the verified catalog', () => {
    assert.throws(() => estimateLaunch({ ...intent, quoteSymbol: 'DOGE' }, null, now));
  });
});

describe('halley paper records', () => {
  const now = 1_900_000_000_000;

  function makeEstimate(id = 'halley-t1') {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    return { ...estimate, id };
  }

  it('round-trips an estimate through strict parsing', () => {
    const estimate = makeEstimate();
    assert.deepEqual(parseHalleyEstimate(JSON.parse(JSON.stringify(estimate))), estimate);
  });

  it('rejects an estimate whose review window lies', () => {
    const estimate = makeEstimate();
    assert.throws(() => parseHalleyEstimate({ ...estimate, expiresAt: estimate.quotedAt + 300_000 }));
    assert.throws(() => parseHalleyEstimate({ ...estimate, expiresAt: estimate.quotedAt }));
    assert.throws(() => parseHalleyEstimate({ ...estimate, intent: { ...intent, symbol: 'bad symbol' } }));
  });

  it('files once, verifies on read, and refuses after the window', () => {
    const storage = memoryStorage();
    const estimate = makeEstimate();
    const record = saveHalleyPaperRecord(storage, estimate, now + 5_000);
    assert.equal(record.deskId, 'halley');
    assert.equal(record.id, estimate.id);
    assert.equal(loadHalleyPaperRecords(storage).length, 1);
    assert.equal(loadHalleyPaperRecords(storage)[0].estimate.id, estimate.id);
    assert.throws(() => saveHalleyPaperRecord(storage, estimate, now + 70_000), /fresh estimate/);
  });

  it('re-filing the same estimate is idempotent; a different estimate under the same id conflicts', () => {
    const storage = memoryStorage();
    const estimate = makeEstimate();
    saveHalleyPaperRecord(storage, estimate, now + 5_000);
    const again = saveHalleyPaperRecord(storage, estimate, now + 10_000);
    assert.equal(again.id, estimate.id);
    assert.equal(loadHalleyPaperRecords(storage).length, 1);
    const conflict = { ...estimate, graduationPriceQuote: estimate.openingPriceQuote };
    assert.throws(() => saveHalleyPaperRecord(storage, conflict, now + 5_000), /identity conflict/);
  });

  it('refuses a record whose key and id disagree, and caps history', () => {
    const storage = memoryStorage();
    storage.setItem(HALLEY_PAPER_PREFIX + 'forged', JSON.stringify({
      version: 2, mode: 'paper', deskId: 'halley', owner: 'anonymous',
      id: 'real-id', createdAt: now + 1_000, estimate: makeEstimate('real-id'),
    }));
    assert.throws(() => loadHalleyPaperRecords(storage), /identity mismatch/);
  });

  it('deletes only inside its own namespace', () => {
    const storage = memoryStorage();
    const estimate = makeEstimate();
    saveHalleyPaperRecord(storage, estimate, now + 5_000);
    deleteHalleyPaperRecord(storage, estimate.id);
    assert.equal(loadHalleyPaperRecords(storage).length, 0);
    assert.throws(() => deleteHalleyPaperRecord(storage, '../escape'), /Invalid record ID/);
  });

  it('persists and clears the launch draft checkpoint', () => {
    const storage = memoryStorage();
    assert.deepEqual(loadHalleyDraft(storage), { name: null, symbol: null, anchorSymbol: null, quoteSymbol: null, curve: null, supply: null, graduationQuote: null });
    saveHalleyDraft(storage, { name: 'NVDA Tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC', curve: 'equity-pair', supply: '1000000', graduationQuote: '150' });
    assert.equal(loadHalleyDraft(storage).symbol, 'NVDAT');
    saveHalleyDraft(storage, { name: null, symbol: null, anchorSymbol: null, quoteSymbol: null, curve: null, supply: null, graduationQuote: null });
    assert.equal(loadHalleyDraft(storage).symbol, null);
    storage.setItem(HALLEY_DRAFT_KEY, '{"symbol":"not valid');
    assert.equal(loadHalleyDraft(storage).symbol, null);
  });

  it('never accepts a foreign record into the halley namespace', () => {
    const storage = memoryStorage();
    storage.setItem('claflin.paper.v2.isabel.abc', JSON.stringify({ whatever: true }));
    assert.equal(loadHalleyPaperRecords(storage).length, 0);
    assert.equal(HALLEY_MAX_HISTORY, 100);
  });
});

describe('halley anchor resolver', () => {
  function storeWith(rows: Record<number, unknown>): SnapshotStore {
    return {
      async get(key: string) {
        const feedId = Number(key.slice(key.lastIndexOf(':') + 1));
        return rows[feedId] ?? null;
      },
      async set() { return 'OK'; },
    };
  }

  function equitySnap(instrumentId: string, price: string, generatedAt: number) {
    const feedId = feedMappingFor(instrumentId as never)!.equity.feedId;
    return { [feedId]: { feedId, symbol: 'Equity.US.NVDA/USD', price, confidence: '0.01', generatedAt, receivedAt: generatedAt, session: 'regular' as const, publisherCount: 20 } };
  }

  it('reads the equity mark through the verified feed mapping', async () => {
    const now = 1_900_000_000_000;
    const aapl = SOLANA_INSTRUMENTS.find(i => i.underlyingSymbol === 'AAPL')!;
    const store = storeWith(equitySnap(aapl.id, '260.71', now - 1_000));
    const anchor = await resolveAnchor('AAPL', 'USDC', now, store);
    assert.equal(anchor?.status, 'observed');
    assert.equal(anchor?.equityUsd, '260.71');
    assert.equal(anchor?.source, 'pyth-pro');
  });

  it('marks a sleeping feed stale, never fresh', async () => {
    const now = 1_900_000_000_000;
    const aapl = SOLANA_INSTRUMENTS.find(i => i.underlyingSymbol === 'AAPL')!;
    const store = storeWith(equitySnap(aapl.id, '260.71', now - 30 * 60_000));
    const anchor = await resolveAnchor('AAPL', 'USDC', now, store);
    assert.equal(anchor?.status, 'stale');
  });

  it('marks an unknown equity unavailable rather than fabricating a price', async () => {
    const anchor = await resolveAnchor('ZZZZ', 'USDC', Date.now(), storeWith({}));
    assert.equal(anchor?.status, 'unavailable');
    const noFeed = await resolveAnchor('AAPL', 'USDC', Date.now(), storeWith({}));
    assert.equal(noFeed?.status, 'unavailable');
  });

  it('derives the pair ratio from both legs and fails when either is missing', async () => {
    const now = 1_900_000_000_000;
    const aapl = SOLANA_INSTRUMENTS.find(i => i.underlyingSymbol === 'AAPL')!;
    const nvda = SOLANA_INSTRUMENTS.find(i => i.underlyingSymbol === 'NVDA')!;
    const store = storeWith({ ...equitySnap(aapl.id, '260', now - 1_000), ...equitySnap(nvda.id, '182', now - 1_000) });
    const anchor = await resolveAnchor('NVDA', 'AAPLx', now, store);
    assert.equal(anchor?.status, 'observed');
    assert.ok(Math.abs(Number(anchor!.pairRatio) - 182 / 260) < 1e-9);
    assert.equal(anchor?.quoteEquityUsd, '260');

    const half = storeWith(equitySnap(nvda.id, '182', now - 1_000));
    const broken = await resolveAnchor('NVDA', 'AAPLx', now, half);
    assert.equal(broken?.status, 'stale');
    assert.equal(broken?.pairRatio, null);
  });
});

describe('halley desk session', () => {
  let root: Root | null = null;
  let desk: HalleyDesk | null = null;
  const now = 1_900_000_000_000;

  function Harness({ estimate }: { estimate: (i: HalleyLaunchIntent) => Promise<ReturnType<typeof estimateLaunch>> }) {
    const d = useHalleyDesk({ estimate, now: () => now + 5_000 });
    desk = d;
    return null;
  }

  async function render(estimate: (i: HalleyLaunchIntent) => Promise<ReturnType<typeof estimateLaunch>>) {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Harness, { estimate })));
    await act(async () => {});
  }

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
    desk = null;
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  it('drafts, estimates, reviews, and files a paper launch', async () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    await render(async () => estimate);
    assert.equal(desk!.state.stage, 'draft');

    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    assert.equal(desk!.foreground.kind, 'draft');
    assert.equal(desk!.state.draft.symbol, 'NVDAT');

    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');
    assert.equal(desk!.foreground.kind, 'quotation');

    let filed = false;
    await act(async () => { filed = desk!.file(); });
    assert.equal(filed, true);
    assert.equal(desk!.state.stage, 'saved');
    assert.equal(desk!.foreground.kind, 'receipt');
    assert.equal(desk!.records.length, 1);
    assert.equal(loadHalleyPaperRecords(window.localStorage).length, 1);
  });

  it('an edit after review invalidates the estimate — nothing files under the old one', async () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    await render(async () => estimate);
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');

    await act(async () => desk!.edit({ graduationQuote: '200' }));
    assert.equal(desk!.state.stage, 'draft');
    assert.equal(desk!.state.estimate, null);
    let filed = false;
    await act(async () => { filed = desk!.file(); });
    assert.equal(filed, false);
    assert.equal(desk!.records.length, 0);
  });

  it('surfaces a port failure as a notice and stays on the draft', async () => {
    await render(async () => { throw new Error('The NVDA equity mark is stale.'); });
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'draft');
    assert.match(desk!.state.notice ?? '', /stale/);
    assert.equal(desk!.state.estimate, null);
  });

  it('carries the server error code so the surface can offer recovery', async () => {
    await render(async () => {
      throw new ApiError('http', 'The NVDA equity mark is stale — drop the anchor.', { status: 409, code: 'anchor_stale' });
    });
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'draft');
    assert.equal(desk!.state.noticeCode, 'anchor_stale');
    assert.match(desk!.state.notice ?? '', /stale/);
  });

  it('drops the anchor and redraws in one step — the unanchored recovery path', async () => {
    const estimate = estimateLaunch({ ...intent, anchorSymbol: null }, null, now);
    let calls = 0;
    await render(async (i) => {
      calls += 1;
      if (calls === 1) {
        throw new ApiError('http', 'The NVDA equity mark is stale — drop the anchor.', { status: 409, code: 'anchor_stale' });
      }
      assert.equal(i.anchorSymbol, null);
      return estimate;
    });
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.noticeCode, 'anchor_stale');

    await act(async () => desk!.estimateUnanchored());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');
    assert.equal(desk!.state.draft.anchorSymbol, null);
    assert.equal(desk!.state.noticeCode, null);
    assert.equal(calls, 2);
  });

  it('revise leaves review with the draft untouched — nothing refilled', async () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    await render(async () => estimate);
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');

    await act(async () => desk!.revise());
    assert.equal(desk!.state.stage, 'draft');
    assert.equal(desk!.state.estimate, null);
    assert.equal(desk!.state.draft.symbol, 'NVDAT');
    assert.equal(desk!.state.draft.graduationQuote, '150');
  });

  it('a lapsed review re-estimates from the kept draft', async () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    await render(async () => estimate);
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');

    await act(async () => desk!.estimate());
    await act(async () => {});
    assert.equal(desk!.state.stage, 'review');
    assert.equal(desk!.state.draft.symbol, 'NVDAT');
  });

  it('opens, dismisses, and removes filed records', async () => {
    const estimate = estimateLaunch(intent, observedAnchor(now), now);
    await render(async () => estimate);
    await act(async () => desk!.edit({ name: 'NVDA Tracker', symbol: 'NVDAT', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' }));
    await act(async () => desk!.estimate());
    await act(async () => {});
    await act(async () => { desk!.file(); });
    const id = desk!.records[0].id;

    await act(async () => desk!.openRecord(id));
    assert.equal(desk!.viewedRecordId, id);
    assert.equal(desk!.foreground.kind, 'receipt');
    await act(async () => desk!.dismissRecord());
    assert.equal(desk!.viewedRecordId, null);
    await act(async () => desk!.removeRecord(id));
    assert.equal(desk!.records.length, 0);
    assert.equal(loadHalleyPaperRecords(window.localStorage).length, 0);
  });
});
