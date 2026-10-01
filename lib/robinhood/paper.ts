/**
 * Isabel v2 paper records and draft checkpoints — the Robinhood Chain desk's
 * filing layer, same namespace discipline as Jesse's (lib/solana/paper.ts).
 *
 * Isabel filings live under `claflin.paper.v2.isabel.<id>` as `version: 2`
 * records carrying the estimate, the instrument the desk presented, and the
 * three-way evidence tape (issuer / onchain / venue) exactly as shown at
 * filing time. Reads never rewrite or revalidate old rows against the live
 * catalog: a record keeps its provenance even if the instrument delists.
 *
 * Everything here fails closed: a malformed, oversized, or self-contradicting
 * row throws on parse and can never be imported or attributed as Isabel work.
 */
import { z } from 'zod';
import { PAPER_OWNER_ANONYMOUS, paperOwnerOf, type PaperStorage } from '../trading/paper-records';
import {
  isRobinhoodInstrumentId,
  type IsabelDraft,
  type RobinhoodInstrument,
  type RobinhoodInstrumentId,
  type RobinhoodPaperEstimate,
} from './contracts';
import type { RobinhoodEvidence } from './duplex';

export const ISABEL_PAPER_PREFIX = 'claflin.paper.v2.isabel.';
export const ISABEL_DRAFT_KEY = 'claflin.draft.v2.isabel';
/** Isabel paper history is bounded, same cap as the other desks. */
export const ISABEL_MAX_HISTORY = 100;
/** Quotes are usable for at most the 30s review window; expiry may only shorten it. */
const MAX_REVIEW_WINDOW_MS = 30_000;

export interface IsabelPaperRecord {
  version: 2;
  id: string;
  mode: 'paper';
  deskId: 'isabel';
  owner: string;
  createdAt: number;
  quote: RobinhoodPaperEstimate;
  /** The instrument exactly as presented at quote time. */
  instrumentSnapshot: RobinhoodInstrument;
  /** The issuer/onchain/venue tape exactly as presented; null when none showed. */
  evidence: RobinhoodEvidence | null;
}

const decimal = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const rawAmount = z.string().max(40).regex(/^\d+$/);
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
/** Refining with the contracts guard narrows the parsed type to
 *  `rh:${string}`, so validated payloads type-check as Robinhood ids. */
const instrumentId = z.string().max(60).refine(isRobinhoodInstrumentId, 'Invalid instrument id');

const instrumentSchema = z.object({
  id: instrumentId,
  network: z.literal('eip155:4663'),
  deskId: z.literal('isabel'),
  contractAddress: evmAddress,
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  underlyingSymbol: z.string().min(1).max(20),
  decimals: z.literal(18),
  issuer: z.string().min(1).max(80),
  chainlinkFeed: evmAddress,
  lighterMarketId: z.number().int().min(0),
  identitySourceUrl: z.string().url().max(300),
  verifiedAt: z.number().int().positive(),
  quoteSupported: z.boolean(),
}).strict();

const isabelIntentSchema = z.discriminatedUnion('side', [
  z.object({ instrumentId, side: z.literal('buy'), unit: z.literal('USDG'), amount: decimal }).strict(),
  z.object({ instrumentId, side: z.literal('sell'), unit: z.literal('token'), amount: decimal }).strict(),
]);

const estimateSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  kind: z.literal('estimate'),
  mode: z.literal('paper'),
  liveExecutionEnabled: z.literal(false),
  deskId: z.literal('isabel'),
  mandateId: z.literal('robinhood-stock-tokens').optional(),
  offeringId: z.string().min(1).max(180).optional(),
  instrumentId: instrumentId.optional(),
  network: z.literal('eip155:4663'),
  chainId: z.literal(4663),
  venue: z.literal('lighter'),
  intent: isabelIntentSchema,
  instrumentAddress: evmAddress,
  instrumentName: z.string().max(120),
  inputSymbol: z.string().max(20),
  outputSymbol: z.string().max(20),
  amountInRaw: rawAmount,
  amountOutRaw: rawAmount,
  inputAmount: decimal,
  outputAmount: decimal,
  book: z.object({
    marketId: z.number().int().min(0),
    bestBid: decimal.nullable(),
    bestAsk: decimal.nullable(),
    midPrice: z.string().max(40).nullable(),
    spreadBps: z.string().max(40).nullable(),
    levelsConsumed: z.number().int().min(0).max(10_000),
    filledFully: z.boolean(),
    unfilledInputRaw: rawAmount,
  }).strict(),
  multiplierRaw: rawAmount.nullable(),
  shareEquivalent: z.string().max(60).nullable(),
  onchainMark: z.object({
    answerRaw: rawAmount,
    decimals: z.number().int().min(0).max(18),
    updatedAt: z.number().int().min(0),
    status: z.enum(['observed', 'stale', 'unavailable']),
  }).strict(),
  issuerMark: z.object({
    underlyingBid: z.string().max(40),
    underlyingAsk: z.string().max(40),
    tokenBid: z.string().max(40),
    tokenAsk: z.string().max(40),
    halted: z.boolean(),
    generatedAt: z.string().max(60).nullable(),
  }).strict().nullable(),
  quotedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  assumptions: z.string().min(1).max(1500),
}).strict();

const evidenceSchema = z.object({
  version: z.literal(1),
  source: z.literal('venue-triplex'),
  instrumentId,
  symbol: z.string().max(20),
  contractAddress: evmAddress,
  observedAt: z.number().int().positive(),
  status: z.enum(['comparable', 'unavailable']),
  issuer: z.object({
    underlyingBid: z.string().max(40).nullable(),
    underlyingAsk: z.string().max(40).nullable(),
    tokenBid: z.string().max(40).nullable(),
    tokenAsk: z.string().max(40).nullable(),
    halted: z.boolean(),
    generatedAt: z.string().max(60).nullable(),
  }).strict().nullable(),
  onchain: z.object({
    priceUsd: z.string().max(40),
    updatedAt: z.number().int().min(0),
    status: z.enum(['observed', 'stale']),
  }).strict().nullable(),
  venue: z.object({
    marketId: z.number().int().min(0),
    bestBid: z.string().max(40).nullable(),
    bestAsk: z.string().max(40).nullable(),
    midPriceUsd: z.string().max(40).nullable(),
    dailyQuoteVolumeUsd: z.string().max(40).nullable(),
  }).strict().nullable(),
  venueVsIssuerBps: z.string().max(40).nullable(),
  onchainVsIssuerBps: z.string().max(40).nullable(),
  venueVsOnchainBps: z.string().max(40).nullable(),
  reasonCodes: z.array(z.enum([
    'unknown-instrument',
    'issuer-unavailable',
    'issuer-halted',
    'onchain-unavailable',
    'onchain-stale',
    'venue-unavailable',
    'venue-empty-book',
    'nonpositive-price',
  ])).max(16),
  disclaimer: z.string().max(400),
}).strict();

/** Validate a triplex evidence payload from the venue-duplex API or storage. */
export function parseRobinhoodEvidence(input: unknown): RobinhoodEvidence {
  return evidenceSchema.parse(input);
}

const recordSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  mode: z.literal('paper'),
  deskId: z.literal('isabel'),
  owner: z.union([z.literal(PAPER_OWNER_ANONYMOUS), z.string().min(1).max(128)]),
  createdAt: z.number().int().positive(),
  quote: z.unknown(),
  instrumentSnapshot: z.unknown(),
  evidence: z.unknown().nullable(),
}).strict();

/**
 * Validate a persisted Isabel estimate. Internal consistency only — records
 * are never rebound to the live catalog, so a filed quote from a since-
 * delisted instrument still reads back with its original provenance.
 */
