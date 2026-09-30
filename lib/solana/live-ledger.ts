'use client';

/**
 * Durable live order ledger — browser-local, per wallet, no account needed.
 * The record is written the moment a signature exists (derived from the
 * signed transaction bytes, before execute returns), so a reload never
 * loses the on-chain pointer. Reconciliation reads the chain itself — the
 * short-lived proposal store is an execution binding, not the record.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { fetchJson } from '../api-client';
import type { SignatureStatus } from './tx-status';

const KEY = 'claflin.jesse.live-ledger.v1';
const MAX_PER_WALLET = 20;

export type LiveOrderStatus = 'submitted' | 'confirmed' | 'failed' | 'unknown';

export interface LiveOrderRecord {
  proposalId: string;
  wallet: string;
  signature: string | null;
  instrumentId: string;
  side: 'buy' | 'sell';
  amount: string;
  unit: string;
  submittedAt: number;
  status: LiveOrderStatus;
  lastCheckedAt: number | null;
}

function isStatus(value: unknown): value is LiveOrderStatus {
  return value === 'submitted' || value === 'confirmed' || value === 'failed' || value === 'unknown';
}

function parseRecord(value: unknown): LiveOrderRecord | null {
  const r = value as LiveOrderRecord | null;
  if (!r || typeof r !== 'object') return null;
  if (typeof r.proposalId !== 'string' || typeof r.wallet !== 'string') return null;
  if (r.signature !== null && typeof r.signature !== 'string') return null;
  if (typeof r.instrumentId !== 'string' || (r.side !== 'buy' && r.side !== 'sell')) return null;
  if (typeof r.amount !== 'string' || typeof r.unit !== 'string') return null;
  if (typeof r.submittedAt !== 'number' || !isStatus(r.status)) return null;
  return { ...r, lastCheckedAt: typeof r.lastCheckedAt === 'number' ? r.lastCheckedAt : null };
}

function readAll(storage: Pick<Storage, 'getItem'> | null): LiveOrderRecord[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(parseRecord).filter((r): r is LiveOrderRecord => r !== null) : [];
  } catch {
    return [];
  }
}

export function loadOrders(storage: Pick<Storage, 'getItem'> | null, wallet: string): LiveOrderRecord[] {
  return readAll(storage).filter(r => r.wallet === wallet);
}

export function upsertOrder(storage: Pick<Storage, 'getItem' | 'setItem'> | null, order: LiveOrderRecord): void {
  if (!storage) return;
  const rest = readAll(storage).filter(r => !(r.wallet === order.wallet && r.proposalId === order.proposalId));
  const own = [order, ...rest.filter(r => r.wallet === order.wallet)].slice(0, MAX_PER_WALLET);
  const others = rest.filter(r => r.wallet !== order.wallet);
  try {
    storage.setItem(KEY, JSON.stringify([...own, ...others]));
  } catch {
    /* storage full or private mode — the record stays in memory via emit */
  }
}

function storageAvailable(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

let listeners: Array<() => void> = [];
function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.push(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners = listeners.filter(l => l !== listener);
    window.removeEventListener('storage', onStorage);
  };
}

function chainToOrderStatus(status: SignatureStatus, current: LiveOrderStatus): LiveOrderStatus {
  if (status === 'confirmed' || status === 'finalized') return 'confirmed';
  if (status === 'failed') return 'failed';
  if (status === 'notFound') return 'unknown';
  return current;
}

export interface LiveLedger {
  records: LiveOrderRecord[];
  reconciling: boolean;
  /** Persist a record — call the moment a signature exists. */
  record: (order: LiveOrderRecord) => void;
  /** Patch one record's status/signature by proposal id. */
  update: (proposalId: string, patch: Partial<Pick<LiveOrderRecord, 'status' | 'signature' | 'lastCheckedAt'>>) => void;
  /** Ask the chain about every unresolved record. */
  reconcile: () => Promise<void>;
}

export function useLiveLedger(wallet: string | null): LiveLedger {
  const raw = useSyncExternalStore(
    subscribe,
    () => storageAvailable()?.getItem(KEY) ?? null,
    () => null,
  );
  const [reconciling, setReconciling] = useState(false);
  const gen = useRef(0);

  const all = (() => {
    if (!raw) return [] as LiveOrderRecord[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(parseRecord).filter((r): r is LiveOrderRecord => r !== null) : [];
    } catch {
      return [] as LiveOrderRecord[];
    }
  })();
  const records = wallet ? all.filter(r => r.wallet === wallet) : [];

  const record = useCallback((order: LiveOrderRecord) => {
    upsertOrder(storageAvailable(), order);
    emit();
  }, []);

  const update = useCallback((proposalId: string, patch: Partial<Pick<LiveOrderRecord, 'status' | 'signature' | 'lastCheckedAt'>>) => {
    const storage = storageAvailable();
    if (!storage) return;
    const existing = readAll(storage).find(r => r.proposalId === proposalId);
    if (!existing) return;
    upsertOrder(storage, { ...existing, ...patch });
    emit();
  }, []);

  const reconcile = useCallback(async () => {
    if (!wallet) return;
    const pending = readAll(storageAvailable()).filter(
      r => r.wallet === wallet && r.signature && (r.status === 'submitted' || r.status === 'unknown'),
    );
    if (pending.length === 0) return;
    const my = ++gen.current;
    setReconciling(true);
    const params = new URLSearchParams();
    for (const r of pending) params.append('signature', r.signature!);
    const res = await fetchJson<{ checks?: { signature: string; status: SignatureStatus }[]; ok?: boolean }>(
      `/api/desk/jesse/live/reconcile?${params.toString()}`,
    );
    if (gen.current !== my) return;
    setReconciling(false);
    if (!res.ok || !Array.isArray(res.data.checks)) return;
    const now = Date.now();
    const bySignature = new Map(res.data.checks.map(c => [c.signature, c.status]));
    for (const r of pending) {
      const chain = r.signature ? bySignature.get(r.signature) : undefined;
      if (!chain) continue;
      const next = chainToOrderStatus(chain, r.status);
      const storage = storageAvailable();
      const current = storage ? readAll(storage).find(x => x.proposalId === r.proposalId) : r;
      if (storage && current) {
        upsertOrder(storage, { ...current, status: next, lastCheckedAt: now });
      }
    }
    emit();
  }, [wallet]);

  return { records, reconciling, record, update, reconcile };
}
