/**
 * The house board — one row per verified offering, with each number's source
 * and freshness beside it. Pure: no React, no fetch. A gap is shown only when
 * the desk itself observed a comparable stock reference; it is never computed
 * across sources (docs/FOYER_LINE.md §4.5).
 */
import type { MarketMandateId, InstrumentOffering } from './contracts';
import type { HouseDeskId } from '../house';
import { markPrice, type DeskMark } from '../trading/marks-shared';
import { mandateLabel, openDesksForOffering, railLabel, venueLabel, type OfferingProductGroup } from './offerings-presentation';

/**
 * What the token legally is and who it is for, per product family. Sources
 * are the issuers' own documents; re-check before release.
 * - Coinbase: docs/AGENTIC_ARCHITECTURE.md → Coinbase Tokenized Stocks
 *   integration baseline (Base guide, reviewed 2026-09-05).
 * - Backed: docs.xstocks.fi/docs/product-legal-overview and xstocks.fi
 *   (fetched 2026-09-24).
 */
export interface ProductFacts {
  what: string;
  rights: string;
  eligibility: string;
  sourceLabel: string;
  sourceUrl: string;
}

export const PRODUCT_FACTS: Partial<Record<MarketMandateId, ProductFacts>> = Object.freeze({
  'coinbase-tokenized-stocks': Object.freeze({
    what: 'A B20 token issued by Coinbase on Base: a beneficial claim on one share held 1:1 at a regulated custodian.',
    rights: 'Economic exposure, not a shareholder listing. Cash dividends raise the token’s multiplier instead of paying out, so one token is not always one share.',
    eligibility: 'Offered to eligible non-US persons only. The chain does not check this; you must.',
    sourceLabel: 'Base tokenized stocks guide',
    sourceUrl: 'https://docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base',
  }),
  'backed-xstocks': Object.freeze({
    what: 'A tracker certificate issued by Backed Assets (JE) Limited: a debt instrument collateralised 1:1 by the underlying share.',
    rights: 'Economic exposure only. It is not direct equity ownership and carries no shareholder voting rights.',
    eligibility: 'Not offered in the United States or to US persons, and restricted in other prohibited jurisdictions.',
    sourceLabel: 'xStocks product legal overview',
    sourceUrl: 'https://docs.xstocks.fi/docs/product-legal-overview',
  }),
});

export type MarkState = 'observed' | 'stale' | 'unavailable' | 'pending';

export interface BoardRow {
  offeringId: string;
  underlyingSymbol: string;
  symbol: string;
  name: string;
  issuer: string;
  product: string;
  rail: string;
  venue: string;
  quoteAsset: string;
  /** Token mark in USD, formatted; null when none is observed. */
  tokenMark: string | null;
  markState: MarkState;
  markSource: string | null;
  markAt: number | null;
  /** The desk's own stock reference for the same instrument, if any. */
  stockRef: string | null;
  stockRefSource: string | null;
  /** Signed gap, token vs stock reference, in basis points — only when the
   *  desk observed both legs and the mark is fresh. */
  gapBps: number | null;
  gapNote: string;
  address: string;
  explorerUrl: string;
  deskIds: readonly HouseDeskId[];
  facts: ProductFacts | null;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  chainlink: 'Chainlink',
  'jupiter-price-v3': 'Jupiter Price',
  backed: 'Backed',
  'jupiter-stock-data': 'Jupiter stock data',
});

export function sourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return SOURCE_LABELS[source] ?? source;
}

/** Contract or mint, and where anyone can check it. */
export function explorerFor(offering: InstrumentOffering): { address: string; url: string } {
  const [prefix, ...rest] = offering.instrumentId.split(':');
  const address = rest.join(':');
  if (offering.rail.kind === 'solana' || prefix === 'sol') {
    return { address, url: `https://solscan.io/token/${address}` };
  }
  if (offering.rail.chainId === 8453) return { address, url: `https://basescan.org/token/${address}` };
  return { address, url: '' };
}

/* Chainlink rounds report `updatedAt` in unix seconds; the Jupiter adapter
   reports milliseconds. Anything below 1e12 is seconds (before 2001 in ms). */
const SECONDS_CUTOFF = 1e12;

export function observedAtMs(at: number | undefined): number | null {
  if (!at || !Number.isFinite(at) || at <= 0) return null;
  return at < SECONDS_CUTOFF ? at * 1000 : at;
}

function gapNoteFor(mark: DeskMark | undefined, markState: MarkState): string {
  if (!mark) return markState === 'pending' ? 'Reading the tape' : 'No mark on this rail';
  if (!mark.stockReference) return 'No stock reference on this rail yet';
  if (markState !== 'observed') return 'Mark is not fresh, so no gap is shown';
  if (mark.stockReference.differenceBps == null) return 'Readings were not comparable';
  return 'Token mark vs the desk’s stock reference';
}

export function boardRow(offering: InstrumentOffering, mark: DeskMark | undefined, marksLoaded: boolean): BoardRow {
  const markState: MarkState = mark ? mark.reference.status : marksLoaded ? 'unavailable' : 'pending';
  const tokenMark = mark ? markPrice(mark) : null;
  const rawGap = mark?.stockReference?.differenceBps;
  const gap = markState === 'observed' && rawGap != null ? Number(rawGap) : NaN;
  const stockValue = mark?.stockReference ? Number(mark.stockReference.priceUsd) : NaN;
  const { address, url } = explorerFor(offering);
  return {
    offeringId: offering.offeringId,
    underlyingSymbol: offering.underlyingSymbol,
    symbol: offering.symbol,
    name: offering.name,
    issuer: offering.issuer ?? 'Issuer pending verification',
    product: mandateLabel(offering),
    rail: railLabel(offering.rail),
    venue: venueLabel(offering.venue),
    quoteAsset: offering.quoteAsset ?? 'Pending',
    tokenMark,
    markState,
    markSource: sourceLabel(mark?.reference.source),
    markAt: observedAtMs(mark?.reference.updatedAt),
    stockRef: Number.isFinite(stockValue) && stockValue > 0 ? stockValue.toFixed(2) : null,
    stockRefSource: sourceLabel(mark?.stockReference?.source),
    gapBps: Number.isFinite(gap) ? gap : null,
    gapNote: gapNoteFor(mark, markState),
    address,
    explorerUrl: url,
    deskIds: openDesksForOffering(offering).map(desk => desk.id),
    facts: PRODUCT_FACTS[offering.mandateId] ?? null,
  };
}

export function boardRows(
  groups: readonly OfferingProductGroup[],
  marks: ReadonlyMap<string, DeskMark>,
  marksLoaded: (offering: InstrumentOffering) => boolean,
): readonly BoardRow[] {
  return groups.flatMap(group => group.offerings.map(offering =>
    boardRow(offering, marks.get(offering.instrumentId), marksLoaded(offering))));
}

/** "+13.6 bps" / "−4.0 bps" / "0.0 bps". */
export function formatGap(bps: number): string {
  const sign = bps > 0 ? '+' : bps < 0 ? '−' : '';
  return `${sign}${Math.abs(bps).toFixed(1)} bps`;
}

/** "11:21:04 AM ET" — the moment a reading was observed, in exchange time. */
export function formatObservedAt(at: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(at)) + ' ET';
}

/** Short form of a long address for the row; the full value stays in the link. */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