export function parseRobinhoodEstimate(input: unknown): RobinhoodPaperEstimate {
  const q = estimateSchema.parse(input);
  if ((q.instrumentId && q.instrumentId !== q.intent.instrumentId) ||
    (q.offeringId && q.mandateId && !q.offeringId.startsWith(`${q.mandateId}:`))) {
    throw new Error('Invalid estimate binding.');
  }
  if (q.intent.instrumentId !== `rh:${q.instrumentAddress.toLowerCase()}`) throw new Error('Invalid estimate binding.');
  if (q.intent.side === 'buy') {
    if (q.inputSymbol !== 'USDG') throw new Error('Invalid estimate binding.');
  } else {
    if (q.outputSymbol !== 'USDG') throw new Error('Invalid estimate binding.');
  }
  const amountIn = BigInt(q.amountInRaw);
  const amountOut = BigInt(q.amountOutRaw);
  const unfilled = BigInt(q.book.unfilledInputRaw);
  if (amountIn <= 0n || amountOut <= 0n || unfilled < 0n || unfilled >= amountIn) throw new Error('Invalid estimate binding.');
  if (q.book.filledFully && unfilled !== 0n) throw new Error('Invalid estimate binding.');
  if (q.multiplierRaw !== null && BigInt(q.multiplierRaw) <= 0n) throw new Error('Invalid estimate binding.');
  if ((q.shareEquivalent === null) !== (q.multiplierRaw === null)) throw new Error('Invalid estimate binding.');
  /* The review window may only be shortened, never stretched past the
     desk's 30s bound. */
  if (q.expiresAt <= q.quotedAt || q.expiresAt > q.quotedAt + MAX_REVIEW_WINDOW_MS) throw new Error('Invalid estimate binding.');
  return q;
}

/**
 * Accepts an unknown payload (storage read) and applies full validation.
 * Oversized or non-serializable input throws.
 */
export function parseIsabelPaperRecord(raw: unknown): IsabelPaperRecord {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 24_000) throw new Error('Invalid paper record.');
  const parsed = recordSchema.parse(JSON.parse(text));
  const quote = parseRobinhoodEstimate(parsed.quote);
  const instrument = instrumentSchema.parse(parsed.instrumentSnapshot);
  const evidence = parsed.evidence === null ? null : evidenceSchema.parse(parsed.evidence);
  /* Cross-record agreement: the record id, the quote, the instrument
     snapshot, and the evidence tape must all describe the same filing. */
  if (parsed.id !== quote.id) throw new Error('Invalid paper record.');
  if (instrument.id !== quote.intent.instrumentId || instrument.contractAddress.toLowerCase() !== quote.instrumentAddress.toLowerCase()) {
    throw new Error('Invalid paper record.');
  }
  if (evidence !== null && evidence.instrumentId !== quote.intent.instrumentId) throw new Error('Invalid paper record.');
  if (parsed.createdAt < quote.quotedAt || parsed.createdAt >= quote.expiresAt) throw new Error('Invalid paper record.');
  return {
    version: parsed.version,
    id: parsed.id,
    mode: parsed.mode,
    deskId: parsed.deskId,
    owner: paperOwnerOf({ owner: parsed.owner }),
    createdAt: parsed.createdAt,
    quote,
    instrumentSnapshot: instrument,
    evidence,
  };
}

