'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import {
  mergePulledRecords,
  paperOwnerOf,
  PAPER_OWNER_ANONYMOUS,
  retagPaperOwner,
  type PaperRecord,
} from './paper-records';
import type { useTradingDesk } from './useTradingDesk';

/** Per-account claim of record ids this browser has attributed to an account:
 *  records it pulled down, or records created while signed in. Local records
 *  that existed before a sign-in are anonymous work and are NEVER uploaded
 *  silently — importing them takes an explicit choice. */
const claimKeyFor = (userId: string) => `claflin.sync-claims.${userId}`;

function readClaims(userId: string, storage: Storage): Set<string> {
  try {
    const raw = storage.getItem(claimKeyFor(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((id): id is string => typeof id === 'string'));
  } catch { return new Set(); }
}

function writeClaims(userId: string, storage: Storage, ids: Set<string>): void {
  try { storage.setItem(claimKeyFor(userId), JSON.stringify([...ids])); } catch { /* claims are advisory */ }
}

export type ImportStatus = 'idle' | 'pending' | 'done' | 'failed';

function isAnonymousRecord(record: PaperRecord): boolean {
  return paperOwnerOf(record) === PAPER_OWNER_ANONYMOUS;
}

/**
 * Account-bound paper-record sync. Ownership is stamped on each record
 * (`userId` | `anonymous`). Claims remain a sync aid; anonymous browser work
 * is never uploaded without an explicit import.
 */
export function usePaperSync(desk: ReturnType<typeof useTradingDesk>) {
  const { authenticated, getAccessToken, userId } = useDeskAuth();
  const { deskId, historyReady, records } = desk;
  const pulled = useRef(false);
  const suppressNextPush = useRef(false);
  const lastPushedIds = useRef<string | null>(null);
  const lastUserId = useRef<string | null>(null);
  const claimsRef = useRef<Set<string>>(new Set());
  /** Snapshot runs once per account after history is ready — not on auth alone. */
  const snapshotDoneFor = useRef<string | null>(null);
  const [anonymousCount, setAnonymousCount] = useState(0);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [pushKick, setPushKick] = useState(0);

  useEffect(() => {
    if (lastUserId.current === userId) return;
    pulled.current = false;
    lastPushedIds.current = null;
    suppressNextPush.current = false;
    claimsRef.current = new Set();
    snapshotDoneFor.current = null;
    setImportStatus('idle');
    setAnonymousCount(0);
    lastUserId.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId || !authenticated) {
      setAnonymousCount(0);
      return;
    }
    if (!historyReady) return;
    if (snapshotDoneFor.current !== userId) {
      claimsRef.current = readClaims(userId, window.localStorage);
      snapshotDoneFor.current = userId;
    }
    setAnonymousCount(records.filter(r => isAnonymousRecord(r) && !claimsRef.current.has(r.id)).length);
  }, [authenticated, userId, historyReady, records]);

  useEffect(() => {
    if (!authenticated || !userId || !historyReady || pulled.current) return;
    if (snapshotDoneFor.current !== userId) return;
    pulled.current = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/paper', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return;
        const { records: pulledRecords } = (await res.json()) as { records: unknown[] };
        let added = 0;
        try { added = mergePulledRecords(window.localStorage, pulledRecords ?? [], deskId, userId); } catch { /* storage unavailable */ }
        if (pulledRecords && userId) {
          for (const r of pulledRecords) {
            if (r && typeof r === 'object' && 'id' in r && typeof (r as { id: unknown }).id === 'string') {
              claimsRef.current.add((r as { id: string }).id);
            }
          }
          writeClaims(userId, window.localStorage, claimsRef.current);
        }
        if (added > 0) {
          suppressNextPush.current = true;
          try { window.dispatchEvent(new Event('storage')); } catch { /* jsdom may refuse Event */ }
        }
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [authenticated, getAccessToken, userId, deskId, historyReady]);

  const ownedRecords = (list: PaperRecord[]) =>
    list.filter(r => {
      if (!userId) return false;
      if (paperOwnerOf(r) === userId) return true;
      return claimsRef.current.has(r.id);
    });

  useEffect(() => {
    if (!authenticated || !historyReady || records.length === 0 || !userId) return;
    if (suppressNextPush.current) {
      suppressNextPush.current = false;
      lastPushedIds.current = ownedRecords(records).map(r => r.id).join(',');
      return;
    }
    const owned = ownedRecords(records);
    const signature = owned.map(r => r.id).join(',');
    if (signature === lastPushedIds.current && signature !== '') return;
    if (owned.length === 0) { lastPushedIds.current = signature; return; }
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const stamped = owned.map(r => ({ ...r, owner: userId }));
        const res = await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ records: stamped }),
        });
        if (!res.ok) return;
        for (const r of owned) {
          claimsRef.current.add(r.id);
          retagPaperOwner(window.localStorage, r.id, userId);
        }
        writeClaims(userId, window.localStorage, claimsRef.current);
        lastPushedIds.current = signature;
      } catch { /* sync is best-effort; the next change retries */ }
    })();
  }, [authenticated, getAccessToken, userId, historyReady, records, pushKick]);

  /** Explicitly attribute anonymous browser work to this account and upload. */
  const importAnonymousRecords = useCallback(async () => {
    if (!userId || !authenticated) return;
    const toImport = records.filter(r => isAnonymousRecord(r) && !claimsRef.current.has(r.id));
    const retryUpload = importStatus === 'failed';
    if (toImport.length === 0 && !retryUpload) {
      setAnonymousCount(0);
      return;
    }
    setImportStatus('pending');
    for (const r of toImport) {
      claimsRef.current.add(r.id);
      retagPaperOwner(window.localStorage, r.id, userId);
    }
    writeClaims(userId, window.localStorage, claimsRef.current);
    setAnonymousCount(0);
    try { window.dispatchEvent(new Event('storage')); } catch { /* jsdom may refuse Event */ }
    const payload = records
      .filter(r => claimsRef.current.has(r.id) || paperOwnerOf(r) === userId)
      .map(r => ({ ...r, owner: userId }));
    if (payload.length === 0) {
      setImportStatus('idle');
      return;
    }
    try {
      const token = await getAccessToken();
      if (!token) {
        setImportStatus('failed');
        lastPushedIds.current = null;
        setPushKick(k => k + 1);
        return;
      }
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const res = await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ records: payload }),
        });
        ok = res.ok;
      }
      if (!ok) {
        setImportStatus('failed');
        lastPushedIds.current = null;
        setPushKick(k => k + 1);
        return;
      }
      lastPushedIds.current = payload.map(r => r.id).join(',');
      setImportStatus('done');
    } catch {
      setImportStatus('failed');
      lastPushedIds.current = null;
      setPushKick(k => k + 1);
    }
  }, [authenticated, getAccessToken, importStatus, records, userId]);

  return { importAnonymousRecords, anonymousCount, importStatus };
}
