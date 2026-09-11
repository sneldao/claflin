'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import { createBasePublicClient, reconcileLiveHash } from './execute-swap';
import {
  loadLiveJournal,
  pendingLiveJournalEntries,
  updateLiveOutcome,
  type LiveJournalEntry,
} from './live-journal';
import { mintFirstLiveSlip } from './desk-slips';

/**
 * Loads the live journal for a desk and reconciles pending hashes after
 * reload — never resubmits. Filing during execution is handled by
 * useDeskExecution so the hash is not lost mid-confirmation.
 */
export function useLiveJournal(deskId: HouseDeskId = OPEN_DESK_ID) {
  const [entries, setEntries] = useState<LiveJournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const publicClient = useMemo(() => createBasePublicClient(), []);

  const reload = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      setEntries(loadLiveJournal(window.localStorage, deskId));
      setReady(true);
    } catch {
      setEntries([]);
      setReady(true);
    }
  }, [deskId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const pending = pendingLiveJournalEntries(window.localStorage, deskId);
    if (pending.length === 0) return;
    let cancelled = false;
    setReconciling(true);
    void (async () => {
      try {
        for (const entry of pending) {
          if (cancelled) return;
          const outcome = await reconcileLiveHash(
            publicClient,
            entry.hash,
            entry.quote,
            entry.walletAddress as `0x${string}`,
          );
          if (cancelled) return;
          const updated = updateLiveOutcome(window.localStorage, entry.hash, outcome);
          if (updated) {
            try { mintFirstLiveSlip(window.localStorage, updated); } catch { /* keepsake is best-effort */ }
          }
        }
      } finally {
        if (!cancelled) {
          setReconciling(false);
          reload();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, deskId, publicClient, reload]);

  return { entries, ready, reconciling, reload };
}
