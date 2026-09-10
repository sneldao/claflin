'use client';

import { useState } from 'react';
import styles from './DeskTerm.module.css';

/** A term of the trade that explains itself in place — one sentence, in the
 *  desk's register, exactly where the client meets the word. Descriptive,
 *  never prescriptive; no curriculum, no tour. */
export function DeskTerm({ term, definition }: { term: string; definition: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.deskTerm}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{term}</button>
      {open && <span role="note" className={styles.deskTermNote}>{definition}</span>}
    </span>
  );
}
