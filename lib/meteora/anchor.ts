/**
 * Halley's anchor resolver — read the equity marks that pin a launch's
 * opening price. Reuses the house's verified Pyth Pro feed mapping
 * (lib/solana/market/feeds.ts) and the snapshot store the Lazer daemon
 * writes. A missing or stale feed yields an `unavailable`/`stale` anchor —
 * evidence, never a fabricated price.
 *
 * Server-side only (reads the snapshot file).
 */

import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import { feedMappingFor } from '../solana/market/feeds';
import { fileSnapshotStore } from '../solana/market/snapshot-file';
import { readFeedSnapshot, type SnapshotStore } from '../solana/market/snapshots';
import { quoteMintForSymbol } from './catalog';
import type { HalleyAnchor } from './contracts';

/** Anchor staleness: equity feeds sleep overnight and weekends — a snapshot
 *  older than this is reported `stale`, not silently fresh. */
const ANCHOR_STALE_MS = 15 * 60 * 1000;

/** Find the verified instrument whose underlying equity symbol matches —
 *  e.g. 'NVDA' → NVDAx instrument → equity feed. */
function instrumentForEquity(symbol: string) {
  const wanted = symbol.trim().toUpperCase();
  return SOLANA_INSTRUMENTS.find(i => i.underlyingSymbol.toUpperCase() === wanted) ?? null;
}

async function equitySnapshot(store: SnapshotStore, equitySymbol: string) {
  const instrument = instrumentForEquity(equitySymbol);
  if (!instrument) return null;
  const mapping = feedMappingFor(instrument.id);
  if (!mapping) return null;
  return readFeedSnapshot(store, mapping.equity.feedId);
}

/**
 * Resolve the launch anchor. For an xStock-quoted launch the anchor is the
 * pair ratio equity(anchor)/equity(quote underlying) — both legs read
 * independently; either failing marks the anchor unavailable.
 */
export async function resolveAnchor(
  anchorSymbol: string | null,
  quoteSymbol: string,
  now = Date.now(),
  store: SnapshotStore = fileSnapshotStore(),
): Promise<HalleyAnchor | null> {
  if (!anchorSymbol) return null;
  const base = await equitySnapshot(store, anchorSymbol);
  if (!base?.price) {
    return { symbol: anchorSymbol.toUpperCase(), source: 'pyth-pro', equityUsd: '0', pairRatio: null, quoteEquityUsd: null, observedAt: 0, status: 'unavailable' };
  }
  const stale = base.generatedAt === null || now - base.generatedAt > ANCHOR_STALE_MS;

  const quote = quoteMintForSymbol(quoteSymbol);
  let pairRatio: string | null = null;
  let quoteEquityUsd: string | null = null;
  let pairStale = stale;
  if (quote?.underlyingSymbol) {
    const quoteSnap = await equitySnapshot(store, quote.underlyingSymbol);
    if (quoteSnap?.price) {
      quoteEquityUsd = quoteSnap.price;
      const b = Number(base.price), q = Number(quoteSnap.price);
      if (Number.isFinite(b) && Number.isFinite(q) && q > 0) pairRatio = (b / q).toString();
      if (quoteSnap.generatedAt === null || now - quoteSnap.generatedAt > ANCHOR_STALE_MS) pairStale = true;
    } else {
      pairStale = true;
    }
  }

  return {
    symbol: anchorSymbol.toUpperCase(),
    source: 'pyth-pro',
    equityUsd: base.price,
    pairRatio,
    quoteEquityUsd,
    observedAt: base.generatedAt ?? base.receivedAt,
    status: pairStale ? 'stale' : 'observed',
  };
}
