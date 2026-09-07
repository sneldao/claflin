'use client';

import { useEffect, useRef } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import type { useTradingDesk } from './useTradingDesk';
import type { PaperRecord } from './paper-records';

const PREFIX = 'claflin.paper.v1.';

/**
 * Account-bound paper-record sync. Pull merges server records into local
 * storage (the desk reloads via its storage listener); push mirrors local
 * saves to the account. Both are best-effort — the local record remains
 * authoritative for this browser; sync never blocks the desk.
 */
export function usePaperSync(desk: ReturnType<typeof useTradingDesk>) {
  const auth = useDeskAuth();
  const pulled = useRef(false);

  useEffect(() => {
    if (!auth.authenticated || pulled.current) return;
    pulled.current = true;
    (async () => {
      try {
        const token = await auth.getAccessToken();
        if (!token) return;
        const res = await fetch('/api/paper', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return;
        const { records } = (await res.json()) as { records: PaperRecord[] };
        for (const record of records ?? []) {
          const key = PREFIX + record.id;
          if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(record));
        }
        window.dispatchEvent(new Event('storage')); // desk reloads history
      } catch { /* offline or unavailable — local history stands */ }
    })();
  }, [auth.authenticated, auth.getAccessToken]);

  useEffect(() => {
    if (!auth.authenticated || !desk.historyReady || desk.records.length === 0) return;
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
      } catch { /* sync is best-effort */ }
    })();
  }, [auth.authenticated, auth.getAccessToken, desk.historyReady, desk.records]);
}
