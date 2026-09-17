/**
 * Jesse v2 paper records and draft checkpoints (plan §4, E1 items 4–5).
 *
 * Jesse filings live under `claflin.paper.v2.jesse.<id>` as `version: 2`
 * records that carry the estimate, the instrument the desk presented, and
 * the comparison the desk presented — all frozen at filing time. Reads never
 * rewrite or revalidate old rows against the live catalog: a record keeps
 * the provenance it was filed with even if the instrument is later delisted.
 * Legacy v1 rows under `claflin.paper.v1.*` are a different namespace; this
 * module never touches them, and v1 loaders never see v2 keys.
 *
 * Everything here fails closed: a malformed, oversized, or self-contradicting
 * row throws on parse and can never be imported or attributed as Jesse work.
 */
import { z } from 'zod';
import { PAPER_OWNER_ANONYMOUS, paperOwnerOf, type PaperStorage } from '../trading/paper-records';
import { parseMultiplier } from './amounts';
import {
  isSolanaInstrumentId,
  type JesseDraft,
  type MarketComparison,
  type SolanaInstrument,
  type SolanaInstrumentId,
  type SolanaPaperEstimate,
} from './contracts';

export const JESSE_PAPER_PREFIX = 'claflin.paper.v2.jesse.';
export const JESSE_DRAFT_KEY = 'claflin.draft.v2.jesse';
/** Jesse paper history is bounded, same cap as the legacy desk. */
export const JESSE_MAX_HISTORY = 100;
/** Quotes are usable for at most the 30s review window; expiry may only shorten it. */
const MAX_REVIEW_WINDOW_MS = 30_000;
const U64_MAX = (1n << 64n) - 1n;

export interface JessePaperRecord {
  version: 2;
  id: string;
  mode: 'paper';
  deskId: 'jesse';
  owner: string;
  createdAt: number;
  quote: SolanaPaperEstimate;
  /** The instrument exactly as presented at quote time. */
  instrumentSnapshot: SolanaInstrument;
  /** The comparison exactly as presented; null when none was shown. */
  comparison: MarketComparison | null;
}

const decimal = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const rawAmount = z.string().max(40).regex(/^\d+$/);
const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
/** Refining with the contracts guard narrows the parsed type to
 *  `sol:${string}`, so validated payloads type-check as Solana ids. */
const instrumentId = z.string().max(60).refine(isSolanaInstrumentId, 'Invalid instrument id');

const instrumentSchema = z.object({
  id: instrumentId,
  network: z.literal('solana:mainnet'),
  deskId: z.literal('jesse'),
  mint,
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  underlyingSymbol: z.string().min(1).max(20),
  decimals: z.number().int().min(0).max(18),
  tokenProgram: z.literal('spl-token-2022'),
  issuer: z.string().min(1).max(40),
  termsUrl: z.string().url().max(200),
  identitySourceUrl: z.string().url().max(300),
  verifiedAt: z.number().int().positive(),
  quoteSupported: z.boolean(),
}).strict();

const jesseIntentSchema = z.discriminatedUnion('side', [
  z.object({ instrumentId, side: z.literal('buy'), unit: z.literal('USDC'), amount: decimal }).strict(),
  z.object({ instrumentId, side: z.literal('sell'), unit: z.literal('scaled-token'), amount: decimal }).strict(),
]);

const estimateSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  kind: z.literal('estimate'),
  mode: z.literal('paper'),
  liveExecutionEnabled: z.literal(false),
  deskId: z.literal('jesse'),
  network: z.literal('solana:mainnet'),
  venue: z.literal('jupiter'),
  intent: jesseIntentSchema,
  instrumentAddress: mint,
  instrumentName: z.string().max(100),
  inputMint: mint,
  outputMint: mint,
  inputSymbol: z.string().max(20),
  outputSymbol: z.string().max(20),
  amountInRaw: rawAmount,
  amountOutRaw: rawAmount,
  inputAmount: decimal,
  outputAmount: decimal,
  requestedScaledAmount: decimal.nullable(),
  effectiveScaledAmount: decimal.nullable(),
  scaling: z.object({
    multiplier: decimal,
    observedSlot: z.number().int().positive(),
    observedAt: z.number().int().positive(),
    nextEffectiveAt: z.number().int().positive().nullable(),
  }).strict(),
  router: z.string().min(1).max(40),
  priceImpactPercent: z.string().max(40).nullable(),
  feeBps: z.number().int().min(0).max(10000).nullable(),
  feeMint: mint.nullable(),
  slippageBps: z.number().int().min(0).max(10000),
  minOutputRaw: rawAmount,
  providerRequestId: z.string().min(1).max(100),
  quotedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  assumptions: z.string().min(1).max(1000),
}).strict();

