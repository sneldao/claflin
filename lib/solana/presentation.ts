/**
 * Jesse presentation preference (plan §4.7, E1 work item 6).
 *
 * §4.7 invariants this module exists to protect: switching views changes ONLY
 * presentation state and the validated browser-local preference under
 * `claflin.presentation.v1.jesse`. It must never remount the financial/session
 * owner, refetch a quote as an implicit action, change desk/network/account or
 * paper/live execution mode, reset the draft/revision, renew expired terms, or
 * create/reuse authorization. In-flight operations remain the same operation;
 * if a quote expires during a transition, ordinary expiry policy still applies.
 *
 * Client-safe: no server imports, no env access, no React. Malformed or
 * missing preference rows read back as the default — a preference is a
 * convenience, never evidence, and never a permission signal (no
 * experienceLevel/unlocked/expert state may live here).
 */
import { z } from 'zod';
import type { PaperStorage } from '../trading/paper-records';
import type { DeskPresentation, DeskPresentationState } from './contracts';

export const JESSE_PRESENTATION_KEY = 'claflin.presentation.v1.jesse';

export const DEFAULT_JESSE_PRESENTATION: DeskPresentationState = Object.freeze({
  mode: 'night',
  focus: 'desk',
  objectId: null,
});

const presentationSchema = z.object({
  mode: z.enum(['night', 'direct']),
  focus: z.enum(['desk', 'evidence', 'instruction', 'record']),
  objectId: z.string().min(1).max(100).nullable(),
}).strict();

/** Read the persisted presentation preference. Missing or malformed rows
 *  yield the default — presentation is never a reason to fail closed. */
export function loadJessePresentation(storage: Pick<PaperStorage, 'getItem'>): DeskPresentationState {
  const raw = storage.getItem(JESSE_PRESENTATION_KEY);
  if (!raw) return { ...DEFAULT_JESSE_PRESENTATION };
  try {
    return presentationSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_JESSE_PRESENTATION };
  }
}

/** Persist the presentation preference, validated and write-verified like
 *  every other desk document. */
export function saveJessePresentation(storage: PaperStorage, state: DeskPresentationState): void {
  const parsed = presentationSchema.parse(state);
  const serialized = JSON.stringify(parsed);
  storage.setItem(JESSE_PRESENTATION_KEY, serialized);
  if (storage.getItem(JESSE_PRESENTATION_KEY) !== serialized) {
    throw new Error('Presentation preference could not be verified after saving.');
  }
}

/** Switch the view. Changes ONLY the mode — focus and object identity are
 *  preserved, and nothing financial is touched (§4.7). */
export function switchJessePresentation(
  current: DeskPresentationState,
  mode: DeskPresentation,
): DeskPresentationState {
  return { ...current, mode };
}

/** Move focus to a known object on the active desk. Changes ONLY focus and
 *  objectId — the mode is preserved, and this never mutates, quotes, files,
 *  grants access, or submits (§4.5). */
export function applyJesseFocus(
  current: DeskPresentationState,
  target: DeskPresentationState['focus'],
  objectId: string | null,
): DeskPresentationState {
  return { ...current, focus: target, objectId };
}
