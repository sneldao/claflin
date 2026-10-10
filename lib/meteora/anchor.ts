/**
 * Halley's anchor resolver — read the marks that pin a launch's opening
 * price. The equity mark is the canonical anchor while the tape is awake;
 * when it rests (nights, weekends, holidays) the live onchain xStock venue
 * mark anchors instead — the token's own price, read through the same
 * venue-duplex evidence Jesse's tape shows. A missing or stale read on
 * BOTH bases yields an `unavailable`/`stale` anchor — evidence, never a
 * fabricated price.
 *
 * Server-side only (reads the snapshot file and venue APIs).
 */

import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import { feedMappingFor } from '../solana/market/feeds';
import { fileSnapshotStore } from '../solana/market/snapshot-file';
import { readFeedSnapshot, type SnapshotStore } from '../solana/market/snapshots';
import { readVenueDuplex, venueReferenceDifferenceBps } from '../solana/market/venue-duplex';
import { quoteMintForSymbol } from './catalog';
import type { HalleyAnchor } from './contracts';

/** Anchor staleness: equity feeds sleep overnight and weekends — a snapshot
 *  older than this is reported `stale`, not silently fresh. */
const ANCHOR_STALE_MS = 15 * 60 * 1000;

export interface AnchorPorts {
  /** The onchain venue-mark reader — injectable for tests. */
  duplex?: typeof readVenueDuplex;
}

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

const fresh = (generatedAt: number | null, now: number) =>
  generatedAt !== null && now - generatedAt <= ANCHOR_STALE_MS;

/**
 * The equity-tape basis: Pyth Pro equity marks for the anchor and, when the
 * quote is an xStock, the quote's underlying equity too — both legs on the
 * same basis or the pair is stale.
 */
async function resolveEquityBasis(
  anchorSymbol: string,
  quoteSymbol: string,
  now: number,
  store: SnapshotStore,
): Promise<HalleyAnchor> {
  const base = await equitySnapshot(store, anchorSymbol);
  if (!base?.price) {
    return { symbol: anchorSymbol.toUpperCase(), source: 'pyth-pro', equityUsd: '0', pairRatio: null, quoteEquityUsd: null, observedAt: 0, status: 'unavailable' };
  }
  const stale = !fresh(base.generatedAt, now);

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
      if (!fresh(quoteSnap.generatedAt, now)) pairStale = true;
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

/** The venue USD mark for an instrument, or null when unreadable. */
async function onchainUsd(
  instrumentId: string,
  duplex: typeof readVenueDuplex,
): Promise<{ price: string; observedAt: number } | null> {
  const d = await duplex({ instrumentId });
  if (!d.venuePrice || !(Number(d.venuePrice) > 0)) return null;
  return { price: d.venuePrice, observedAt: d.observedAt };
}

/**
 * The onchain basis: the xStock's own venue mark — live nights, weekends
 * and holidays. Pair launches read BOTH legs onchain so the ratio keeps
 * one basis; a missing leg refuses rather than mixing sources.
 */
async function resolveOnchainBasis(
  anchorSymbol: string,
  quoteSymbol: string,
  equity: HalleyAnchor,
  duplex: typeof readVenueDuplex,
): Promise<HalleyAnchor | null> {
  const anchorInstrument = instrumentForEquity(anchorSymbol);
  if (!anchorInstrument) return null;
  const base = await onchainUsd(anchorInstrument.id, duplex);
  if (!base) return null;

  const quote = quoteMintForSymbol(quoteSymbol);
  let pairRatio: string | null = null;
  let quoteMark: string | null = null;
  if (quote?.underlyingSymbol) {
    const quoteInstrument = SOLANA_INSTRUMENTS.find(i => i.symbol.toUpperCase() === quoteSymbol.toUpperCase());
    const leg = quoteInstrument ? await onchainUsd(quoteInstrument.id, duplex) : null;
    if (!leg) return null;
    quoteMark = leg.price;
    const b = Number(base.price), q = Number(leg.price);
    if (Number.isFinite(b) && Number.isFinite(q) && q > 0) pairRatio = (b / q).toString();
  }

  /* The gap is always computed against the SAME pair the evidence shows:
     the resting equity reading versus the live onchain mark — never a
     third reference that would mislabel the comparison. */
  const resting = Number(equity.equityUsd) > 0
    ? { equityUsd: equity.equityUsd, differenceBps: venueReferenceDifferenceBps(Number(equity.equityUsd), Number(base.price)) }
    : null;

  return {
    symbol: anchorSymbol.toUpperCase(),
    source: 'onchain',
    equityUsd: base.price,
    pairRatio,
    quoteEquityUsd: quoteMark,
    observedAt: base.observedAt,
    status: 'observed',
    restingEquity: resting,
  };
}

/**
 * Resolve the launch anchor. Equity basis first — the reference mark while
 * it is awake. When it rests or is unavailable, the live onchain venue mark
 * anchors instead and the resting equity reading rides along as evidence.
 * Only when neither basis answers does the anchor stay stale/unavailable.
 */
export async function resolveAnchor(
  anchorSymbol: string | null,
  quoteSymbol: string,
  now = Date.now(),
  store: SnapshotStore = fileSnapshotStore(),
  ports: AnchorPorts = {},
): Promise<HalleyAnchor | null> {
  if (!anchorSymbol) return null;
  const equity = await resolveEquityBasis(anchorSymbol, quoteSymbol, now, store);
  if (equity.status === 'observed') return equity;
  const onchain = await resolveOnchainBasis(anchorSymbol, quoteSymbol, equity, ports.duplex ?? readVenueDuplex);
  return onchain ?? equity;
}
