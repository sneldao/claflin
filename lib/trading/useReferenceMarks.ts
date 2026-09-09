'use client';

import { useEffect, useState } from 'react';
import type { MarksResult } from './marks-shared';
import { fetchJson } from '../api-client';

const REFRESH_MS = 120_000;

/**
 * One reference-marks fetch for the whole desk: the tape displays it and the
 * working tray compares against it. Refreshes only while the tab is visible;
 * failures keep the last good result on screen.
 */
export function useReferenceMarks(): { result: MarksResult | null; failed: boolean } {
  const [result, setResult] = useState<MarksResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetchJson<MarksResult>('/api/stocks/marks');
      if (cancelled) return;
      if (response.ok) {
        setResult(response.data);
        setFailed(false);
      } else {
        setFailed(response.error.status === 0 || response.error.status >= 500 || response.error.status === 404);
      }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { result, failed };
}
