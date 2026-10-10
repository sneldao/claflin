/**
 * Halley paper records and draft checkpoints — the launch desk's filing
 * layer, same namespace discipline as Jesse's and Isabel's.
 *
 * Filings live under `claflin.paper.v2.halley.<id>` as `version: 2` records
 * carrying the launch estimate and the anchor evidence exactly as presented
 * at filing time. A paper launch is a record of intent — never a deployed
 * mint, a pool, or a position.
 *
 * Everything here fails closed: a malformed, oversized, or self-contradicting
 * row throws on parse and can never be imported or attributed as Halley work.
 */
import { z } from 'zod';
import { PAPER_OWNER_ANONYMOUS, paperOwnerOf, type PaperStorage } from '../trading/paper-records';
import {
  isHalleyLaunchIntent,
  type HalleyAnchor,
  type HalleyDraft,
  type HalleyLaunchEstimate,
} from './contracts';

export const HALLEY_PAPER_PREFIX = 'claflin.paper.v2.halley.';
export const HALLEY_DRAFT_KEY = 'claflin.draft.v2.halley';
export const HALLEY_MAX_HISTORY = 100;
/** Launch estimates carry a 60s review window; expiry may only shorten it. */
const MAX_REVIEW_WINDOW_MS = 60_000;

export interface HalleyPaperRecord {
  version: 2;
  id: string;
  mode: 'paper';
  deskId: 'halley';
  owner: string;
  createdAt: number;
  estimate: HalleyLaunchEstimate;
}

const decimal = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const rawAmount = z.string().max(80).regex(/^\d+$/);
const solanaAddress = z.string().min(32).max(44);

const anchorSchema = z.object({
  symbol: z.string().min(1).max(10),
  source: z.enum(['pyth-pro', 'onchain']),
  equityUsd: z.string().max(40),
  pairRatio: z.string().max(40).nullable(),
  quoteEquityUsd: z.string().max(40).nullable(),
  observedAt: z.number().int().min(0),
  status: z.enum(['observed', 'stale', 'unavailable']),
  restingEquity: z.object({
    equityUsd: z.string().max(40),
    differenceBps: z.string().max(20).nullable(),
  }).strict().nullable().optional(),
}).strict();

const estimateSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  kind: z.literal('launch-estimate'),
  mode: z.literal('paper'),
  deskId: z.literal('halley'),
  mandateId: z.literal('meteora-launch'),
  network: z.literal('solana:mainnet'),
  venue: z.literal('meteora-dbc'),
  intent: z.unknown(),
  quoteMint: solanaAddress,
  quoteDecimals: z.number().int().min(0).max(18),
  quoteBadge: solanaAddress.nullable(),
  anchor: anchorSchema.nullable(),
  openingPriceQuote: z.string().max(40),
  graduationPriceQuote: z.string().max(40),
  sqrtStart: rawAmount,
  sqrtMin: rawAmount,
  sqrtMax: rawAmount,
  migrationQuoteThreshold: rawAmount,
  path: z.array(z.object({ progress: z.string().max(40), priceQuote: z.string().max(40) }).strict()).min(2).max(64),
  migration: z.object({
    target: z.literal('damm-v2'),
    config: z.string().max(60),
    lockedLiquidityBps: z.number().int().min(0).max(10_000),
  }).strict(),
  tradingFeeBps: z.number().int().min(0).max(10_000),
  migrationFeeBps: z.number().int().min(0).max(10_000),
  quotedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  assumptions: z.string().min(1).max(2000),
}).strict();

/** Internal consistency only — a filed estimate keeps its provenance even if
 *  the quote catalog later changes. */
export function parseHalleyEstimate(input: unknown): HalleyLaunchEstimate {
  const q = estimateSchema.parse(input);
  if (!isHalleyLaunchIntent(q.intent)) throw new Error('Invalid estimate binding.');
  if (q.expiresAt <= q.quotedAt || q.expiresAt > q.quotedAt + MAX_REVIEW_WINDOW_MS) {
    throw new Error('Invalid estimate binding.');
  }
  return q as HalleyLaunchEstimate;
}

const recordSchema = z.object({
  version: z.literal(2),
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  mode: z.literal('paper'),
  deskId: z.literal('halley'),
  owner: z.union([z.literal(PAPER_OWNER_ANONYMOUS), z.string().min(1).max(128)]),
  createdAt: z.number().int().positive(),
  estimate: z.unknown(),
}).strict();

