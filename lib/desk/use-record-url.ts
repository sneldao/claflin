'use client';

import { useEffect, useRef } from 'react';
import { syncRecordQuery } from '../house-entry';

/**
 * The open record keeps the address bar honest: opening pushes a history
 * entry so Back closes the receipt, dismissing replaces in place. An id
 * already present in the URL (a deep link or a popstate) is not re-pushed.
 */
export function useRecordUrl(viewedRecordId: string | null): void {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (viewedRecordId === previous.current) return;
    previous.current = viewedRecordId;
    const inUrl = new URLSearchParams(window.location.search).get('record');
    if (viewedRecordId === inUrl) return;
    syncRecordQuery(viewedRecordId, viewedRecordId ? 'push' : 'replace');
  }, [viewedRecordId]);
}
