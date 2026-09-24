'use client';

import { useEffect, useState } from 'react';
import { latestHouseFiling, type HouseFiling } from './house-filing';

/** The newest filing in this browser, read once when the surface mounts. */
export function useLatestFiling(): HouseFiling | null {
  const [filing, setFiling] = useState<HouseFiling | null>(null);
  useEffect(() => {
    try {
      setFiling(latestHouseFiling(window.localStorage));
    } catch {
      setFiling(null);
    }
  }, []);
  return filing;
}
