/**
 * House-wide desk view preference — orthogonal to desk/market.
 * Canonical tokens: room | compact.
 * Legacy aliases night | direct still accepted on read/URL for one release.
 * Keyed per desk so Hetty / Jesse / Isabel each remember Room vs Compact
 * without remounting finance (§4.7).
 */
import { z } from 'zod';
import type { DeskPresentation } from './desk/contracts';
import { normalizeDeskPresentation } from './desk/contracts';
import type { HouseDeskId } from './house';
import { deskRuntimeFor } from './desk/registry';

export type { DeskPresentation };

export const DEFAULT_DESK_PRESENTATION: DeskPresentation = 'compact';

/** Presentation defaults come from the desk runtime; constrained devices still
 *  prefer Compact when no preference is stored. */
export function defaultPresentationForDesk(deskId: HouseDeskId): DeskPresentation {
  return deskRuntimeFor(deskId)?.presentationDefault ?? DEFAULT_DESK_PRESENTATION;
}

/** Coarse pointer or reduced-motion — prefer Compact for first paint when no preference is stored. */
export function shouldPreferCompactView(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function presentationStorageKey(deskId: HouseDeskId): string {
  return `claflin.presentation.v1.${deskId}`;
}

const modeSchema = z.enum(['room', 'compact']);

export function loadDeskPresentation(
  storage: Pick<Storage, 'getItem'>,
  deskId: HouseDeskId,
  opts?: { preferCompactWhenUnset?: boolean },
): DeskPresentation {
  try {
    const raw = storage.getItem(presentationStorageKey(deskId));
    if (!raw) {
      if (opts?.preferCompactWhenUnset) return 'compact';
      return defaultPresentationForDesk(deskId);
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') {
      return normalizeDeskPresentation(parsed) ?? defaultPresentationForDesk(deskId);
    }
    if (parsed && typeof parsed === 'object' && 'mode' in parsed) {
      return normalizeDeskPresentation((parsed as { mode: unknown }).mode)
        ?? defaultPresentationForDesk(deskId);
    }
    return defaultPresentationForDesk(deskId);
  } catch {
    return defaultPresentationForDesk(deskId);
  }
}

export function saveDeskPresentation(
  storage: Pick<Storage, 'setItem' | 'getItem'>,
  deskId: HouseDeskId,
  mode: DeskPresentation,
): void {
  const next = modeSchema.parse(normalizeDeskPresentation(mode) ?? mode);
  /* Jesse also writes claflin.presentation.v1.jesse via the controller —
     store a plain mode string here for house-wide readers; Jesse’s richer
     {mode,focus,objectId} blob remains authoritative for focus. */
  if (deskId === 'jesse') {
    try {
      const key = presentationStorageKey(deskId);
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && 'mode' in parsed) {
          const merged = JSON.stringify({ ...parsed, mode: next });
          storage.setItem(key, merged);
          return;
        }
      }
    } catch { /* fall through */ }
  }
  storage.setItem(presentationStorageKey(deskId), JSON.stringify({ mode: next, focus: 'desk', objectId: null }));
}

export function parseViewQuery(raw: string | null | undefined): DeskPresentation | null {
  return normalizeDeskPresentation(raw);
}

/** Write the canonical view token into the URL (`room` | `compact`). */
export function syncViewQuery(mode: DeskPresentation): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('view', modeSchema.parse(mode));
    window.history.replaceState({}, '', url.toString());
  } catch { /* optional */ }
}

export function deskViewLabel(mode: DeskPresentation): string {
  return mode === 'room' ? 'Room' : 'Compact';
}
