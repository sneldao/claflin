import { z } from 'zod';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { canFileOnDesk } from './desk-mandate';
import { estimateUsable, parseEstimate, sameIntent, type DeskState } from './workflow';
import type { QuoteEstimate } from './domain';

export interface PaperRecord {
  version: 1;
  id: string;
  mode: 'paper';
  deskId: HouseDeskId;
  createdAt: number;
  quote: QuoteEstimate;
}
export interface PaperStorage {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const PREFIX = 'claflin.paper.v1.';
/** Paper history is bounded; sync may not exceed what the desk can read. */
const MAX_HISTORY = 100;
const schema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  mode: z.literal('paper'),
  deskId: z.enum(['hetty', 'jesse', 'isabel', 'arbitrum']).optional(),
  createdAt: z.number().int().positive(),
  quote: z.unknown(),
}).strict();

function parseRecord(raw: unknown): PaperRecord {
  /* Accepts an unknown payload (account sync, storage read) and applies the
     same full validation either way. Oversized or non-serializable input throws. */
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text.length > 20000) throw new Error('Invalid paper record.');
  const parsed = schema.parse(JSON.parse(text));
  const quote = parseEstimate(parsed.quote);
  if (parsed.id !== quote.id || !estimateUsable(quote, parsed.createdAt)) throw new Error('Invalid paper record.');
  return { version: parsed.version, id: parsed.id, mode: parsed.mode, deskId: parsed.deskId ?? OPEN_DESK_ID, createdAt: parsed.createdAt, quote };
}

export function loadPaperRecords(storage: PaperStorage, deskId?: HouseDeskId): PaperRecord[] {
  const result: PaperRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) throw new Error('Paper record unavailable.');
    const record = parseRecord(raw);
    if (key !== PREFIX + record.id) throw new Error('Paper record identity mismatch.');
    if (deskId && record.deskId !== deskId) continue;
    result.push(record);
    if (result.length > MAX_HISTORY) throw new Error('Paper history exceeds the supported limit.');
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function deletePaperRecord(storage: PaperStorage & { removeItem(key: string): void }, id: string): void {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid record ID.');
  storage.removeItem(PREFIX + id);
  if (storage.getItem(PREFIX + id) !== null) throw new Error('Could not delete the paper record.');
}

/**
 * Merge account-pulled records into browser storage. Local records stay
 * authoritative: local wins on id collision, and the history cap holds.
 * Each candidate is validated exactly like a locally saved record — a
 * malformed server row is skipped, never written, so one poisoned payload
 * cannot make the desk's history unreadable. Returns how many records were
 * actually added; 0 means storage is already up to date.
 */
export function mergePulledRecords(storage: PaperStorage, records: readonly unknown[], deskId: HouseDeskId): number {
  const existingIds = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) existingIds.add(key.slice(PREFIX.length));
  }
  const room = Math.max(0, MAX_HISTORY - existingIds.size);
  if (room === 0) return 0;
  let added = 0;
  for (const candidate of records) {
    if (added >= room) break;
    try {
      const record = parseRecord(candidate);
      if (existingIds.has(record.id)) continue;
      const serialized = JSON.stringify(record);
      storage.setItem(PREFIX + record.id, serialized);
      if (storage.getItem(PREFIX + record.id) !== serialized) throw new Error('Paper record could not be verified after saving.');
      existingIds.add(record.id);
      added += 1;
    } catch { /* skip invalid or unwritable candidates; the rest of the pull still merges */ }
  }
  return added;
}

export function savePaperRecord(storage: PaperStorage, state: DeskState, now: number, deskId: HouseDeskId = OPEN_DESK_ID): PaperRecord {
  if (state.stage !== 'review' || !state.quote || !sameIntent(state.draft, state.quote.intent) || !estimateUsable(state.quote, now) || !canFileOnDesk(state, deskId)) {
    throw new Error('Request and review a fresh estimate before recording.');
  }
  const quote = parseEstimate(state.quote);
  const key = PREFIX + quote.id;
  const existing = storage.getItem(key);
  if (existing) {
    const record = parseRecord(existing);
    if (record.deskId !== deskId) throw new Error('Paper record identity conflict.');
    if (JSON.stringify(record.quote) !== JSON.stringify(quote)) throw new Error('Paper record identity conflict.');
    return record;
  }
  if (loadPaperRecords(storage, deskId).length >= MAX_HISTORY) throw new Error('Paper history is full. Export or clear records before adding more.');
  const record: PaperRecord = { version: 1, mode: 'paper', deskId, id: quote.id, createdAt: now, quote };
  const serialized = JSON.stringify(record);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('Paper record could not be verified after saving.');
  return record;
}
