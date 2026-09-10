import { z } from 'zod';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { DESK_INSTRUMENTS } from './catalog';
import { parseIntent, type TradeIntent } from './domain';
import type { PaperRecord } from './paper-records';
import type { DeskState } from './workflow';

export const DRAFT_STORAGE_KEY = 'claflin.draft.v1';
export const DRAFT_META_KEY = 'claflin.draft-meta.v1';
export const WATCH_STORAGE_KEY = 'claflin.watched.v1';

export function draftStorageKey(deskId: HouseDeskId = OPEN_DESK_ID): string {
  return deskId === OPEN_DESK_ID ? DRAFT_STORAGE_KEY : `${DRAFT_STORAGE_KEY}.${deskId}`;
}

export function watchStorageKey(deskId: HouseDeskId = OPEN_DESK_ID): string {
  return deskId === OPEN_DESK_ID ? WATCH_STORAGE_KEY : `${WATCH_STORAGE_KEY}.${deskId}`;
}

/** Partial-draft checkpoint: revision counts every persisted edit so the desk
 *  can tell a newer checkpoint from a stale echo; updatedAt names the last
 *  change. Expired terms stay expired — a checkpoint never revives a quote. */
export type DraftCheckpoint = {
  revision: number;
  updatedAt: number;
  complete: boolean;
};

const draftMetaSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAt: z.number().int().positive(),
  complete: z.boolean(),
}).strict();

/** A draft worth persisting — complete, or a partial with something to resume.
 *  Incomplete drafts are retained now: returning keeps the instrument, the
 *  side, or the amount — whichever the caller had actually set. */
export function persistableDraft(state: DeskState): TradeIntent | { instrumentId: string; side: 'buy' | 'sell'; unit: 'USDC' | 'token'; amount: string } | null {
  if (state.stage === 'saved' || state.stage === 'cancelled') return null;
  if (isUnfinishedWork(state)) {
    try { return parseIntent(state.draft); } catch { return null; }
  }
  const partial = state.draft;
  if (!partial.instrumentId && !partial.amount) return null;
  if (partial.side !== 'buy' && partial.side !== 'sell') return null;
  if (partial.unit !== 'USDC' && partial.unit !== 'token') return null;
  return { instrumentId: partial.instrumentId, side: partial.side, unit: partial.unit, amount: partial.amount };
}

/** Work that can still change. A recorded instruction is finished, even if the ticket still holds its values. */
export function isUnfinishedWork(state: DeskState): boolean {
  if (state.stage === 'saved' || state.stage === 'cancelled') return false;
  return Boolean(state.draft.instrumentId && state.draft.amount);
}

export function isFiledReceipt(state: DeskState): boolean {
  return state.stage === 'saved' && Boolean(state.quote);
}

export function activeRecordId(state: DeskState, viewedRecordId: string | null): string | null {
  if (viewedRecordId) return viewedRecordId;
  return isFiledReceipt(state) ? state.quote!.id : null;
}

const partialDraftSchema = z.object({
  instrumentId: z.string().max(80),
  side: z.enum(['buy', 'sell']),
  amount: z.string().max(40),
  unit: z.enum(['USDC', 'token']),
}).strict();

/** Read any retained draft — complete or partial. Returns the draft plus its
 *  checkpoint (revision, last update, completeness) when one was stored. */
export function readDraftCheckpoint(
  storage: Pick<Storage, 'getItem'>,
  deskId: HouseDeskId = OPEN_DESK_ID,
): { draft: TradeIntent | { instrumentId: string; side: 'buy' | 'sell'; unit: 'USDC' | 'token'; amount: string }; meta: DraftCheckpoint } | null {
  try {
    const raw = storage.getItem(draftStorageKey(deskId));
    if (!raw) return null;
    const draft = partialDraftSchema.parse(JSON.parse(raw));
    if (!draft.instrumentId && !draft.amount) return null;
    const metaRaw = storage.getItem(`${DRAFT_META_KEY}.${deskId}`);
    let meta: DraftCheckpoint = { revision: 0, updatedAt: 0, complete: false };
    try {
      if (metaRaw) meta = draftMetaSchema.parse(JSON.parse(metaRaw));
    } catch { /* meta is advisory — the draft stands without it */ }
    if (meta.updatedAt === 0) {
      let complete = false;
      try { parseIntent(draft); complete = true; } catch { /* partial stays partial */ }
      meta = { ...meta, complete };
    }
    return { draft, meta };
  } catch { return null; }
}

export function readPersistedDraft(storage: Pick<Storage, 'getItem'>, deskId: HouseDeskId = OPEN_DESK_ID): TradeIntent | null {
  const checkpoint = readDraftCheckpoint(storage, deskId);
  if (!checkpoint) return null;
  try { return parseIntent(checkpoint.draft); } catch { return null; }
}

