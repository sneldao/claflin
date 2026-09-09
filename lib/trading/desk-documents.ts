import { z } from 'zod';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { DESK_INSTRUMENTS } from './catalog';
import { parseIntent, type TradeIntent } from './domain';
import type { PaperRecord } from './paper-records';
import type { DeskState } from './workflow';

export const DRAFT_STORAGE_KEY = 'claflin.draft.v1';
export const WATCH_STORAGE_KEY = 'claflin.watched.v1';

export function draftStorageKey(deskId: HouseDeskId = OPEN_DESK_ID): string {
  return deskId === OPEN_DESK_ID ? DRAFT_STORAGE_KEY : `${DRAFT_STORAGE_KEY}.${deskId}`;
}

export function watchStorageKey(deskId: HouseDeskId = OPEN_DESK_ID): string {
  return deskId === OPEN_DESK_ID ? WATCH_STORAGE_KEY : `${WATCH_STORAGE_KEY}.${deskId}`;
}

const persistedDraftSchema = z.object({
  instrumentId: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  amount: z.string().min(1),
  unit: z.enum(['USDC', 'token']),
}).strict();

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

export function persistableDraft(state: DeskState): TradeIntent | null {
  if (!isUnfinishedWork(state)) return null;
  try { return parseIntent(state.draft); } catch { return null; }
}

export function readPersistedDraft(storage: Pick<Storage, 'getItem'>, deskId: HouseDeskId = OPEN_DESK_ID): TradeIntent | null {
  try {
    const raw = storage.getItem(draftStorageKey(deskId));
    if (!raw) return null;
    return parseIntent(persistedDraftSchema.parse(JSON.parse(raw)));
  } catch { return null; }
}

export function writePersistedDraft(storage: Pick<Storage, 'setItem' | 'removeItem'>, state: DeskState, deskId: HouseDeskId = OPEN_DESK_ID): void {
  const key = draftStorageKey(deskId);
  const draft = persistableDraft(state);
  if (!draft) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(draft));
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
