'use client';

/**
 * The launch moment, celebrated: one comet streaks across the slip, the desk
 * thuds, the phone buzzes. One-shot and unignorable, but never blocking —
 * pointer-transparent, gone in under two seconds, absent entirely when the
 * caller has asked for reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import styles from './HalleyLaunchCelebration.module.css';

export interface HalleyLaunchCelebrationProps {
  /** Shown inside the streak — the ticker just filed. */
  symbol: string;
  onDone?: () => void;
}

const DURATION_MS = 1_700;

export function HalleyLaunchCelebration({ symbol, onDone }: HalleyLaunchCelebrationProps) {
  const [live] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  });
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!live) { doneRef.current?.(); return; }
    try { navigator.vibrate?.([14, 42, 26]); } catch { /* haptics are a bonus */ }
    const timer = setTimeout(() => doneRef.current?.(), DURATION_MS);
    return () => clearTimeout(timer);
  }, [live]);

  if (!live) return null;

  return (
    <div className={styles.overlay} aria-hidden="true">
      <span className={styles.streak}>
        <span className={styles.head} />
        <span className={styles.tail} />
      </span>
      <span className={styles.ticker}>{symbol}</span>
    </div>
  );
}
