'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './WorkingDesk.module.css';
import evidence from "./EvidencePanel.module.css";

export type EvidenceStatus = 'empty' | 'loading' | 'ready' | 'unavailable';

const STATUS_TEXT: Record<EvidenceStatus, string> = {
  empty: 'No reading',
  loading: 'Reading…',
  ready: 'Observed',
  unavailable: 'Unavailable',
};

/**
 * One market-evidence source, shared by every desk.
 *
 * Design rules — "focused, but still informed":
 * - Collapsed to one line by default (eyebrow · title · status), so every
 *   source stays visible at a glance without three full panels of prose.
 * - A finished reading expands itself once, so the numbers appear without a
 *   click; the reader can always close it again.
 * - Methodology sits behind the in-card "About this reading" disclosure.
 * - The shared caveat renders once per evidence module (the ticket), not once
 *   per source — three stacked disclaimers read back as noise.
 * - `body` is the actual data (ready), the failure reasons (unavailable), or an
 *   actionable empty state; loading/empty fall back to a one-line status.
 */
export function EvidencePanel({
  titleId,
  eyebrow,
  title,
  status,
  body,
  about,
  meta,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  status: EvidenceStatus;
  body?: ReactNode;
  about?: ReactNode;
  meta?: ReactNode;
}) {
  const hasReading = status === 'ready' || status === 'unavailable';
  const [open, setOpen] = useState(status === 'ready');
  const sawReading = useRef(status === 'ready');

  useEffect(() => {
    if (status === 'ready' && !sawReading.current) {
      sawReading.current = true;
      setOpen(true);
    }
  }, [status]);

  return (
    <details
      className={evidence.marketEvidence}
      data-status={status}
      data-quiet={hasReading ? undefined : 'true'}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      aria-labelledby={titleId}
    >
      <summary className={evidence.evidenceSummary}>
        <span className={`${styles.eyebrow} ${evidence.eyebrow}`}>{eyebrow}</span>
        <span className={evidence.evidenceChevron} aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <span className={evidence.evidenceStatus} data-status={status}>
          <i aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
      </summary>
      <div className={evidence.evidenceCardBody}>
        {body}
        {!body && status === 'loading' && (
          <p className={evidence.evidenceMeta} role="status">Reading…</p>
        )}
        {!body && status === 'empty' && (
          <p className={evidence.evidenceMeta}>No reading yet.</p>
        )}
        {meta}
        {about && (
          <details className={evidence.evidenceAbout}>
            <summary>About this reading</summary>
            <div className={evidence.evidenceAboutBody}>{about}</div>
          </details>
        )}
      </div>
    </details>
  );
}

/** One labelled value row: "Reference · 189.42 USD · Backed issuer indicative". */
export function EvidenceRow({ label, value, source }: { label: string; value: ReactNode; source?: string }) {
  return (
    <p className={evidence.evidenceObs}>
      <strong>{label}</strong>
      {' · '}
      {value}
      {source && <> · {source}</>}
    </p>
  );
}

/**
 * The basis-point spread as a directional glyph + number, not a sentence.
 * Accepts the API's string bps (e.g. "12.3" / "-4.0"); sign drives direction.
 */
export function EvidenceDelta({ bps }: { bps: string | null }) {
  if (bps === null) {
    return <p className={evidence.evidenceMeta}>No basis-point difference available.</p>;
  }
  const negative = bps.startsWith('-');
  const zero = Number(bps) === 0;
  const direction = zero ? 'flat' : negative ? 'down' : 'up';
  return (
    <p className={evidence.evidenceBps}>
      <span className={evidence.evidenceDelta} data-direction={direction} aria-hidden="true">
        {zero ? '·' : negative ? '▼' : '▲'}
      </span>
      {bps} bps
    </p>
  );
}
