'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SignalCaptionKey } from './ui-copy';

/**
 * First-exposure caption for an ambient signal — true until the caller
 * dismisses it once per browser, or it has been visible a while. Starts
 * false so server markup matches hydration; an effect reveals it only to
 * callers who have never seen it. The timer cleanup (not unmount-marking)
 * keeps this correct under StrictMode double-effects: clearing a pending
 * timer never records an exposure that did not happen.
 */

const SEEN_PREFIX = 'claflin.signals.v1.';
const RETIRE_AFTER_MS = 12_000;

function seenKey(key: SignalCaptionKey): string {
  return `${SEEN_PREFIX}${key}`;
}

export function signalSeen(key: SignalCaptionKey): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(seenKey(key)) === '1';
  } catch {
    return false;
  }
}

export function markSignalSeen(key: SignalCaptionKey): void {
  try {
    window.localStorage?.setItem(seenKey(key), '1');
  } catch {
    /* Private mode: the caption simply returns next visit. */
  }
}

export function useSignalCaption(key: SignalCaptionKey): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);
  const dismiss = useCallback(() => {
    markSignalSeen(key);
    setShow(false);
  }, [key]);
  /* eslint-disable react-hooks/set-state-in-effect -- syncing the localStorage
     exposure record into state on mount, plus timer-driven retirement whose
     cleanup clears it on unmount. */
  useEffect(() => {
    if (signalSeen(key)) return;
    setShow(true);
    const timer = setTimeout(() => {
      markSignalSeen(key);
      setShow(false);
    }, RETIRE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return { show, dismiss };
}
