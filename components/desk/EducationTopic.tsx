'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getEducationTopic,
  type EducationTopic,
  type EducationTopicId,
} from '@/lib/education';
import styles from './EducationTopic.module.css';

/**
 * Inline term with a short explanation and optional deeper reading from the
 * sourced education catalog. Opening further reading never grants approval
 * and never forces a decision.
 */
export function DeskTerm({
  term,
  definition,
  topicId,
  onDismiss,
}: {
  term: string;
  definition?: string;
  topicId?: EducationTopicId;
  /** Fired when a deeper-reading panel closes — e.g. remind to refresh terms. */
  onDismiss?: () => void;
}) {
  const topic = topicId ? getEducationTopic(topicId) : undefined;
  const short = definition ?? topic?.shortExplanation ?? '';
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.deskTerm}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {term}
      </button>
      {open && (
        <span role="note" className={styles.deskTermNote}>
          {short}
          {topic && <EducationTopicTrigger topic={topic} onDismiss={onDismiss} />}
        </span>
      )}
    </span>
  );
}

export function EducationTopicTrigger({
  topic,
  label = 'Further reading',
  className,
  onDismiss,
}: {
  topic: EducationTopic;
  label?: string;
  className?: string;
  onDismiss?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  /* Mount the dialog only after the first open so a slip with several
     education links still exposes a single product-details disclosure. */
  const [mounted, setMounted] = useState(false);

  const open = () => {
    setMounted(true);
    queueMicrotask(() => {
      const panel = dialogRef.current;
      if (!panel) return;
      try {
        if (typeof panel.showModal === 'function') panel.showModal();
        else panel.setAttribute('open', '');
      } catch {
        try { panel.setAttribute('open', ''); } catch { /* stay shut */ }
      }
      closeRef.current?.focus();
    });
  };

  const close = () => {
    const panel = dialogRef.current;
    if (!panel) return;
    try {
      if (panel.hasAttribute('open') && typeof panel.close !== 'function') panel.removeAttribute('open');
      else panel.close();
    } catch {
      try { panel.removeAttribute('open'); } catch { /* already shut */ }
    }
  };

  return (
    <>
      <button type="button" className={className ? `${styles.further} ${className}` : styles.further} onClick={open}>
        {label}
      </button>
      {mounted && (
        <dialog
          ref={dialogRef}
          className={styles.panel}
          aria-labelledby={titleId}
          onClose={() => onDismiss?.()}
          onCancel={event => {
            event.preventDefault();
            close();
          }}
          onClick={event => {
            if (event.target === dialogRef.current) close();
          }}
        >
          <EducationTopicBody topic={topic} titleId={titleId} />
          <button ref={closeRef} type="button" className={styles.close} onClick={close}>
            Close explanation
          </button>
        </dialog>
      )}
    </>
  );
}

export function EducationTopicBody({
  topic,
  titleId,
}: {
  topic: EducationTopic;
  titleId?: string;
}) {
  const practiceHref = topic.practicePath
    ? `${topic.practicePath}?from=desk`
    : null;
  return (
    <article className={styles.body} data-topic={topic.id} data-type={topic.type}>
      <p className={styles.kicker}>Claflin · house explanation</p>
      <p className={styles.meta}>
        <span>{topic.era}</span>
        <span>{topic.type.replace(/_/g, ' ')}</span>
        <span>
          {topic.reviewStatus === 'reviewed'
            ? `Reviewed ${topic.revisedAt}`
            : topic.reviewStatus === 'needs_revision'
              ? `Needs revision · ${topic.revisedAt}`
              : `Draft · ${topic.revisedAt}`}
        </span>
      </p>
      <h2 id={titleId}>{topic.title}</h2>
      <p className={styles.short}>{topic.shortExplanation}</p>
      <p className={styles.deeper}>{topic.deeperReading}</p>
      <p className={styles.boundary}>
        Reading this never grants approval, never refreshes an estimate, and never moves funds. If you return to a slip, refresh expired terms before deciding.
      </p>
      <ul className={styles.sources} aria-label="Sources">
        {topic.sources.map(source => (
          <li key={source.label}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ) : (
              <span>{source.label}</span>
            )}
            {source.note && <small>{source.note}</small>}
          </li>
        ))}
      </ul>
      {practiceHref && (
        <p className={styles.practice}>
          <Link href={practiceHref}>Open the labelled practice · {topic.title}</Link>
          <small>Leaves the desk briefly. Your instruction stays where you left it. No wallet.</small>
        </p>
      )}
    </article>
  );
}