export function parseHalleyPaperRecord(raw: unknown): HalleyPaperRecord {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 24_000) throw new Error('Invalid paper record.');
  const parsed = recordSchema.parse(JSON.parse(text));
  const estimate = parseHalleyEstimate(parsed.estimate);
  if (parsed.id !== estimate.id) throw new Error('Invalid paper record.');
  if (parsed.createdAt < estimate.quotedAt || parsed.createdAt >= estimate.expiresAt) {
    throw new Error('Invalid paper record.');
  }
  return {
    version: parsed.version,
    id: parsed.id,
    mode: parsed.mode,
    deskId: parsed.deskId,
    owner: paperOwnerOf({ owner: parsed.owner }),
    createdAt: parsed.createdAt,
    estimate,
  };
}

export function loadHalleyPaperRecords(storage: PaperStorage): HalleyPaperRecord[] {
  const result: HalleyPaperRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(HALLEY_PAPER_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) throw new Error('Paper record unavailable.');
    const record = parseHalleyPaperRecord(raw);
    if (key !== HALLEY_PAPER_PREFIX + record.id) throw new Error('Paper record identity mismatch.');
    result.push(record);
    if (result.length > HALLEY_MAX_HISTORY) throw new Error('Paper history exceeds the supported limit.');
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteHalleyPaperRecord(storage: PaperStorage & { removeItem(key: string): void }, id: string): void {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid record ID.');
  storage.removeItem(HALLEY_PAPER_PREFIX + id);
  if (storage.getItem(HALLEY_PAPER_PREFIX + id) !== null) throw new Error('Could not delete the paper record.');
}

/** File a paper launch record for an estimate under review. Idempotent:
 *  re-saving the same estimate returns the existing record. */
export function saveHalleyPaperRecord(
  storage: PaperStorage,
  estimate: HalleyLaunchEstimate,
  now: number,
  owner: string = PAPER_OWNER_ANONYMOUS,
): HalleyPaperRecord {
  const parsed = parseHalleyEstimate(estimate);
  if (now < parsed.quotedAt || now >= parsed.expiresAt) {
    throw new Error('Request and review a fresh estimate before recording.');
  }
  const key = HALLEY_PAPER_PREFIX + parsed.id;
  const existing = storage.getItem(key);
  if (existing) {
    const record = parseHalleyPaperRecord(existing);
    if (JSON.stringify(record.estimate) !== JSON.stringify(parsed)) throw new Error('Paper record identity conflict.');
    return record;
  }
  if (loadHalleyPaperRecords(storage).length >= HALLEY_MAX_HISTORY) {
    throw new Error('Paper history is full. Export or clear records before adding more.');
  }
  const record: HalleyPaperRecord = {
    version: 2,
    mode: 'paper',
    deskId: 'halley',
    owner: owner || PAPER_OWNER_ANONYMOUS,
    id: parsed.id,
    createdAt: now,
    estimate: parsed,
  };
  const serialized = JSON.stringify(record);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Paper record could not be verified after saving.');
  return record;
}

/* Halley draft checkpoints */

const EMPTY_DRAFT: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};

const draftSchema = z.object({
  name: z.string().min(2).max(40).nullable(),
  symbol: z.string().regex(/^[A-Z0-9]{2,10}$/).nullable(),
  anchorSymbol: z.string().regex(/^[A-Z0-9.]{1,10}$/).nullable(),
  quoteSymbol: z.string().min(1).max(10).nullable(),
  curve: z.enum(['flat', 'exponential', 'long', 'equity-pair']).nullable(),
  supply: z.string().regex(/^[1-9]\d*$/).nullable(),
  graduationQuote: decimal.nullable(),
}).strict();

export function saveHalleyDraft(storage: PaperStorage & { removeItem(key: string): void }, draft: HalleyDraft): void {
  const d = draftSchema.parse(draft);
  if (Object.values(d).every(v => v === null)) {
    storage.removeItem(HALLEY_DRAFT_KEY);
    if (storage.getItem(HALLEY_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
    return;
  }
  const serialized = JSON.stringify(d);
  storage.setItem(HALLEY_DRAFT_KEY, serialized);
  if (storage.getItem(HALLEY_DRAFT_KEY) !== serialized) throw new Error('Draft could not be verified after saving.');
}

/** Read the checkpoint. A missing or malformed checkpoint yields an empty
 *  draft — it is a convenience, never evidence. */
export function loadHalleyDraft(storage: PaperStorage): HalleyDraft {
  const raw = storage.getItem(HALLEY_DRAFT_KEY);
  if (!raw) return { ...EMPTY_DRAFT };
  try {
    return draftSchema.parse(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function clearHalleyDraft(storage: PaperStorage & { removeItem(key: string): void }): void {
  storage.removeItem(HALLEY_DRAFT_KEY);
  if (storage.getItem(HALLEY_DRAFT_KEY) !== null) throw new Error('Could not clear the draft.');
}
