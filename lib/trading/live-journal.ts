/**
 * Live execution journal — durable evidence of approvals and swaps on Base.
 *
 * Distinct from paper records: these are historical transactions, never a
 * current wallet holding and never a simulation. Persist the hash as soon as
 * submission returns; reconcile pending/unknown rows after reload without
 * resubmitting.
 */

import { z } from 'zod';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { DESK_INSTRUMENTS } from './catalog';
import { parseEstimate } from './workflow';
import type { QuoteEstimate } from './domain';
import type { LiveOutcome } from './execute-swap';
import { LIVE_OUTCOME_STATUSES, type LiveOutcomeStatus } from './outcomes';

export const LIVE_JOURNAL_PREFIX = 'claflin.live.v1.';
const MAX_ENTRIES = 100;

export type LiveJournalKind = 'approval' | 'submitted-swap' | 'confirmed-swap';

export type LiveJournalSettlement = {
  status: LiveOutcomeStatus;
  message: string;
  gasUsedWei?: string;
  effectiveGasPriceWei?: string;
  feeEth?: string;
  amountInObserved?: string;
  amountOutObserved?: string;
  blockNumber?: number;
};

/** Reviewed terms are stored separately from the onchain outcome. */
export type LiveJournalEntry = {
  version: 1;
  id: string;
  kind: LiveJournalKind;
  mode: 'live';
  deskId: HouseDeskId;
  createdAt: number;
  updatedAt: number;
  walletAddress: string;
  hash: `0x${string}`;
  quote: QuoteEstimate;
  slippageBps: number | null;
  /** Terms the caller reviewed — never rewritten from the fill. */
  reviewed: {
    inputAmount: string;
    inputSymbol: string;
    outputAmount: string;
    outputSymbol: string;
    quotedAt: number;
    expiresAt: number;
  };
  settlement: LiveJournalSettlement;
  /** Always false — a journal row is a historical transaction, not a holding. */
  isPosition: false;
};

export type LiveJournalStorage = {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

const settlementSchema = z.object({
  status: z.enum(LIVE_OUTCOME_STATUSES),
  message: z.string().min(1).max(500),
  gasUsedWei: z.string().max(80).optional(),
  effectiveGasPriceWei: z.string().max(80).optional(),
  feeEth: z.string().max(40).optional(),
  amountInObserved: z.string().max(40).optional(),
  amountOutObserved: z.string().max(40).optional(),
  blockNumber: z.number().int().nonnegative().optional(),
}).strict();

const schema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(120),
  kind: z.enum(['approval', 'submitted-swap', 'confirmed-swap']),
  mode: z.literal('live'),
  deskId: z.enum(['hetty', 'jesse', 'isabel', 'arbitrum']),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  walletAddress: z.string().min(1).max(80),
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  quote: z.unknown(),
  slippageBps: z.number().int().nonnegative().nullable(),
  reviewed: z.object({
    inputAmount: z.string().min(1).max(40),
    inputSymbol: z.string().min(1).max(20),
    outputAmount: z.string().min(1).max(40),
    outputSymbol: z.string().min(1).max(20),
    quotedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  }).strict(),
  settlement: settlementSchema,
  isPosition: z.literal(false),
}).strict();

function reviewedFromQuote(quote: QuoteEstimate) {
  return {
    inputAmount: quote.inputAmount,
    inputSymbol: quote.inputSymbol,
    outputAmount: quote.outputAmount,
    outputSymbol: quote.outputSymbol,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
  };
}

function settlementFromOutcome(outcome: LiveOutcome): LiveJournalSettlement {
  return {
    status: outcome.status,
    message: outcome.message,
    gasUsedWei: outcome.gasUsedWei,
    effectiveGasPriceWei: outcome.effectiveGasPriceWei,
    feeEth: outcome.feeEth,
    amountInObserved: outcome.amountInObserved,
    amountOutObserved: outcome.amountOutObserved,
    blockNumber: outcome.blockNumber,
  };
}

