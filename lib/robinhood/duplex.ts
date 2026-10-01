/**
 * Isabel's three-way evidence — the fullest honest tape the house runs.
 *
 *   issuer  — rhj `/prices`: underlying bid/ask plus `tokenBid`/`tokenAsk`
 *             (multiplier-adjusted server-side). Issuer indicative reference,
 *             not an onchain observation.
 *   onchain — Chainlink `AggregatorV3` on 4663: multiplier-adjusted token
 *             price, 24/5, 86400s heartbeat. Stale-until-Monday is normal.
 *   venue   — Lighter domain `<SYM>/USDG` spot book: best bid/ask + mid.
 *             Real resting quotes; realized depth is a separate question.
 *
 * Three truthful sources that diverge — labelled, never blended, never
 * called arbitrage. Status 'comparable' only when at least two legs answer.
 */

import { getRobinhoodInstrument } from './catalog';
import { isRobinhoodInstrumentId, type RobinhoodInstrumentId } from './contracts';
import { fetchRhjPrices } from './rhj';
import { fetchLighterBook, fetchLighterBookStats } from './lighter';
import { createRobinhoodFeedReader } from './chain';
import { formatAmount } from '../trading/domain';

export const ROBINHOOD_EVIDENCE_DISCLAIMER =
  'Robinhood issuer quote, onchain Chainlink mark, and Lighter venue book side by side — not an exchange print, not executable arbitrage.';

export type RobinhoodEvidenceStatus = 'comparable' | 'unavailable';

export type RobinhoodEvidenceReasonCode =
  | 'unknown-instrument'
  | 'issuer-unavailable'
  | 'issuer-halted'
  | 'onchain-unavailable'
  | 'onchain-stale'
  | 'venue-unavailable'
  | 'venue-empty-book'
  | 'nonpositive-price';

export interface RobinhoodEvidence {
  version: 1;
  source: 'venue-triplex';
  instrumentId: RobinhoodInstrumentId;
  symbol: string;
  contractAddress: string;
  observedAt: number;
  status: RobinhoodEvidenceStatus;
  issuer: {
    underlyingBid: string | null;
    underlyingAsk: string | null;
    tokenBid: string | null;
    tokenAsk: string | null;
    halted: boolean;
    generatedAt: string | null;
  } | null;
  onchain: {
    priceUsd: string;
    updatedAt: number;
    status: 'observed' | 'stale';
  } | null;
  venue: {
    marketId: number;
    bestBid: string | null;
    bestAsk: string | null;
    midPriceUsd: string | null;
    dailyQuoteVolumeUsd: string | null;
  } | null;
  venueVsIssuerBps: string | null;
  onchainVsIssuerBps: string | null;
  venueVsOnchainBps: string | null;
  reasonCodes: RobinhoodEvidenceReasonCode[];
  disclaimer: string;
}

const ONCHAIN_STALE_MS = 24 * 60 * 60 * 1000; // feed heartbeat is 86400s

function diff(a: number, b: number): string | null {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (Math.round(10_000 * (b / a - 1) * 10) / 10).toFixed(1);
}

function fmt(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return n.toPrecision(12).replace(/\.?0+$/, '') || String(n);
}

function unavailable(
  instrumentId: RobinhoodInstrumentId | null,
  reasons: RobinhoodEvidenceReasonCode[],
  now: number,
): RobinhoodEvidence {
  const instrument = instrumentId ? lookup(instrumentId) : null;
  return {
    version: 1,
    source: 'venue-triplex',
    instrumentId: (instrument?.id ?? instrumentId ?? 'rh:') as RobinhoodInstrumentId,
    symbol: instrument?.symbol ?? '',
    contractAddress: instrument?.contractAddress ?? '',
    observedAt: now,
    status: 'unavailable',
    issuer: null,
    onchain: null,
    venue: null,
    venueVsIssuerBps: null,
    onchainVsIssuerBps: null,
    venueVsOnchainBps: null,
    reasonCodes: reasons,
    disclaimer: ROBINHOOD_EVIDENCE_DISCLAIMER,
  };
}

function lookup(id: RobinhoodInstrumentId) {
  try { return getRobinhoodInstrument(id); } catch { return null; }
}

