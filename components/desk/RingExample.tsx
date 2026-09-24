'use client';

import { useEffect, useState } from 'react';
import { RING_EXAMPLES } from '@/lib/desk/ui-copy';
import styles from './WorkingDesk.module.css';

/** A rotating “try saying” line under the idle ring button — the action
 *  shown, not explained. Non-interactive; reduced motion holds line 0. */
export function RingExample({ deskId }: { deskId: keyof typeof RING_EXAMPLES }) {
  const lines = RING_EXAMPLES[deskId];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % lines.length), 6000);
    return () => clearInterval(timer);
  }, [lines.length]);
  return (
    <p className={styles.ringExample}>
      <span key={index}>Try: “{lines[index]}”</span>
    </p>
  );
}