function kindForSettlement(kind: LiveJournalKind, status: LiveOutcomeStatus): LiveJournalKind {
  if (kind === 'approval') return 'approval';
  if (status === 'filled' || status === 'failed') return 'confirmed-swap';
  return 'submitted-swap';
}

export function parseLiveJournalEntry(raw: unknown): LiveJournalEntry {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 40000) throw new Error('Invalid live journal entry.');
  const parsed = schema.parse(JSON.parse(text));
  const quote = parseEstimate(parsed.quote);
  return {
    version: 1,
    id: parsed.id,
    kind: parsed.kind,
    mode: 'live',
    deskId: parsed.deskId,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    walletAddress: parsed.walletAddress,
    hash: parsed.hash as `0x${string}`,
    quote,
    slippageBps: parsed.slippageBps,
    reviewed: parsed.reviewed,
    settlement: parsed.settlement,
    isPosition: false,
  };
}

function writeEntry(storage: LiveJournalStorage, entry: LiveJournalEntry): LiveJournalEntry {
  const key = LIVE_JOURNAL_PREFIX + entry.id;
  const serialized = JSON.stringify(entry);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Live journal entry could not be verified after saving.');
  return entry;
}

export function loadLiveJournal(storage: LiveJournalStorage, deskId?: HouseDeskId): LiveJournalEntry[] {
  const result: LiveJournalEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(LIVE_JOURNAL_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const entry = parseLiveJournalEntry(raw);
      if (key !== LIVE_JOURNAL_PREFIX + entry.id) continue;
      if (deskId && entry.deskId !== deskId) continue;
      result.push(entry);
    } catch { /* skip corrupt rows; the rest of the journal still loads */ }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLiveJournalEntry(storage: LiveJournalStorage, id: string): LiveJournalEntry | null {
  const raw = storage.getItem(LIVE_JOURNAL_PREFIX + id);
  if (!raw) return null;
  try { return parseLiveJournalEntry(raw); } catch { return null; }
}

export function findLiveJournalByHash(storage: LiveJournalStorage, hash: string): LiveJournalEntry | null {
  const needle = hash.toLowerCase();
  return loadLiveJournal(storage).find(entry => entry.hash.toLowerCase() === needle) ?? null;
}

/** Entries that still need an onchain read — never resubmit these. */
export function pendingLiveJournalEntries(storage: LiveJournalStorage, deskId?: HouseDeskId): LiveJournalEntry[] {
  return loadLiveJournal(storage, deskId).filter(entry =>
    entry.kind !== 'approval'
    && (entry.settlement.status === 'submitted'
      || entry.settlement.status === 'pending'
      || entry.settlement.status === 'unknown')
  );
}

function ensureRoom(storage: LiveJournalStorage, deskId: HouseDeskId): void {
  const existing = loadLiveJournal(storage, deskId);
  if (existing.length < MAX_ENTRIES) return;
  throw new Error('Live journal is full. Export or clear entries before adding more.');
}

export function saveLiveApproval(
  storage: LiveJournalStorage,
  input: {
    hash: `0x${string}`;
    quote: QuoteEstimate;
    walletAddress: string;
    deskId?: HouseDeskId;
    now?: number;
  },
): LiveJournalEntry {
  if (!input.hash || input.hash === '0x') throw new Error('Approval hash required.');
  const deskId = input.deskId ?? OPEN_DESK_ID;
  const now = input.now ?? Date.now();
  const id = `approve:${input.hash}`;
  const existing = getLiveJournalEntry(storage, id);
  if (existing) return existing;
  ensureRoom(storage, deskId);
  const quote = parseEstimate(input.quote);
  return writeEntry(storage, {
    version: 1,
    id,
    kind: 'approval',
    mode: 'live',
    deskId,
    createdAt: now,
    updatedAt: now,
    walletAddress: input.walletAddress,
    hash: input.hash,
    quote,
    slippageBps: null,
    reviewed: reviewedFromQuote(quote),
    settlement: {
      status: 'filled',
      message: 'Router approval confirmed on Base. This is not a swap.',
    },
    isPosition: false,
  });
}

/** Persist as soon as the swap hash returns — before confirmation. */
export function saveLiveSubmission(
  storage: LiveJournalStorage,
  input: {
    hash: `0x${string}`;
    quote: QuoteEstimate;
    walletAddress: string;
    slippageBps: number;
    deskId?: HouseDeskId;
    now?: number;
  },
): LiveJournalEntry {
  if (!input.hash || input.hash === '0x') throw new Error('Submission hash required.');
  const deskId = input.deskId ?? OPEN_DESK_ID;
  const now = input.now ?? Date.now();
  const id = `swap:${input.hash}`;
  const existing = getLiveJournalEntry(storage, id);
  if (existing) return existing;
  ensureRoom(storage, deskId);
  const quote = parseEstimate(input.quote);
  return writeEntry(storage, {
    version: 1,
    id,
    kind: 'submitted-swap',
    mode: 'live',
    deskId,
    createdAt: now,
    updatedAt: now,
    walletAddress: input.walletAddress,
    hash: input.hash,
    quote,
    slippageBps: input.slippageBps,
    reviewed: reviewedFromQuote(quote),
    settlement: {
      status: 'submitted',
      message: 'Swap submitted on Base. Waiting for confirmation — nothing assumed filled.',
    },
    isPosition: false,
  });
}

/** Update settlement from a receipt read. Never changes reviewed terms. */
export function updateLiveOutcome(
  storage: LiveJournalStorage,
  hash: `0x${string}`,
  outcome: LiveOutcome,
  now = Date.now(),
): LiveJournalEntry | null {
  if (!hash || hash === '0x') return null;
  const existing = findLiveJournalByHash(storage, hash);
  if (!existing) return null;
  const settlement = settlementFromOutcome(outcome);
  const next: LiveJournalEntry = {
    ...existing,
    kind: kindForSettlement(existing.kind, settlement.status),
    updatedAt: now,
    settlement,
    isPosition: false,
  };
  return writeEntry(storage, next);
}

export function compactLiveEntry(entry: LiveJournalEntry) {
  const symbol = DESK_INSTRUMENTS.find(item => item.id === entry.quote.intent.instrumentId)?.symbol
    ?? entry.quote.outputSymbol;
  const side = entry.quote.intent.side === 'buy' ? 'buy' : 'sell';
  const label = entry.kind === 'approval'
    ? 'Approval'
    : entry.settlement.status === 'filled'
      ? `Live ${side} · filled`
      : entry.settlement.status === 'failed'
        ? `Live ${side} · failed`
        : entry.settlement.status === 'unknown'
          ? `Live ${side} · unconfirmed`
          : `Live ${side} · submitted`;
  const observed = entry.settlement.amountInObserved && entry.settlement.amountOutObserved
    ? `${entry.settlement.amountInObserved} ${entry.reviewed.inputSymbol} → ${entry.settlement.amountOutObserved} ${entry.reviewed.outputSymbol}`
    : `${entry.reviewed.inputAmount} ${entry.reviewed.inputSymbol} → ${entry.reviewed.outputAmount} ${entry.reviewed.outputSymbol} (reviewed)`;
  return {
    id: entry.id,
    symbol,
    action: label,
    exchange: observed,
    recordedAt: entry.updatedAt,
    hash: entry.hash,
    kind: entry.kind,
    status: entry.settlement.status,
    isPosition: false as const,
    mode: 'live' as const,
  };
}

export function needsReconciliation(entry: LiveJournalEntry): boolean {
  if (entry.kind === 'approval') return false;
  return entry.settlement.status === 'submitted'
    || entry.settlement.status === 'pending'
    || entry.settlement.status === 'unknown';
}
