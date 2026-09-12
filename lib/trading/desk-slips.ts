/**
 * Desk slips — commemorative provenance of an instruction or Base fill.
 *
 * Not a security. Not the tokenized stock. Not a wallet holding.
 * See docs/DESK_SLIPS.md.
 */

import { z } from 'zod';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { DESK_INSTRUMENTS } from './catalog';
import type { PaperRecord } from './paper-records';
import type { LiveJournalEntry } from './live-journal';

export const DESK_SLIP_PREFIX = 'claflin.slip.v1.';
export const DESK_SLIP_DISCLAIMER =
  'Commemorative desk slip. Not a security. Not the tokenized stock. Not a wallet holding.' as const;

export type DeskSlipKind = 'first-paper' | 'first-live';

export type DeskSlipDedication = {
  role: 'user' | 'agent';
  text: string;
};

export type DeskSlip = {
  version: 1;
  id: string;
  kind: DeskSlipKind;
  deskId: HouseDeskId;
  mintedAt: number;
  symbol: string;
  instrumentId: string;
  side: 'buy' | 'sell';
  instruction: string;
  mode: 'paper' | 'live';
  evidenceId: string;
  txHash?: string;
  provenanceHash?: string;
  dedication?: DeskSlipDedication;
  disclaimer: typeof DESK_SLIP_DISCLAIMER;
};

const slipSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(120),
  kind: z.enum(['first-paper', 'first-live']),
  deskId: z.enum(['hetty', 'jesse', 'isabel', 'arbitrum']),
  mintedAt: z.number().int().positive(),
  symbol: z.string().min(1).max(40),
  instrumentId: z.string().min(1).max(120),
  side: z.enum(['buy', 'sell']),
  instruction: z.string().min(1).max(400),
  mode: z.enum(['paper', 'live']),
  evidenceId: z.string().min(1).max(120),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  provenanceHash: z.string().optional(),
  dedication: z.object({
    role: z.enum(['user', 'agent']),
    text: z.string().min(1).max(280),
  }).optional(),
  disclaimer: z.literal(DESK_SLIP_DISCLAIMER),
}).strict();

export type SlipStorage = {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Session dedication — last spoken line eligible for a slip, never invented. */
let pendingDedication: DeskSlipDedication | null = null;

export function rememberSlipDedication(role: 'user' | 'agent', text: string): void {
  const clipped = text.trim().slice(0, 280);
  if (!clipped) return;
  pendingDedication = { role, text: clipped };
}

export function takeSlipDedication(): DeskSlipDedication | null {
  const next = pendingDedication;
  pendingDedication = null;
  return next;
}

export function peekSlipDedication(): DeskSlipDedication | null {
  return pendingDedication;
}

function parseSlip(raw: unknown): DeskSlip {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 8000) throw new Error('Invalid desk slip.');
  return slipSchema.parse(JSON.parse(text));
}

export function loadDeskSlips(storage: SlipStorage, deskId: HouseDeskId = OPEN_DESK_ID): DeskSlip[] {
  const result: DeskSlip[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(DESK_SLIP_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const slip = parseSlip(raw);
      if (slip.deskId !== deskId) continue;
      result.push(slip);
    } catch { /* skip corrupt keepsakes */ }
  }
  return result.sort((a, b) => b.mintedAt - a.mintedAt);
}

export function findDeskSlipByKind(
  storage: SlipStorage,
  kind: DeskSlipKind,
  deskId: HouseDeskId = OPEN_DESK_ID,
): DeskSlip | null {
  return loadDeskSlips(storage, deskId).find(slip => slip.kind === kind) ?? null;
}

function symbolFor(instrumentId: string, fallback: string): string {
  return DESK_INSTRUMENTS.find(item => item.id === instrumentId)?.symbol ?? fallback;
}

function writeSlip(storage: SlipStorage, slip: DeskSlip): DeskSlip {
  const key = DESK_SLIP_PREFIX + slip.id;
  const serialized = JSON.stringify(slip);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Desk slip could not be verified after saving.');
  return slip;
}

/** Idempotent: one first-paper slip per desk. */
export function mintFirstPaperSlip(
  storage: SlipStorage,
  record: PaperRecord,
  now = Date.now(),
  dedication: DeskSlipDedication | null = takeSlipDedication(),
): DeskSlip {
  const existing = findDeskSlipByKind(storage, 'first-paper', record.deskId);
  if (existing) return existing;
  const quote = record.quote;
  const symbol = symbolFor(quote.intent.instrumentId, quote.outputSymbol);
  const slip: DeskSlip = {
    version: 1,
    id: `first-paper-${record.deskId}`,
    kind: 'first-paper',
    deskId: record.deskId,
    mintedAt: now,
    symbol,
    instrumentId: quote.intent.instrumentId,
    side: quote.intent.side,
    instruction: `Paper ${quote.intent.side} · ${quote.inputAmount} ${quote.inputSymbol} → ${quote.outputAmount} ${quote.outputSymbol}`,
    mode: 'paper',
    evidenceId: record.id,
    ...(dedication ? { dedication } : {}),
    disclaimer: DESK_SLIP_DISCLAIMER,
  };
  return writeSlip(storage, slip);
}

/** Idempotent: one first-live slip per desk, only for confirmed fills. */
export function mintFirstLiveSlip(
  storage: SlipStorage,
  entry: LiveJournalEntry,
  now = Date.now(),
  dedication: DeskSlipDedication | null = takeSlipDedication(),
): DeskSlip | null {
  if (entry.settlement.status !== 'filled' || entry.kind === 'approval') return null;
  const existing = findDeskSlipByKind(storage, 'first-live', entry.deskId);
  if (existing) return existing;
  const quote = entry.quote;
  const symbol = symbolFor(quote.intent.instrumentId, quote.outputSymbol);
  const slip: DeskSlip = {
    version: 1,
    id: `first-live-${entry.deskId}`,
    kind: 'first-live',
    deskId: entry.deskId,
    mintedAt: now,
    symbol,
    instrumentId: quote.intent.instrumentId,
    side: quote.intent.side,
    instruction: `Live ${quote.intent.side} · ${entry.reviewed.inputAmount} ${entry.reviewed.inputSymbol} → ${entry.reviewed.outputAmount} ${entry.reviewed.outputSymbol}`,
    mode: 'live',
    evidenceId: entry.hash,
    txHash: entry.hash,
    ...(dedication ? { dedication } : {}),
    disclaimer: DESK_SLIP_DISCLAIMER,
  };
  return writeSlip(storage, slip);
}

/** Metadata object suitable for a future onchain token URI. */
export function deskSlipTokenMetadata(slip: DeskSlip): Record<string, unknown> {
  return {
    name: slip.kind === 'first-paper'
      ? `Claflin desk slip · first paper · ${slip.symbol}`
      : `Claflin desk slip · first live · ${slip.symbol}`,
    description: `${slip.disclaimer} ${slip.instruction}`,
    attributes: [
      { trait_type: 'kind', value: slip.kind },
      { trait_type: 'desk', value: slip.deskId },
      { trait_type: 'mode', value: slip.mode },
      { trait_type: 'symbol', value: slip.symbol },
      { trait_type: 'side', value: slip.side },
      ...(slip.txHash ? [{ trait_type: 'base_tx', value: slip.txHash }] : []),
    ],
    claflin: {
      version: 1,
      slipId: slip.id,
      evidenceId: slip.evidenceId,
      mintedAt: slip.mintedAt,
      dedication: slip.dedication ?? null,
      disclaimer: slip.disclaimer,
      isEquity: false,
      isPosition: false,
    },
  };
}
