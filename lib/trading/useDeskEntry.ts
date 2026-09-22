'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EntryIntent } from '@/lib/house-entry';

export type HouseEntryPhase = 'pending' | 'foyer' | 'desk';

/**
 * Where the visitor stands — foyer or a desk — plus the context a URL entry
 * carried in (offering, instruction, record). `gen` bumps once per hydrate so
 * surfaces can consume entry context exactly once per navigation; after that
 * the desk's own state owns the session. Navigation itself (history, URLs,
 * hydration) is orchestrated by the composing hook — this is the state bag.
 */
export function useDeskEntry() {
  const [phase, setPhase] = useState<HouseEntryPhase>('pending');
  const [resolved, setResolved] = useState(false);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [intent, setIntent] = useState<EntryIntent | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [gen, setGen] = useState(0);

  const applyEntry = useCallback((next: { offeringId: string | null; intent: EntryIntent | null; recordId: string | null }) => {
    setOfferingId(next.offeringId);
    setIntent(next.intent);
    setRecordId(next.recordId);
    setGen(previous => previous + 1);
  }, []);

  const clearEntry = useCallback(() => {
    setOfferingId(null);
    setIntent(null);
    setRecordId(null);
  }, []);

  const showPhase = useCallback((next: HouseEntryPhase) => {
    setPhase(next);
    setResolved(true);
  }, []);

  return useMemo(() => ({
    entryPhase: phase,
    entryResolved: resolved,
    entryOfferingId: offeringId,
    entryIntent: intent,
    entryRecordId: recordId,
    entryGen: gen,
    applyEntry,
    clearEntry,
    showPhase,
  }), [phase, resolved, offeringId, intent, recordId, gen, applyEntry, clearEntry, showPhase]);
}