export function loadIsabelPaperRecords(storage: PaperStorage): IsabelPaperRecord[] {
  const result: IsabelPaperRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(ISABEL_PAPER_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) throw new Error('Paper record unavailable.');
    const record = parseIsabelPaperRecord(raw);
    if (key !== ISABEL_PAPER_PREFIX + record.id) throw new Error('Paper record identity mismatch.');
    result.push(record);
    if (result.length > ISABEL_MAX_HISTORY) throw new Error('Paper history exceeds the supported limit.');
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteIsabelPaperRecord(storage: PaperStorage & { removeItem(key: string): void }, id: string): void {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid record ID.');
  storage.removeItem(ISABEL_PAPER_PREFIX + id);
  if (storage.getItem(ISABEL_PAPER_PREFIX + id) !== null) throw new Error('Could not delete the paper record.');
}

/**
 * File a paper record for an Isabel estimate the desk presented. The quote
 * must still be usable at filing time; the instrument snapshot and the
 * evidence tape are frozen exactly as presented — nothing is refetched or
 * recomputed. Filing is idempotent: re-saving the same quote returns the
 * existing record.
 */
export function saveIsabelPaperRecord(
  storage: PaperStorage,
  filing: {
    quote: RobinhoodPaperEstimate;
    instrument: RobinhoodInstrument;
    evidence: RobinhoodEvidence | null;
  },
  now: number,
  owner: string = PAPER_OWNER_ANONYMOUS,
): IsabelPaperRecord {
  const quote = parseRobinhoodEstimate(filing.quote);
  const instrument = instrumentSchema.parse(filing.instrument);
  const evidence = filing.evidence === null ? null : evidenceSchema.parse(filing.evidence);
  if (now < quote.quotedAt || now >= quote.expiresAt) {
    throw new Error('Request and review a fresh estimate before recording.');
  }
  if (instrument.id !== quote.intent.instrumentId || instrument.contractAddress.toLowerCase() !== quote.instrumentAddress.toLowerCase()) {
    throw new Error('Paper record identity conflict.');
  }
  if (evidence !== null && evidence.instrumentId !== quote.intent.instrumentId) {
    throw new Error('Paper record identity conflict.');
  }
  const key = ISABEL_PAPER_PREFIX + quote.id;
  const existing = storage.getItem(key);
  if (existing) {
    const record = parseIsabelPaperRecord(existing);
    if (JSON.stringify(record.quote) !== JSON.stringify(quote)) throw new Error('Paper record identity conflict.');
    return record;
  }
  if (loadIsabelPaperRecords(storage).length >= ISABEL_MAX_HISTORY) {
    throw new Error('Paper history is full. Export or clear records before adding more.');
  }
  const record: IsabelPaperRecord = {
    version: 2,
    mode: 'paper',
    deskId: 'isabel',
    owner: owner || PAPER_OWNER_ANONYMOUS,
    id: quote.id,
    createdAt: now,
    quote,
    instrumentSnapshot: instrument,
    evidence,
  };
  const serialized = JSON.stringify(record);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Paper record could not be verified after saving.');
  return record;
}

/* Isabel draft checkpoints */

const EMPTY_DRAFT: IsabelDraft = { instrumentId: null, side: null, amount: null };

const draftSchema = z.object({
  instrumentId: instrumentId.nullable(),
  side: z.enum(['buy', 'sell']).nullable(),
  amount: decimal.nullable(),
}).strict();

/**
 * Persist an in-progress Isabel draft. Every field is nullable — a draft is
 * a checkpoint of user work, distinct from a complete IsabelIntent. An
 * all-null draft clears the checkpoint. The unit is implied by the side
 * (USDG spend for buys, token quantity for sells) so it is never stored.
 */
export function saveIsabelDraft(storage: PaperStorage & { removeItem(key: string): void }, draft: IsabelDraft): void {
  const d = draftSchema.parse(draft);
  if (d.instrumentId === null && d.side === null && d.amount === null) {
    storage.removeItem(ISABEL_DRAFT_KEY);
    if (storage.getItem(ISABEL_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
    return;
  }
  const serialized = JSON.stringify(d);
  storage.setItem(ISABEL_DRAFT_KEY, serialized);
  if (storage.getItem(ISABEL_DRAFT_KEY) !== serialized) throw new Error('Draft could not be verified after saving.');
}

/** Read the checkpoint. A missing or malformed checkpoint yields an empty
 *  draft — it is a convenience, never evidence. */
export function loadIsabelDraft(storage: PaperStorage): IsabelDraft {
  const raw = storage.getItem(ISABEL_DRAFT_KEY);
  if (!raw) return { ...EMPTY_DRAFT };
  try {
    return draftSchema.parse(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function clearIsabelDraft(storage: PaperStorage & { removeItem(key: string): void }): void {
  storage.removeItem(ISABEL_DRAFT_KEY);
  if (storage.getItem(ISABEL_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
}
