'use client';

import { useEffect, useState } from 'react';
import { listHouseFilings, type HouseFiling } from './house-filing';

/** Every filing in this browser, newest first, read once when the surface mounts. */
export function useHouseFilings(): HouseFiling[] {
  const [filings, setFilings] = useState<HouseFiling[]>([]);
  useEffect(() => {
    try {
      setFilings(listHouseFilings(window.localStorage));
    } catch {
      setFilings([]);
    }
  }, []);
  return filings;
}

/** The newest filing in this browser, read once when the surface mounts. */
export function useLatestFiling(): HouseFiling | null {
  return useHouseFilings()[0] ?? null;
}
