/**
 * Jesse market-comparison policy (plan §4.4 rules 1–8, E2 work item 3).
 *
 * Pure and deterministic: snapshots + the verified feed mapping + the
 * multiplier effective at the token price's generation time + `now` go in,
 * a MarketComparison comes out. No Redis, no fetch, no env — the daemon
 * and the API reader assemble inputs; this module owns the math and the
 * policy, so the browser, the API, and tests all compute the same answer.
 *
 * The rules, as authored for this release:
 *   1. An unverified token unit basis (mapping.tokenUnitBasis === null)
 *      makes the comparison unavailable — never guessed.
 *   2. Raw-token prices normalize as Pt = Praw / m with the multiplier
 *      effective at the token price's generation time; scaled prices are
 *      used as-is (never divided twice).
 *   3. referenceDifferenceBps = 10_000 × (Pt/Pe − 1), exact rational math,
 *      rendered to one decimal with symmetric (half away from zero)
 *      rounding. It is a reference difference, not profit.
 *   4. Freshness uses generatedAt (feedUpdateTimestamp), never the
 *      envelope time: fresh is age 0–15s; more than 2s in the future is
 *      invalid; a smaller future skew is labelled uncertain and is not
 *      comparable; token/equity generation times must align within 5s.
 *   5. `comparable` additionally requires equity regular session, positive
 *      values, verified normalization, and known confidence with
 *      confidence/price ≤ 0.005 on both sides.
 *   6. Otherwise the evidence is a `last-observation`, and a numeric
 *      difference is shown only with verified units, a fresh token
 *      observation, and a non-future equity observation no older than
 *      7 days. When the number is suppressed the status is `unavailable`.
 *   7. Unavailable fabricates nothing and never blocks a paper quote.
 *   8. Jupiter's USDC amounts are never compared to USD references at an
 *      assumed dollar parity — that path does not exist here.
 */

import type { MarketComparison, MarketObservation } from '../contracts';
import type { JesseFeedMapping } from './feeds';

/* policy constants (ms unless noted) */
export const COMPARISON_FRESHNESS_MS = 15_000;
export const COMPARISON_ALIGNMENT_MS = 5_000;
export const COMPARISON_FUTURE_INVALID_MS = 2_000;
export const COMPARISON_HISTORICAL_EQUITY_MS = 7 * 86_400_000;
/** confidence/price must not exceed 0.005 = 1/200 for `comparable`. */
export const COMPARISON_MAX_CONFIDENCE_DENOMINATOR = 200n;

export type ComparisonReasonCode =
  | 'unverified-unit-basis'
  | 'feed-mismatch'
  | 'token-unavailable'
  | 'equity-unavailable'
  | 'token-stale'
  | 'equity-stale'
  | 'future-timestamp-invalid'
  | 'future-skew-uncertain'
  | 'generation-gap-exceeded'
  | 'session-not-regular'
  | 'confidence-excessive'
  | 'confidence-unknown'
  | 'nonpositive-price'
  | 'multiplier-unavailable'
  | 'equity-older-than-7-days';

/** A normalized feed observation as the daemon stores it — prices are
 *  decimal strings with the exponent already applied. */
export interface FeedSnapshot {
  feedId: number;
  symbol: string;
  price: string | null;
  confidence: string | null;
  /** ms epoch, converted from feedUpdateTimestamp (µs). Null when the
   *  feed has not produced a price yet. */
  generatedAt: number | null;
  /** ms epoch, daemon receipt of the envelope that carried this price. */
  receivedAt: number;
  session: MarketObservation['session'];
  publisherCount: number | null;
}

/* exact rationals — same bigint discipline as lib/solana/amounts.ts */
type Rational = { num: bigint; den: bigint };

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

function parseDecimal(text: string): Rational | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 40 || !DECIMAL_PATTERN.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return { num: BigInt(whole + fraction), den: 10n ** BigInt(fraction.length) };
}

function isPositive(r: Rational): boolean {
  return r.num > 0n;
}

function divide(a: Rational, b: Rational): Rational {
  return { num: a.num * b.den, den: a.den * b.num };
}

