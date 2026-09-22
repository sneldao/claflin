'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OPEN_DESK_ID, type HouseDeskId } from '@/lib/house';
import type { ParkedDesk } from './desk-mandate';

/**
 * Which desk is on the floor and what was parked when switching away.
 * deskIdRef is stamped synchronously by setDesk so an in-flight quote
 * sees the new desk before effects flush.
 */
export function useDeskSession() {
  const [deskId, setDeskId] = useState<HouseDeskId>(OPEN_DESK_ID);
  const deskIdRef = useRef(deskId);
  const sessions = useRef<Partial<Record<HouseDeskId, ParkedDesk>>>({});

  useEffect(() => { deskIdRef.current = deskId; });

  const setDesk = useCallback((id: HouseDeskId) => {
    setDeskId(id);
    deskIdRef.current = id;
  }, []);

  const resetSessions = useCallback(() => {
    sessions.current = {};
  }, []);

  const parkSessions = useCallback((next: Partial<Record<HouseDeskId, ParkedDesk>>) => {
    sessions.current = next;
  }, []);

  return useMemo(() => ({ deskId, deskIdRef, sessions, setDesk, resetSessions, parkSessions }), [deskId, setDesk, resetSessions, parkSessions]);
}
