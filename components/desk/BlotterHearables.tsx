'use client';

import type { ReactNode } from 'react';
import styles from './WorkingDesk.module.css';

/**
 * Blotter language for hearable lines — shared by every open desk.
 * Tap path is identical to speaking; never pill chips.
 */
export function BlotterHearables({
  lines,
  onSay,
  note = null,
}: {
  lines: readonly string[];
  onSay: (line: string) => void;
  note?: ReactNode;
}) {
  return (
    <div className={styles.blotterHearables} role="group" aria-label="Things the desk hears — tap one and the desk writes it">
      <p className={styles.blotterHearablesLead}>Things the desk hears</p>
      {lines.map(line => (
        <button key={line} type="button" className={styles.blotterLine} onClick={() => onSay(line)}>
          “{line}”
        </button>
      ))}
      {note}
    </div>
  );
}