export async function readRobinhoodEvidence(args: {
  instrumentId: string;
  fetchImpl?: typeof fetch;
  readFeeds?: (feeds: readonly string[]) => Promise<({ answer: bigint; decimals: number; updatedAt: number } | null)[]>;
  now?: number;
}): Promise<RobinhoodEvidence> {
  const now = args.now ?? Date.now();
  if (!isRobinhoodInstrumentId(args.instrumentId)) {
    return unavailable(null, ['unknown-instrument'], now);
  }
  const instrument = lookup(args.instrumentId);
  if (!instrument) return unavailable(args.instrumentId, ['unknown-instrument'], now);

  const fetchImpl = args.fetchImpl ?? fetch;
  const readFeeds = args.readFeeds ?? createRobinhoodFeedReader();
  const reasonCodes: RobinhoodEvidenceReasonCode[] = [];

  const [pricesResult, feedsResult, bookResult, statsResult] = await Promise.allSettled([
    fetchRhjPrices(fetchImpl),
    Promise.resolve(readFeeds([instrument.chainlinkFeed])),
    fetchLighterBook(instrument.lighterMarketId, fetchImpl, 3),
    fetchLighterBookStats(fetchImpl),
  ]);

  /* Issuer leg */
  let issuer: RobinhoodEvidence['issuer'] = null;
  let issuerMid: number | null = null;
  if (pricesResult.status === 'fulfilled') {
    const row = pricesResult.value.get(instrument.symbol);
    if (row) {
      issuer = {
        underlyingBid: fmt(row.bid),
        underlyingAsk: fmt(row.ask),
        tokenBid: fmt(row.tokenBid),
        tokenAsk: fmt(row.tokenAsk),
        halted: row.halted,
        generatedAt: row.generatedAt,
      };
      if (row.halted) reasonCodes.push('issuer-halted');
      if (row.tokenBid !== null && row.tokenBid > 0 && row.tokenAsk !== null && row.tokenAsk > 0) {
        issuerMid = (row.tokenBid + row.tokenAsk) / 2;
      } else if (!row.halted) {
        reasonCodes.push('nonpositive-price');
      }
    } else {
      reasonCodes.push('issuer-unavailable');
    }
  } else {
    reasonCodes.push('issuer-unavailable');
  }

  /* Onchain leg — feed heartbeat is 24h; stale is a label, not a failure. */
  let onchain: RobinhoodEvidence['onchain'] = null;
  let onchainPrice: number | null = null;
  if (feedsResult.status === 'fulfilled') {
    const reading = feedsResult.value[0] ?? null;
    if (reading && reading.answer > 0n && Number.isSafeInteger(reading.updatedAt) && reading.updatedAt > 0) {
      const priceUsd = formatAmount(reading.answer, reading.decimals);
      const stale = now - reading.updatedAt * 1000 > ONCHAIN_STALE_MS;
      onchain = { priceUsd, updatedAt: reading.updatedAt, status: stale ? 'stale' : 'observed' };
      if (stale) reasonCodes.push('onchain-stale');
      onchainPrice = Number(priceUsd);
    } else {
      reasonCodes.push('onchain-unavailable');
    }
  } else {
    reasonCodes.push('onchain-unavailable');
  }

  /* Venue leg */
  let venue: RobinhoodEvidence['venue'] = null;
  let venueMid: number | null = null;
  if (bookResult.status === 'fulfilled') {
    const book = bookResult.value;
    const bestBid = book.bids[0]?.price ?? null;
    const bestAsk = book.asks[0]?.price ?? null;
    const bid = bestBid !== null ? Number(bestBid) : NaN;
    const ask = bestAsk !== null ? Number(bestAsk) : NaN;
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      venueMid = (bid + ask) / 2;
    } else {
      reasonCodes.push('venue-empty-book');
    }
    const stats = statsResult.status === 'fulfilled' ? statsResult.value.get(instrument.lighterMarketId) : undefined;
    venue = {
      marketId: instrument.lighterMarketId,
      bestBid,
      bestAsk,
      midPriceUsd: venueMid !== null ? fmt(venueMid) : null,
      dailyQuoteVolumeUsd: stats?.dailyQuoteVolume ?? null,
    };
  } else {
    reasonCodes.push('venue-unavailable');
  }

  const legs = [issuerMid, onchainPrice, venueMid].filter(v => v !== null && v > 0).length;
  return {
    version: 1,
    source: 'venue-triplex',
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    contractAddress: instrument.contractAddress,
    observedAt: now,
    status: legs >= 2 ? 'comparable' : 'unavailable',
    issuer,
    onchain,
    venue,
    venueVsIssuerBps: issuerMid !== null && venueMid !== null ? diff(issuerMid, venueMid) : null,
    onchainVsIssuerBps: issuerMid !== null && onchainPrice !== null ? diff(issuerMid, onchainPrice) : null,
    venueVsOnchainBps: onchainPrice !== null && venueMid !== null ? diff(onchainPrice, venueMid) : null,
    reasonCodes,
    disclaimer: ROBINHOOD_EVIDENCE_DISCLAIMER,
  };
}
