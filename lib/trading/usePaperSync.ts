'use client';

import { useEffect, useRef } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { mergePulledRecords } from './paper-records';
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

  useEffect(() => {
    if (lastUserId.current !== userId) {
      pulled.current = false;
      lastPushedIds.current = null;
      suppressNextPush.current = false;
      claimsRef.current = new Set();
      anonymousIdsRef.current = new Set();
      if (userId) {
        claimsRef.current = readClaims(userId, window.localStorage);
        anonymousIdsRef.current = new Set(records.map(r => r.id));
      }
      lastUserId.current = userId;
    }
    if (!authenticated || pulled.current) return;
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
        // Everything the account returned is now claimed by this account.
        if (pulledRecords && userId) {
          for (const r of pulledRecords) {
            if (r && typeof r === 'object' && 'id' in r && typeof (r as { id: unknown }).id === 'string') {
              claimsRef.current.add((r as { id: string }).id);
            }
          }
          writeClaims(userId, window.localStorage, claimsRef.current);
        }
        if (added > 0) {
          suppressNextPush.current = true; // the next push would only echo the merge
          window.dispatchEvent(new Event('storage')); // desk reloads history
        }
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [authenticated, getAccessToken, userId, deskId, records]);

  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId;
      lastPushedIds.current = null;
    }
    if (!authenticated || !historyReady || records.length === 0 || !userId) return;
    if (suppressNextPush.current) {
      suppressNextPush.current = false;
      lastPushedIds.current = records.map(r => r.id).join(',');
      return;
    }
    // Push only records this account owns: previously claimed, or created
    // after sign-in. Anonymous-only records stay local until imported.
    const owned = records.filter(r => claimsRef.current.has(r.id) || !anonymousIdsRef.current.has(r.id));
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
        if (!res.ok) return; // failed backup will be retried on the next change
        for (const r of owned) claimsRef.current.add(r.id);
        writeClaims(userId, window.localStorage, claimsRef.current);
        lastPushedIds.current = signature;
      } catch { /* sync is best-effort; the next change retries */ }
    })();
  }, [authenticated, getAccessToken, userId, historyReady, records]);

  /** Explicitly attribute the record set that existed before sign-in to this
   *  account — anonymous work is imported only by choice, never silently. */
  const importAnonymousRecords = () => {
    if (!userId || !authenticated) return;
    for (const r of records) {
      if (anonymousIdsRef.current.has(r.id)) claimsRef.current.add(r.id);
    }
    writeClaims(userId, window.localStorage, claimsRef.current);
    lastPushedIds.current = null;
  };

  return { importAnonymousRecords };
}
