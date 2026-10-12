'use client';

import { useEffect, useState } from 'react';
import { RING_EXAMPLES } from '@/lib/desk/ui-copy';
import { signalLine } from '@/lib/trading/line-signal';
import styles from './WorkingDesk.module.css';

/** A rotating “try saying” line under the idle ring button — tappable, so
 *  the most-seen nudge in the app always does something. With an explicit
 *  onPick (blotter-style fill) it applies the line; otherwise it lifts the
 *  line so the caller can say it. Reduced motion holds line 0. */
export function RingExample({ deskId, onPick }: { deskId: keyof typeof RING_EXAMPLES; onPick?: (line: string) => void }) {
  const lines = RING_EXAMPLES[deskId];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % lines.length), 6000);
    return () => clearInterval(timer);
  }, [lines.length]);
  const pick = () => {
    if (onPick) onPick(lines[index]);
    else signalLine();
  };
  return (
    <p className={styles.ringExample}>
      <button type="button" className={styles.ringExampleButton} onClick={pick} aria-label={`Try saying: ${lines[index]}`}>
        <span key={index}>Try: “{lines[index]}”</span>
      </button>
    </p>
  );
}
