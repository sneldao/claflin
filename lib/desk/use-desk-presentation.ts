'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { HouseDeskId } from '../house';
import {
  loadDeskPresentation,
  parseViewQuery,
  saveDeskPresentation,
  shouldPreferCompactView,
  syncViewQuery,
  type DeskPresentation,
} from '../desk-presentation';

/**
 * One presentation bootstrap for every desk surface: `?view=` wins, then the
 * stored per-desk preference, then Compact for constrained devices. Changes
 * persist and keep the address bar honest.
 *
 * `ready` gates the initial apply so a desk whose session hydrates in an
 * effect (Jesse's controller) does not swallow the query before it exists.
 */
export function useDeskPresentation(
  deskId: HouseDeskId,
  applyMode: (mode: DeskPresentation) => void,
  ready = true,
): (mode: DeskPresentation) => void {
  const applied = useRef(false);
  const applyRef = useRef(applyMode);
  useEffect(() => { applyRef.current = applyMode; });

  /* The bootstrap reads location/storage once — intentionally effect-side. */
  useEffect(() => {
    if (!ready || applied.current || typeof window === 'undefined') return;
    applied.current = true;
    const fromQuery = parseViewQuery(new URLSearchParams(window.location.search).get('view'));
    const mode = fromQuery ?? loadDeskPresentation(window.localStorage, deskId, {
      preferCompactWhenUnset: shouldPreferCompactView(),
    });
    applyRef.current(mode);
    saveDeskPresentation(window.localStorage, deskId, mode);
    syncViewQuery(mode);
  }, [deskId, ready]);

  return useCallback((mode: DeskPresentation) => {
    applyRef.current(mode);
    saveDeskPresentation(window.localStorage, deskId, mode);
    syncViewQuery(mode);
  }, [deskId]);
}
