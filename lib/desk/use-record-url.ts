'use client';

import { useEffect, useRef } from 'react';
import { syncRecordQuery } from '../house-entry';

/**
 * The open record keeps the address bar honest: opening pushes a history
 * entry so Back closes the receipt, dismissing replaces in place. An id
 * already present in the URL (a deep link or a popstate) is not re-pushed.
 *
 * `scope` identifies which session owns the record. When the scope itself
 * changes — the conductor handed the floor to another engine — the
 * navigation that caused it already wrote the URL, so the hook adopts the
 * new session's value as the baseline instead of syncing the handoff.
 */
export function useRecordUrl(viewedRecordId: string | null, scope?: string): void {
  const previous = useRef<{ scope?: string; id: string | null }>({ scope, id: null });
  useEffect(() => {
    if (scope !== previous.current.scope) {
      previous.current = { scope, id: viewedRecordId };
      return;
    }
    if (viewedRecordId === previous.current.id) return;
    previous.current.id = viewedRecordId;
    const inUrl = new URLSearchParams(window.location.search).get('record');
    if (viewedRecordId === inUrl) return;
    syncRecordQuery(viewedRecordId, viewedRecordId ? 'push' : 'replace');
  }, [viewedRecordId, scope]);
}
