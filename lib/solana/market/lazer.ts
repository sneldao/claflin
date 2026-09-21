/**
 * Pyth Pro (Lazer) stream parsing — off-chain JSON only.
 * No on-chain signature claim; formats stay empty on the wire.
 */

import type { FeedSnapshot } from './compare';
import type { MarketObservation } from '../contracts';
import { feedSymbolForId } from './feeds';

export const LAZER_STREAM_URLS = [
  'wss://pyth-lazer-0.dourolabs.app/v1/stream',
  'wss://pyth-lazer-1.dourolabs.app/v1/stream',
  'wss://pyth-lazer-2.dourolabs.app/v1/stream',
] as const;

const SESSIONS = new Set<MarketObservation['session']>([
  'regular', 'preMarket', 'postMarket', 'overNight', 'closed', 'unknown',
]);

/** Exact decimal string from mantissa × 10^exponent — no floats. */
export function mantissaToDecimal(mantissa: bigint, exponent: number): string {
  if (!Number.isInteger(exponent) || exponent < -18 || exponent > 18) {
    throw new Error('Invalid exponent');
  }
  if (exponent >= 0) {
    return (mantissa * 10n ** BigInt(exponent)).toString();
  }
  const places = -exponent;
  const negative = mantissa < 0n;
  const abs = negative ? -mantissa : mantissa;
  const digits = abs.toString().padStart(places + 1, '0');
  const whole = digits.slice(0, -places) || '0';
  const frac = digits.slice(-places).replace(/0+$/, '');
  const out = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${out}` : out;
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return null;
}

function asSession(value: unknown): MarketObservation['session'] {
  return typeof value === 'string' && SESSIONS.has(value as MarketObservation['session'])
    ? (value as MarketObservation['session'])
    : 'unknown';
}

function asFeedId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function asMicros(value: unknown): number | null {
  const n = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
      : null;
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export interface LazerPriceFeedRow {
  priceFeedId: number;
  price: bigint | null;
  confidence: bigint | null;
  exponent: number;
  marketSession: MarketObservation['session'];
  feedUpdateTimestampUs: number | null;
  publisherCount: number | null;
}

export function parseLazerPriceFeed(raw: unknown): LazerPriceFeedRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const priceFeedId = asFeedId(row.priceFeedId ?? row.price_feed_id);
  if (priceFeedId === null) return null;
  const exponentRaw = row.exponent;
  const exponent = typeof exponentRaw === 'number' && Number.isInteger(exponentRaw) ? exponentRaw : null;
  if (exponent === null) return null;
  const price = row.price === null || row.price === undefined ? null : asBigInt(row.price);
  const confidence = row.confidence === null || row.confidence === undefined ? null : asBigInt(row.confidence);
  const publisherCount = typeof row.publisherCount === 'number' && Number.isInteger(row.publisherCount) && row.publisherCount >= 0
    ? row.publisherCount
    : typeof row.publisher_count === 'number' && Number.isInteger(row.publisher_count) && row.publisher_count >= 0
      ? row.publisher_count
      : null;
  return {
    priceFeedId,
    price,
    confidence,
    exponent,
    marketSession: asSession(row.marketSession ?? row.market_session),
    feedUpdateTimestampUs: asMicros(row.feedUpdateTimestamp ?? row.feed_update_timestamp),
    publisherCount,
  };
}

/** Extract price-feed rows from a Lazer websocket JSON message. */
export function extractLazerFeeds(message: unknown): LazerPriceFeedRow[] {
  if (!message || typeof message !== 'object') return [];
  const msg = message as Record<string, unknown>;
  const parsed = msg.parsed as Record<string, unknown> | undefined;
  const list = (parsed?.priceFeeds ?? msg.priceFeeds ?? []) as unknown;
  if (!Array.isArray(list)) return [];
  const out: LazerPriceFeedRow[] = [];
  for (const entry of list) {
    const row = parseLazerPriceFeed(entry);
    if (row) out.push(row);
  }
  return out;
}

export function lazerRowToSnapshot(row: LazerPriceFeedRow, receivedAt: number): FeedSnapshot | null {
  const symbol = feedSymbolForId(row.priceFeedId);
  if (!symbol) return null;
  let price: string | null = null;
  let confidence: string | null = null;
  try {
    if (row.price !== null) price = mantissaToDecimal(row.price, row.exponent);
    if (row.confidence !== null) confidence = mantissaToDecimal(row.confidence, row.exponent);
  } catch {
    return null;
  }
  const generatedAt = row.feedUpdateTimestampUs !== null
    ? Math.floor(row.feedUpdateTimestampUs / 1000)
    : null;
  return {
    feedId: row.priceFeedId,
    symbol,
    price,
    confidence,
    generatedAt,
    receivedAt,
    session: row.marketSession,
    publisherCount: row.publisherCount,
  };
}

export function buildLazerSubscribeMessage(feedIds: number[], subscriptionId = 1): string {
  return JSON.stringify({
    type: 'subscribe',
    subscriptionId,
    priceFeedIds: feedIds,
    properties: ['price', 'confidence', 'exponent', 'feedUpdateTimestamp', 'marketSession', 'publisherCount'],
    formats: [],
    deliveryFormat: 'json',
    channel: 'fixed_rate@1000ms',
    ignoreInvalidFeeds: true,
  });
}
