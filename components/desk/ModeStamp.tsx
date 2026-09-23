'use client';

import type { ReactNode } from 'react';
import { MODE_LABELS } from '@/lib/desk/ui-copy';
import styles from './WorkingDesk.module.css';

/**
 * A compact mode stamp for desk surfaces. The stamped label is the primary
 * signal; the longer explanation stays behind a small disclosure so it does
 * not crowd the desk.
 */
export function ModeStamp({
  live,
  hint,
  market,
  presentation,
  children,
}: {
  live: boolean;
  hint?: string;
  market?: string;
  presentation?: string;
  children?: ReactNode;
}) {
  const label = live ? MODE_LABELS.live : MODE_LABELS.paper;
  return (
    <div
      className={styles.mode}
      data-presentation={presentation}
      data-live={live ? 'true' : 'false'}
    >
      <strong className={styles.modeStamp}>
        {label}
      </strong>
      {hint && (
        <details className={styles.modeDetails}>
          <summary aria-label={`About ${label.toLowerCase()}`}>ⓘ</summary>
          <span className={styles.modeHint}>{hint}</span>
        </details>
      )}
      {children}
      {market && <span className={styles.modeMarket}>{market}</span>}
    </div>
  );
}