const observationSchema = z.object({
  feedId: z.number().int().min(0).nullable(),
  symbol: z.string().min(1).max(60),
  source: z.literal('pyth-pro'),
  unit: z.enum(['usd-per-share', 'usd-per-raw-token', 'usd-per-scaled-token']).nullable(),
  price: decimal.nullable(),
  confidence: decimal.nullable(),
  generatedAt: z.number().int().min(0).nullable(),
  receivedAt: z.number().int().positive(),
  session: z.enum(['regular', 'preMarket', 'postMarket', 'overNight', 'closed', 'unknown']),
  status: z.enum(['fresh', 'stale', 'unavailable']),
}).strict();

const comparisonSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  instrumentId,
  observedAt: z.number().int().positive(),
  token: observationSchema,
  equity: observationSchema,
  multiplier: decimal.nullable(),
  status: z.enum(['comparable', 'last-observation', 'unavailable']),
  referenceDifferenceBps: z.string().max(40).nullable(),
  reasonCodes: z.array(z.string().min(1).max(60)).max(16),
}).strict();

const recordSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  mode: z.literal('paper'),
  deskId: z.literal('jesse'),
  owner: z.union([z.literal(PAPER_OWNER_ANONYMOUS), z.string().min(1).max(128)]),
  createdAt: z.number().int().positive(),
  quote: z.unknown(),
  instrumentSnapshot: z.unknown(),
  comparison: z.unknown().nullable(),
}).strict();

/**
 * Validate a persisted Jesse estimate. Internal consistency only — records
 * are never rebound to the live catalog, so a filed quote from a since-
 * delisted instrument still reads back with its original provenance.
 */
export function parseJesseEstimate(input: unknown): SolanaPaperEstimate {
  const q = estimateSchema.parse(input);
  if (q.intent.instrumentId !== `sol:${q.instrumentAddress}`) throw new Error('Invalid estimate binding.');
  if (q.inputMint === q.outputMint) throw new Error('Invalid estimate binding.');
  if (q.intent.side === 'buy') {
    if (q.outputMint !== q.instrumentAddress) throw new Error('Invalid estimate binding.');
    if (q.requestedScaledAmount !== null || q.effectiveScaledAmount === null) throw new Error('Invalid estimate binding.');
  } else {
    if (q.inputMint !== q.instrumentAddress) throw new Error('Invalid estimate binding.');
    if (q.requestedScaledAmount === null || q.effectiveScaledAmount === null) throw new Error('Invalid estimate binding.');
  }
  const amountIn = BigInt(q.amountInRaw);
  const amountOut = BigInt(q.amountOutRaw);
  const minOut = BigInt(q.minOutputRaw);
  if (amountIn <= 0n || amountOut <= 0n || minOut < 0n) throw new Error('Invalid estimate binding.');
  if (amountIn > U64_MAX || amountOut > U64_MAX || minOut > U64_MAX) throw new Error('Invalid estimate binding.');
  if (minOut > amountOut) throw new Error('Invalid estimate binding.');
  try {
    parseMultiplier(q.scaling.multiplier);
  } catch {
    throw new Error('Invalid estimate binding.');
  }
  /* The review window may only be shortened (a pending activation), never
     stretched past the desk's 30s bound. */
  if (q.expiresAt <= q.quotedAt || q.expiresAt > q.quotedAt + MAX_REVIEW_WINDOW_MS) throw new Error('Invalid estimate binding.');
  if (q.scaling.nextEffectiveAt !== null && q.expiresAt > q.scaling.nextEffectiveAt) throw new Error('Invalid estimate binding.');
  return q;
}

/**
 * Accepts an unknown payload (storage read) and applies full validation.
 * Oversized or non-serializable input throws.
 */
export function parseJessePaperRecord(raw: unknown): JessePaperRecord {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 20_000) throw new Error('Invalid paper record.');
  const parsed = recordSchema.parse(JSON.parse(text));
  const quote = parseJesseEstimate(parsed.quote);
  const instrument = instrumentSchema.parse(parsed.instrumentSnapshot);
  const comparison = parsed.comparison === null ? null : comparisonSchema.parse(parsed.comparison);
  /* Cross-record agreement: the record id, the quote, the instrument
     snapshot, and the comparison must all describe the same filing. */
  if (parsed.id !== quote.id) throw new Error('Invalid paper record.');
  if (instrument.id !== quote.intent.instrumentId || instrument.mint !== quote.instrumentAddress) throw new Error('Invalid paper record.');
  if (comparison !== null && comparison.instrumentId !== quote.intent.instrumentId) throw new Error('Invalid paper record.');
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
    comparison,
  };
}