/** Tenths of a basis point of (Pt/Pe − 1): 100_000 × (Pt − Pe) / Pe. */
function differenceTenths(pt: Rational, pe: Rational): bigint {
  const numerator = 100_000n * (pt.num * pe.den - pe.num * pt.den);
  const denominator = pt.den * pe.num;
  const q = numerator / denominator;
  const r = numerator % denominator;
  /* symmetric rounding: half away from zero */
  const absR = r < 0n ? -r : r;
  if (absR * 2n >= denominator) return q + (numerator < 0n ? -1n : 1n);
  return q;
}

function renderTenths(tenths: bigint): string {
  const sign = tenths < 0n ? '-' : '';
  const abs = tenths < 0n ? -tenths : tenths;
  return `${sign}${abs / 10n}.${abs % 10n}`;
}

/** confidence/price ≤ 1/200, computed exactly; unknown confidence fails. */
function confidenceWithin(price: Rational, confidence: Rational | null): boolean {
  if (confidence === null || confidence.num < 0n) return false;
  /* (cNum/cDen) / (pNum/pDen) ≤ 1/200  ⟺  cNum × pDen × 200 ≤ pNum × cDen */
  return confidence.num * price.den * COMPARISON_MAX_CONFIDENCE_DENOMINATOR <= price.num * confidence.den;
}

interface ObservationBuild {
  observation: MarketObservation;
  /** 0 = none/past, 1 = skew ≤2s (uncertain), 2 = invalid >2s. */
  future: 0 | 1 | 2;
  fresh: boolean;
}

function buildObservation(
  snap: FeedSnapshot | null,
  expected: { feedId: number; symbol: string },
  unit: MarketObservation['unit'],
  now: number,
  tag: 'token' | 'equity',
  reasons: ComparisonReasonCode[],
): ObservationBuild {
  const base: MarketObservation = {
    feedId: snap?.feedId ?? null,
    symbol: snap?.symbol ?? expected.symbol,
    source: 'pyth-pro',
    unit,
    price: snap?.price ?? null,
    confidence: snap?.confidence ?? null,
    generatedAt: snap?.generatedAt ?? null,
    receivedAt: snap?.receivedAt ?? now,
    session: snap?.session ?? 'unknown',
    status: 'unavailable',
  };
  if (snap === null || (snap.feedId !== expected.feedId || snap.symbol !== expected.symbol)) {
    if (snap !== null) reasons.push('feed-mismatch');
    else reasons.push(tag === 'token' ? 'token-unavailable' : 'equity-unavailable');
    return { observation: base, future: 0, fresh: false };
  }
  if (snap.price === null || snap.generatedAt === null) {
    reasons.push(tag === 'token' ? 'token-unavailable' : 'equity-unavailable');
    return { observation: base, future: 0, fresh: false };
  }
  const skew = snap.generatedAt - now;
  if (skew > COMPARISON_FUTURE_INVALID_MS) {
    reasons.push('future-timestamp-invalid');
    return { observation: base, future: 2, fresh: false };
  }
  if (skew > 0) {
    reasons.push('future-skew-uncertain');
    return { observation: { ...base, status: 'fresh' }, future: 1, fresh: true };
  }
  const age = now - snap.generatedAt;
  if (age > COMPARISON_FRESHNESS_MS) {
    reasons.push(tag === 'token' ? 'token-stale' : 'equity-stale');
    return { observation: { ...base, status: 'stale' }, future: 0, fresh: false };
  }
  return { observation: { ...base, status: 'fresh' }, future: 0, fresh: true };
}

