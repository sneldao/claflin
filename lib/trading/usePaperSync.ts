'use client';

import { useEffect, useRef } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { mergePulledRecords } from './paper-records';
import type { useTradingDesk } from './useTradingDesk';

/**
 * Account-bound paper-record sync. Pull merges server records into local
 * storage (validated like local writes; local stays authoritative on id
 * collision) and the desk reloads via its storage listener. Push mirrors
 * local saves to the account. Both are best-effort — sync never blocks the
 * desk, and a pull never echoes back as a push: the records it added are
 * already on the server, and the guard skips exactly the one push those
 * writes would otherwise trigger.
 */
export function usePaperSync(desk: ReturnType<typeof useTradingDesk>) {
  const { authenticated, getAccessToken, userId } = useDeskAuth();
  const { deskId, historyReady, records } = desk;
  const pulled = useRef(false);
  const suppressNextPush = useRef(false);
  const lastPushedIds = useRef<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (lastUserId.current !== userId) {
      pulled.current = false;
      lastPushedIds.current = null;
      suppressNextPush.current = false;
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
        try { added = mergePulledRecords(window.localStorage, pulledRecords ?? [], deskId); }
        catch { /* storage unavailable — local history stands */ }
        if (added > 0) {
          suppressNextPush.current = true; // the next push would only echo the merge
          window.dispatchEvent(new Event('storage')); // desk reloads history
        }
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [authenticated, getAccessToken, userId, deskId]);

  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId;
      lastPushedIds.current = null;
    }
    if (!authenticated || !historyReady || records.length === 0) return;
    if (suppressNextPush.current) {
      suppressNextPush.current = false;
      lastPushedIds.current = recordsSignature(records);
      return;
    }
    const signature = recordsSignature(records);
    if (signature === lastPushedIds.current) return; // same record set, nothing new to mirror
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ records }),
        });
        if (!res.ok) return; // failed backup will be retried on the next change
        lastPushedIds.current = signature;
      } catch { /* sync is best-effort; the next change retries */ }
    })();
  }, [authenticated, getAccessToken, userId, historyReady, records]);
}

/** Cheap echo detector: a record's content is immutable per id in this desk, so the ordered id list identifies the set. */
function recordsSignature(records: readonly { id: string }[]): string {
  return records.map(record => record.id).join(',');
}
