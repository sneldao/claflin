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
  const auth = useDeskAuth();
  const pulled = useRef(false);
  const suppressNextPush = useRef(false);
  const lastPushedIds = useRef<string | null>(null);

  useEffect(() => {
    if (!auth.authenticated || pulled.current) return;
    pulled.current = true;
    (async () => {
      try {
        const token = await auth.getAccessToken();
        if (!token) return;
        const res = await fetch('/api/paper', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return;
        const { records } = (await res.json()) as { records: unknown[] };
        let added = 0;
        try { added = mergePulledRecords(window.localStorage, records ?? [], desk.deskId); }
        catch { /* storage unavailable — local history stands */ }
        if (added > 0) {
          suppressNextPush.current = true; // the next push would only echo the merge
          window.dispatchEvent(new Event('storage')); // desk reloads history
        }
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [auth.authenticated, auth.getAccessToken, desk.deskId]);

  useEffect(() => {
    if (!auth.authenticated || !desk.historyReady || desk.records.length === 0) return;
    if (suppressNextPush.current) {
      suppressNextPush.current = false;
      lastPushedIds.current = recordsSignature(desk.records);
      return;
    }
    const signature = recordsSignature(desk.records);
    if (signature === lastPushedIds.current) return; // same record set, nothing new to mirror
    const records = desk.records;
    (async () => {
      try {
        const token = await auth.getAccessToken();
        if (!token) return;
        await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ records }),
        });
        lastPushedIds.current = signature;
      } catch { /* sync is best-effort; the next change retries */ }
    })();
  }, [auth.authenticated, auth.getAccessToken, desk.historyReady, desk.records]);
}

/** Cheap echo detector: a record's content is immutable per id in this desk, so the ordered id list identifies the set. */
function recordsSignature(records: readonly { id: string }[]): string {
  return records.map(record => record.id).join(',');
}