export function buildMarketComparison(args: {
  mapping: JesseFeedMapping;
  token: FeedSnapshot | null;
  equity: FeedSnapshot | null;
  /** Multiplier effective at the token price's generation time. Required
   *  when the verified basis is usd-per-raw-token; informational otherwise. */
  multiplierAtGeneration: string | null;
  now: number;
  id: string;
}): MarketComparison {
  const { mapping, now } = args;
  const reasons: ComparisonReasonCode[] = [];

  const token = buildObservation(args.token, mapping.token, mapping.tokenUnitBasis, now, 'token', reasons);
  const equity = buildObservation(args.equity, { feedId: mapping.equity.feedId, symbol: mapping.equity.symbol }, 'usd-per-share', now, 'equity', reasons);

  const comparison: MarketComparison = {
    id: args.id,
    version: 1,
    instrumentId: mapping.instrumentId,
    observedAt: Math.max(args.token?.receivedAt ?? 0, args.equity?.receivedAt ?? 0) || now,
    token: token.observation,
    equity: equity.observation,
    multiplier: args.multiplierAtGeneration,
    status: 'unavailable',
    referenceDifferenceBps: null,
    reasonCodes: [],
  };

  const finish = (status: MarketComparison['status'], bps: string | null): MarketComparison => ({
    ...comparison,
    status,
    referenceDifferenceBps: bps,
    reasonCodes: [...new Set(reasons)],
  });

  /* rule 1 — the basis is verified or nothing is */
  if (mapping.tokenUnitBasis === null) {
    reasons.push('unverified-unit-basis');
    return finish('unavailable', null);
  }
  if (!token.fresh && token.observation.status === 'unavailable') return finish('unavailable', null);
  if (equity.observation.status === 'unavailable') return finish('unavailable', null);

  /* rule 2 — normalize to USD per equity-equivalent unit */
  const tokenPrice = parseDecimal(token.observation.price!);
  const equityPrice = parseDecimal(equity.observation.price!);
  if (tokenPrice === null || equityPrice === null || !isPositive(tokenPrice) || !isPositive(equityPrice)) {
    reasons.push('nonpositive-price');
    return finish('unavailable', null);
  }
  let pt = tokenPrice;
  if (mapping.tokenUnitBasis === 'usd-per-raw-token') {
    const multiplier = args.multiplierAtGeneration === null ? null : parseDecimal(args.multiplierAtGeneration);
    if (multiplier === null || !isPositive(multiplier)) {
      reasons.push('multiplier-unavailable');
      return finish('unavailable', null);
    }
    pt = divide(tokenPrice, multiplier); // divide once — never twice
  }

  /* rule 3 — the exact reference difference */
  const bps = renderTenths(differenceTenths(pt, equityPrice));

  /* rule 5 — everything `comparable` requires beyond a number */
  const comparableBlockers: ComparisonReasonCode[] = [];
  if (!token.fresh || !equity.fresh) comparableBlockers.push(token.fresh ? 'equity-stale' : 'token-stale');
  if (token.future !== 0 || equity.future !== 0) comparableBlockers.push('future-skew-uncertain');
  if (equity.observation.session !== 'regular') comparableBlockers.push('session-not-regular');
  if (token.fresh && equity.fresh && Math.abs(token.observation.generatedAt! - equity.observation.generatedAt!) > COMPARISON_ALIGNMENT_MS) {
    comparableBlockers.push('generation-gap-exceeded');
  }
  const tokenConfidence = token.observation.confidence === null ? null : parseDecimal(token.observation.confidence);
  const equityConfidence = equity.observation.confidence === null ? null : parseDecimal(equity.observation.confidence);
  if (tokenConfidence === null || equityConfidence === null) comparableBlockers.push('confidence-unknown');
  else if (!confidenceWithin(tokenPrice, tokenConfidence) || !confidenceWithin(equityPrice, equityConfidence)) {
    comparableBlockers.push('confidence-excessive');
  }

  if (comparableBlockers.length === 0) {
    return finish('comparable', bps);
  }

  reasons.push(...comparableBlockers);

  /* rule 6 — a labelled last observation carries a number only when the
     token is fresh, the equity is non-future, and the equity is no older
     than 7 days. Otherwise the number is suppressed. */
  const equityAge = now - equity.observation.generatedAt!;
  const numberAllowed = token.fresh && equity.future === 0 && equityAge >= 0 && equityAge <= COMPARISON_HISTORICAL_EQUITY_MS;
  if (!numberAllowed) {
    if (equityAge > COMPARISON_HISTORICAL_EQUITY_MS) reasons.push('equity-older-than-7-days');
    return finish('unavailable', null);
  }
  return finish('last-observation', bps);
}
