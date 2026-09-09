'use client';

import { useEffect, useRef, useState } from 'react';
import { OPEN_DESK_ID, type HouseDeskId } from '../house';
import type { MarksResult } from './marks-shared';
import { fetchJson } from '../api-client';

const REFRESH_MS = 120_000;

function degradeMarks(result: MarksResult): MarksResult {
  return {
    ...result,
    marks: result.marks.map(mark =>
      mark.reference.status === 'observed'
        ? { ...mark, reference: { ...mark.reference, status: 'stale' } }
        : mark,
    ),
  };
}

/**
 * One reference-marks fetch for the whole desk: the tape displays it and the
 * working tray compares against it. Refreshes only while the tab is visible;
 * failures keep the last good result on screen, but degrade it to stale so
 * the caller is not shown a healthy-looking mark from an old refresh.
 */
export function useReferenceMarks(deskId: HouseDeskId = OPEN_DESK_ID): { result: MarksResult | null; failed: boolean; stale: boolean } {
  const [result, setResult] = useState<MarksResult | null>(null);
  const [failed, setFailed] = useState(false);
  const resultRef = useRef(result);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetchJson<MarksResult>(`/api/desk/${deskId}/marks`);
      if (cancelled) return;
      if (response.ok) {
        setResult(response.data);
        setFailed(false);
      } else {
        const previous = resultRef.current;
        if (previous) {
          // Keep the last-known prices visible, but label them honestly.
          setResult(degradeMarks(previous));
          setFailed(false);
        } else {
          setFailed(true);
        }
      }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden && !cancelled) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [deskId]);

  const stale = Boolean(result) && (failed || result!.marks.some(mark => mark.reference.status !== 'observed'));
  return { result, failed, stale };
}