/** Resume any retained draft — complete or partial — onto the ticket.
 *  Unlike readPersistedDraft, incomplete work is restored as-is. */
export function readRestorableDraft(storage: Pick<Storage, 'getItem'>, deskId: HouseDeskId = OPEN_DESK_ID): TradeIntent | null {
  const checkpoint = readDraftCheckpoint(storage, deskId);
  if (!checkpoint) return null;
  return {
    instrumentId: checkpoint.draft.instrumentId,
    side: checkpoint.draft.side,
    amount: checkpoint.draft.amount,
    unit: checkpoint.draft.unit,
  } as TradeIntent;
}

/** Persist a checkpoint: the draft (complete or partial) plus revision and
 *  last-updated metadata. Finished work clears both keys. */
export function writeDraftCheckpoint(
  storage: Pick<Storage, 'setItem' | 'removeItem' | 'getItem'>,
  state: DeskState,
  deskId: HouseDeskId = OPEN_DESK_ID,
  now: number = Date.now(),
): void {
  const key = draftStorageKey(deskId);
  const metaKey = `${DRAFT_META_KEY}.${deskId}`;
  const draft = persistableDraft(state);
  if (!draft) {
    storage.removeItem(key);
    storage.removeItem(metaKey);
    return;
  }
  let revision = 0;
  try {
    const existing = storage.getItem(metaKey);
    if (existing) revision = draftMetaSchema.parse(JSON.parse(existing)).revision;
  } catch { /* start a fresh revision count */ }
  let complete = false;
  try { parseIntent(draft); complete = true; } catch { /* partial stays partial */ }
  storage.setItem(key, JSON.stringify(draft));
  storage.setItem(metaKey, JSON.stringify({ revision: revision + 1, updatedAt: now, complete } satisfies DraftCheckpoint));
}

export function writePersistedDraft(
  storage: Pick<Storage, 'setItem' | 'removeItem' | 'getItem'>,
  state: DeskState,
  deskId: HouseDeskId = OPEN_DESK_ID,
  now: number = Date.now(),
): void {
  writeDraftCheckpoint(storage, state, deskId, now);
}

export function compactPaperEntry(record: PaperRecord) {
  const symbol = DESK_INSTRUMENTS.find(item => item.id === record.quote.intent.instrumentId)?.symbol
    ?? record.quote.outputSymbol;
  const side = record.quote.intent.side === 'buy' ? 'buy' : 'sell';
  return {
    id: record.id,
    symbol,
    action: `Paper ${side}` as const,
    exchange: `${record.quote.inputAmount} ${record.quote.inputSymbol} → ${record.quote.outputAmount} ${record.quote.outputSymbol}`,
    recordedAt: record.createdAt,
  };
}

export function formatRecordedTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function startOfLocalDay(ms: number): number {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function recordedDayLabel(ms: number, now = Date.now()): string {
  const day = startOfLocalDay(ms);
  const today = startOfLocalDay(now);
  const diff = today - day;
  if (diff === 0) return 'Today';
  if (diff === 86_400_000) return 'Yesterday';
  return new Date(ms).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: new Date(ms).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  });
}

export function formatRecordedWhen(ms: number, now = Date.now()): string {
  return `${recordedDayLabel(ms, now)} · ${formatRecordedTime(ms)}`;
}

