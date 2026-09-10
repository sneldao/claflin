'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { mergePulledRecords } from './paper-records';
import type { useTradingDesk } from './useTradingDesk';
import type { PaperRecord } from './paper-records';

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

/**
 * Account-bound paper-record sync. Pull merges server records into local
 * storage (validated like local writes; local stays authoritative on id
 * collision) and the desk reloads via its storage listener. Push mirrors only
 * the records this account owns to the account; anonymous browser work is
 * never uploaded without an explicit import. Both are best-effort — sync
 * never blocks the desk, and a pull never echoes back as a push.
 */
export function usePaperSync(desk: ReturnType<typeof useTradingDesk>) {
  const { authenticated, getAccessToken, userId } = useDeskAuth();
  const { deskId, historyReady, records } = desk;
  const pulled = useRef(false);
  const suppressNextPush = useRef(false);
  const lastPushedIds = useRef<string | null>(null);
  const lastUserId = useRef<string | null>(null);
  const claimsRef = useRef<Set<string>>(new Set());
  const anonymousIdsRef = useRef<Set<string>>(new Set());
  /** Snapshot runs once per account after history is ready — not on auth alone. */
  const snapshotDoneFor = useRef<string | null>(null);
  /** Records still awaiting an explicit import — shown so the caller can
   *  decide, never imported silently. */
  const [anonymousCount, setAnonymousCount] = useState(0);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  /** Bump to re-run the push effect after an import upload fails. */
  const [pushKick, setPushKick] = useState(0);

  useEffect(() => {
    if (lastUserId.current === userId) return;
    pulled.current = false;
    lastPushedIds.current = null;
    suppressNextPush.current = false;
    claimsRef.current = new Set();
    anonymousIdsRef.current = new Set();
    snapshotDoneFor.current = null;
    setImportStatus('idle');
    setAnonymousCount(0);
    lastUserId.current = userId;
  }, [userId]);

  /* Wait for historyReady before classifying anonymous work — otherwise a
     fast auth resolve snapshots an empty list and later local records look
     owned. */
  useEffect(() => {
    if (!userId || !authenticated) {
      setAnonymousCount(0);
      return;
    }
    if (!historyReady) return;
    if (snapshotDoneFor.current !== userId) {
      claimsRef.current = readClaims(userId, window.localStorage);
      anonymousIdsRef.current = new Set(
        records.filter(r => !claimsRef.current.has(r.id)).map(r => r.id),
      );
      snapshotDoneFor.current = userId;
    }
    setAnonymousCount(records.filter(r => anonymousIdsRef.current.has(r.id) && !claimsRef.current.has(r.id)).length);
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
        try { added = mergePulledRecords(window.localStorage, pulledRecords ?? [], deskId); } catch { /* storage unavailable */ }
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
          window.dispatchEvent(new Event('storage'));
        }
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [authenticated, getAccessToken, userId, deskId, historyReady]);

  const ownedRecords = (list: PaperRecord[]) =>
    list.filter(r => claimsRef.current.has(r.id) || !anonymousIdsRef.current.has(r.id));

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
        const res = await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ records: owned }),
        });
        if (!res.ok) return;
        for (const r of owned) claimsRef.current.add(r.id);
        writeClaims(userId, window.localStorage, claimsRef.current);
        lastPushedIds.current = signature;
      } catch { /* sync is best-effort; the next change retries */ }
    })();
  }, [authenticated, getAccessToken, userId, historyReady, records, pushKick]);

  /** Explicitly attribute pre-sign-in browser work to this account and upload. */
  const importAnonymousRecords = useCallback(async () => {
    if (!userId || !authenticated) return;
    const toImport = records.filter(r => anonymousIdsRef.current.has(r.id) && !claimsRef.current.has(r.id));
    const retryUpload = importStatus === 'failed';
    if (toImport.length === 0 && !retryUpload) {
      setAnonymousCount(0);
      return;
    }
    setImportStatus('pending');
    for (const r of toImport) claimsRef.current.add(r.id);
    writeClaims(userId, window.localStorage, claimsRef.current);
    setAnonymousCount(0);
    const payload = ownedRecords(records);
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