export function loadJessePaperRecords(storage: PaperStorage): JessePaperRecord[] {
  const result: JessePaperRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(JESSE_PAPER_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) throw new Error('Paper record unavailable.');
    const record = parseJessePaperRecord(raw);
    if (key !== JESSE_PAPER_PREFIX + record.id) throw new Error('Paper record identity mismatch.');
    result.push(record);
    if (result.length > JESSE_MAX_HISTORY) throw new Error('Paper history exceeds the supported limit.');
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteJessePaperRecord(storage: PaperStorage & { removeItem(key: string): void }, id: string): void {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid record ID.');
  storage.removeItem(JESSE_PAPER_PREFIX + id);
  if (storage.getItem(JESSE_PAPER_PREFIX + id) !== null) throw new Error('Could not delete the paper record.');
}

/**
 * File a paper record for a Jesse estimate the desk presented. The quote
 * must still be usable at filing time; the instrument snapshot and the
 * comparison are frozen exactly as presented — nothing is refetched or
 * recomputed. Filing is idempotent: re-saving the same quote returns the
 * existing record.
 */
export function saveJessePaperRecord(
  storage: PaperStorage,
  filing: {
    quote: SolanaPaperEstimate;
    instrument: SolanaInstrument;
    comparison: MarketComparison | null;
  },
  now: number,
  owner: string = PAPER_OWNER_ANONYMOUS,
): JessePaperRecord {
  const quote = parseJesseEstimate(filing.quote);
  const instrument = instrumentSchema.parse(filing.instrument);
  const comparison = filing.comparison === null ? null : comparisonSchema.parse(filing.comparison);
  if (now < quote.quotedAt || now >= quote.expiresAt) {
    throw new Error('Request and review a fresh estimate before recording.');
  }
  if (instrument.id !== quote.intent.instrumentId || instrument.mint !== quote.instrumentAddress) {
    throw new Error('Paper record identity conflict.');
  }
  if (comparison !== null && comparison.instrumentId !== quote.intent.instrumentId) {
    throw new Error('Paper record identity conflict.');
  }
  const key = JESSE_PAPER_PREFIX + quote.id;
  const existing = storage.getItem(key);
  if (existing) {
    const record = parseJessePaperRecord(existing);
    if (JSON.stringify(record.quote) !== JSON.stringify(quote)) throw new Error('Paper record identity conflict.');
    return record;
  }
  if (loadJessePaperRecords(storage).length >= JESSE_MAX_HISTORY) {
    throw new Error('Paper history is full. Export or clear records before adding more.');
  }
  const record: JessePaperRecord = {
    version: 2,
    mode: 'paper',
    deskId: 'jesse',
    owner: owner || PAPER_OWNER_ANONYMOUS,
    id: quote.id,
    createdAt: now,
    quote,
    instrumentSnapshot: instrument,
    comparison,
  };
  const serialized = JSON.stringify(record);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Paper record could not be verified after saving.');
  return record;
}

/* Jesse draft checkpoints */

const EMPTY_DRAFT: JesseDraft = { instrumentId: null, side: null, unit: null, amount: null };

const draftSchema = z.object({
  instrumentId: instrumentId.nullable(),
  side: z.enum(['buy', 'sell']).nullable(),
  unit: z.enum(['USDC', 'scaled-token']).nullable(),
  amount: decimal.nullable(),
}).strict();

function checkDraftPairing(d: JesseDraft): boolean {
  if ((d.side === null) !== (d.unit === null)) return false;
  if (d.side === 'buy' && d.unit !== 'USDC') return false;
  if (d.side === 'sell' && d.unit !== 'scaled-token') return false;
  return true;
}

/**
 * Persist an in-progress Jesse draft. Every field is nullable — a draft is
 * a checkpoint of user work, distinct from a complete JesseIntent. An
 * all-null draft clears the checkpoint.
 */
export function saveJesseDraft(storage: PaperStorage & { removeItem(key: string): void }, draft: JesseDraft): void {
  const d = draftSchema.parse(draft);
  if (!checkDraftPairing(d)) throw new Error('Invalid draft.');
  if (d.instrumentId === null && d.side === null && d.amount === null) {
    storage.removeItem(JESSE_DRAFT_KEY);
    if (storage.getItem(JESSE_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
    return;
  }
  const serialized = JSON.stringify(d);
  storage.setItem(JESSE_DRAFT_KEY, serialized);
  if (storage.getItem(JESSE_DRAFT_KEY) !== serialized) throw new Error('Draft could not be verified after saving.');
}

/** Read the checkpoint. A missing or malformed checkpoint yields an empty
 *  draft — it is a convenience, never evidence. */
export function loadJesseDraft(storage: PaperStorage): JesseDraft {
  const raw = storage.getItem(JESSE_DRAFT_KEY);
  if (!raw) return { ...EMPTY_DRAFT };
  try {
    const d = draftSchema.parse(JSON.parse(raw));
    if (!checkDraftPairing(d)) return { ...EMPTY_DRAFT };
    return d;
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function clearJesseDraft(storage: PaperStorage & { removeItem(key: string): void }): void {
  storage.removeItem(JESSE_DRAFT_KEY);
  if (storage.getItem(JESSE_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
}