export function groupRecordsByDay(records: PaperRecord[], now = Date.now()): { label: string; records: PaperRecord[] }[] {
  const groups: { label: string; records: PaperRecord[] }[] = [];
  for (const record of records) {
    const label = recordedDayLabel(record.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.records.push(record);
    else groups.push({ label, records: [record] });
  }
  return groups;
}

/** Newest records for the compact tray. Older dated history lives in the archive. */
export const LEDGER_PREVIEW_LIMIT = 5;

export function ledgerPreview(records: PaperRecord[], focusedId: string | null = null, limit = LEDGER_PREVIEW_LIMIT): PaperRecord[] {
  const head = records.slice(0, limit);
  if (!focusedId || head.some(record => record.id === focusedId)) return head;
  const focused = records.find(record => record.id === focusedId);
  if (!focused) return head;
  return [...head.slice(0, Math.max(0, limit - 1)), focused];
}

export type ForegroundKind = 'draft' | 'pending' | 'quotation' | 'receipt' | 'archive' | 'missing';

export type ForegroundDocument = {
  kind: ForegroundKind;
  quoteId: string | null;
  recordId: string | null;
  instrumentId: string | null;
  actionable: boolean;
  readonly: boolean;
};

/** Looking at a filed record that is not the instruction currently in hand. */
export function browsingArchive(state: DeskState, viewedRecordId: string | null): boolean {
  return Boolean(viewedRecordId) && !(state.stage === 'saved' && state.quote?.id === viewedRecordId);
}

function documentInstrument(state: DeskState, record: PaperRecord | undefined): string | null {
  return record?.quote.intent.instrumentId
    ?? state.quote?.intent.instrumentId
    ?? (state.draft.instrumentId || null);
}

/** The one document the ticket, voice tools, and receiver must agree on. */
export function foregroundDocument(state: DeskState, viewedRecordId: string | null, records?: PaperRecord[]): ForegroundDocument {
  const viewed = viewedRecordId ? records?.find(record => record.id === viewedRecordId) : undefined;
  const missing = Boolean(viewedRecordId) && records !== undefined && !viewed;
  if (missing) {
    return { kind: 'missing', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
  }
  if (browsingArchive(state, viewedRecordId)) {
    return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: documentInstrument(state, viewed), actionable: false, readonly: true };
  }
  if (state.stage === 'loading') {
    return { kind: 'pending', quoteId: null, recordId: null, instrumentId: documentInstrument(state, undefined), actionable: false, readonly: false };
  }
  if (state.stage === 'review' && state.quote) {
    return { kind: 'quotation', quoteId: state.quote.id, recordId: null, instrumentId: state.quote.intent.instrumentId, actionable: true, readonly: false };
  }
  if (state.stage === 'saved' && state.quote) {
    return { kind: 'receipt', quoteId: state.quote.id, recordId: state.quote.id, instrumentId: state.quote.intent.instrumentId, actionable: false, readonly: true };
  }
  return { kind: 'draft', quoteId: null, recordId: null, instrumentId: documentInstrument(state, undefined), actionable: true, readonly: false };
}

export function instructionLocked(state: DeskState, viewedRecordId: string | null, records?: PaperRecord[]): boolean {
  const kind = foregroundDocument(state, viewedRecordId, records).kind;
  return kind === 'archive' || kind === 'missing';
}

export function instructionLockMessage(state: DeskState, viewedRecordId: string | null, records?: PaperRecord[]): string {
  return foregroundDocument(state, viewedRecordId, records).kind === 'missing' ? RECORD_UNAVAILABLE : ARCHIVE_READONLY;
}

export const ARCHIVE_READONLY = 'This filed record is for reading. Return to the instruction to quote or record.';
export const RECORD_UNAVAILABLE = 'That paper record is no longer in this browser. Return to the instruction.';

export function canFileForeground(state: DeskState, viewedRecordId: string | null, records?: PaperRecord[]): boolean {
  const foreground = foregroundDocument(state, viewedRecordId, records);
  return foreground.kind === 'quotation' && foreground.quoteId === state.quote?.id && state.stage === 'review';
}

export function speakForeground(state: DeskState, viewedRecordId: string | null, records: PaperRecord[]): string {
  const foreground = foregroundDocument(state, viewedRecordId, records);
  if (foreground.kind === 'missing') return RECORD_UNAVAILABLE;
  if (foreground.kind === 'archive') {
    const record = records.find(item => item.id === foreground.recordId);
    if (!record) return RECORD_UNAVAILABLE;
    const quote = record.quote;
    return `The ticket is showing a filed paper record, read-only: ${quote.intent.side} ${quote.inputAmount} ${quote.inputSymbol} for ${quote.outputAmount} ${quote.outputSymbol}. It is not the live instruction. Return to the instruction to quote or record.`;
  }
  if (foreground.kind === 'receipt' && state.quote) {
    const quote = state.quote;
    return `The current instruction is filed: ${quote.intent.side} ${quote.inputAmount} ${quote.inputSymbol} for ${quote.outputAmount} ${quote.outputSymbol}.`;
  }
  const draft = state.draft;
  const parts: string[] = [];
  parts.push(draft.instrumentId ? `Instrument: ${DESK_INSTRUMENTS.find(item => item.id === draft.instrumentId)?.symbol ?? 'set'}.` : 'No instrument chosen.');
  parts.push(draft.amount ? `${draft.side} ${draft.amount} ${draft.unit}.` : 'No amount set.');
  if (foreground.kind === 'quotation' && state.quote) {
    const quote = state.quote;
    parts.push(`Estimate under review: spend ${quote.inputAmount} ${quote.inputSymbol}, receive ${quote.outputAmount} ${quote.outputSymbol}.`);
  }
  if (state.stage === 'cancelled') parts.push('The client decided not to record. Nothing was filed.');
  if (foreground.kind === 'pending') parts.push('A venue estimate is on its way.');
  return parts.join(' ');
}
