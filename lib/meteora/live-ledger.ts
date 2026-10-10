'use client';

/**
 * Durable live launch ledger — browser-local, per wallet, no account needed.
 * The record is written the moment a signature exists (derived from the
 * signed transaction bytes, before submit returns), so a reload never
 * loses the on-chain pointer. Reconciliation reads the chain itself — the
 * short-lived proposal store is an execution binding, not the record.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { fetchJson } from '../api-client';
import type { SignatureStatus } from '../solana/tx-status';

const KEY = 'claflin.halley.live-ledger.v1';
const MAX_PER_WALLET = 20;

export type HalleyLaunchStatus = 'submitted' | 'confirmed' | 'failed' | 'partial' | 'unknown';

export interface HalleyLaunchRecord {
  proposalId: string;
  wallet: string;
  /** Pool transaction signature — null until broadcast. */
  signature: string | null;
  /** Config transaction signature — the first of the two launch txs. */
  configSignature: string | null;
  symbol: string;
  quoteSymbol: string;
  baseMint: string;
  pool: string;
  submittedAt: number;
  status: HalleyLaunchStatus;
  lastCheckedAt: number | null;
}

function isStatus(value: unknown): value is HalleyLaunchStatus {
  return value === 'submitted' || value === 'confirmed' || value === 'failed' || value === 'partial' || value === 'unknown';
}

function parseRecord(value: unknown): HalleyLaunchRecord | null {
  const r = value as HalleyLaunchRecord | null;
  if (!r || typeof r !== 'object') return null;
  if (typeof r.proposalId !== 'string' || typeof r.wallet !== 'string') return null;
  if (r.signature !== null && typeof r.signature !== 'string') return null;
  if (r.configSignature !== null && r.configSignature !== undefined && typeof r.configSignature !== 'string') return null;
  if (typeof r.symbol !== 'string' || typeof r.quoteSymbol !== 'string') return null;
  if (typeof r.baseMint !== 'string' || typeof r.pool !== 'string') return null;
  if (typeof r.submittedAt !== 'number' || !isStatus(r.status)) return null;
  return {
    ...r,
    configSignature: typeof r.configSignature === 'string' ? r.configSignature : null,
    lastCheckedAt: typeof r.lastCheckedAt === 'number' ? r.lastCheckedAt : null,
  };
}

function readAll(storage: Pick<Storage, 'getItem'> | null): HalleyLaunchRecord[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(parseRecord).filter((r): r is HalleyLaunchRecord => r !== null) : [];
  } catch {
    return [];
  }
}

export function loadLaunches(storage: Pick<Storage, 'getItem'> | null, wallet: string): HalleyLaunchRecord[] {
  return readAll(storage).filter(r => r.wallet === wallet);
}

export function upsertLaunch(storage: Pick<Storage, 'getItem' | 'setItem'> | null, record: HalleyLaunchRecord): void {
  if (!storage) return;
  const rest = readAll(storage).filter(r => !(r.wallet === record.wallet && r.proposalId === record.proposalId));
  const own = [record, ...rest.filter(r => r.wallet === record.wallet)].slice(0, MAX_PER_WALLET);
  const others = rest.filter(r => r.wallet !== record.wallet);
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

/** Reconcile both signatures: the pool tx is the launch's final evidence;
 *  a landed config with no pool is 'partial', a dead config is 'failed'. */
export function launchesFromChainStatuses(
  configStatus: SignatureStatus | undefined,
  poolStatus: SignatureStatus | undefined,
  current: HalleyLaunchStatus,
): HalleyLaunchStatus {
  if (poolStatus === 'confirmed' || poolStatus === 'finalized') return 'confirmed';
  if (poolStatus === 'failed') return 'failed';
  if (configStatus === 'confirmed' || configStatus === 'finalized') {
    return poolStatus === 'notFound' || poolStatus === undefined ? 'partial' : current;
  }
  if (configStatus === 'failed') return 'failed';
  if (configStatus === 'notFound' && (poolStatus === 'notFound' || poolStatus === undefined)) return 'unknown';
  return current;
}

export interface HalleyLaunchLedger {
  records: HalleyLaunchRecord[];
  reconciling: boolean;
  /** Persist a record — call the moment a signature exists. */
  record: (launch: HalleyLaunchRecord) => void;
  /** Patch one record's status/signature by proposal id. */
  update: (proposalId: string, patch: Partial<Pick<HalleyLaunchRecord, 'status' | 'signature' | 'configSignature' | 'lastCheckedAt'>>) => void;
  /** Ask the chain about every unresolved record. */
  reconcile: () => Promise<void>;
}

export function useHalleyLaunchLedger(wallet: string | null): HalleyLaunchLedger {
  const raw = useSyncExternalStore(
    subscribe,
    () => storageAvailable()?.getItem(KEY) ?? null,
    () => null,
  );
  const [reconciling, setReconciling] = useState(false);
  const gen = useRef(0);

  const all = (() => {
    if (!raw) return [] as HalleyLaunchRecord[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(parseRecord).filter((r): r is HalleyLaunchRecord => r !== null) : [];
    } catch {
      return [] as HalleyLaunchRecord[];
    }
  })();
  const records = wallet ? all.filter(r => r.wallet === wallet) : [];

  const record = useCallback((launch: HalleyLaunchRecord) => {
    upsertLaunch(storageAvailable(), launch);
    emit();
  }, []);

  const update = useCallback((proposalId: string, patch: Partial<Pick<HalleyLaunchRecord, 'status' | 'signature' | 'lastCheckedAt'>>) => {
    const storage = storageAvailable();
    if (!storage) return;
    const existing = readAll(storage).find(r => r.proposalId === proposalId);
    if (!existing) return;
    upsertLaunch(storage, { ...existing, ...patch });
    emit();
  }, []);

  const reconcile = useCallback(async () => {
    if (!wallet) return;
    const pending = readAll(storageAvailable()).filter(
      r => r.wallet === wallet
        && (r.signature || r.configSignature)
        && (r.status === 'submitted' || r.status === 'unknown' || r.status === 'partial'),
    );
    if (pending.length === 0) return;
    const my = ++gen.current;
    setReconciling(true);
    const params = new URLSearchParams();
    for (const r of pending) {
      if (r.configSignature) params.append('signature', r.configSignature);
      if (r.signature) params.append('signature', r.signature);
    }
    const res = await fetchJson<{ checks?: { signature: string; status: SignatureStatus }[]; ok?: boolean }>(
      `/api/desk/halley/live/reconcile?${params.toString()}`,
    );
    if (gen.current !== my) return;
    setReconciling(false);
    if (!res.ok || !Array.isArray(res.data.checks)) return;
    const now = Date.now();
    const bySignature = new Map(res.data.checks.map(c => [c.signature, c.status]));
    for (const r of pending) {
      const configStatus = r.configSignature ? bySignature.get(r.configSignature) : undefined;
      const poolStatus = r.signature ? bySignature.get(r.signature) : undefined;
      if (!configStatus && !poolStatus) continue;
      const next = launchesFromChainStatuses(configStatus, poolStatus, r.status);
      const storage = storageAvailable();
      const current = storage ? readAll(storage).find(x => x.proposalId === r.proposalId) : r;
      if (storage && current) {
        upsertLaunch(storage, { ...current, status: next, lastCheckedAt: now });
      }
    }
    emit();
  }, [wallet]);

  return { records, reconciling, record, update, reconcile };
}
