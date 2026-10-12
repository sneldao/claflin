'use client';

import { useCallback, useSyncExternalStore } from 'react';

/* Semantic zoom, house-wide. The slip and the tape both have a working set
   and a folded remainder; `full` opens the folded detail by default for the
   reader who wants everything, `brief` keeps the house's default. Saved
   locally — a preference, never a record. */
export type DetailDensity = 'brief' | 'full';

export const DETAIL_DENSITY_STORAGE_KEY = 'claflin.detail-density.v1';

export function parseDetailDensity(raw: unknown): DetailDensity {
  return raw === 'full' ? 'full' : 'brief';
}

export function loadDetailDensity(storage: Storage | null): DetailDensity {
  if (!storage) return 'brief';
  try {
    return parseDetailDensity(storage.getItem(DETAIL_DENSITY_STORAGE_KEY));
  } catch {
    return 'brief';
  }
}

export function saveDetailDensity(storage: Storage | null, value: DetailDensity): void {
  if (!storage) return;
  try {
    storage.setItem(DETAIL_DENSITY_STORAGE_KEY, value);
  } catch {
    /* a preference that cannot persist is still honoured for the session */
  }
}

/* localStorage is an external store: useSyncExternalStore keeps the first
   client paint identical to SSR ('brief') and then settles the saved value
   in one pass — no effect-setState, and other tabs' toggles land too. */
const listeners = new Set<() => void>();
function emitDensityChange() {
  for (const cb of listeners) cb();
}

function storageOf(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function subscribeDensity(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DETAIL_DENSITY_STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

const getDensity = () => loadDetailDensity(storageOf());
const getServerDensity = (): DetailDensity => 'brief';

/** Brief by default; the caller's choice persists across visits on this
    device and syncs across tabs. */
export function useDetailDensity(): [DetailDensity, (next: DetailDensity) => void] {
  const density = useSyncExternalStore(subscribeDensity, getDensity, getServerDensity);
  const choose = useCallback((next: DetailDensity) => {
    saveDetailDensity(storageOf(), next);
    /* Same-tab writes raise no `storage` event — nudge subscribers ourselves. */
    emitDensityChange();
  }, []);
  return [density, choose];
}
