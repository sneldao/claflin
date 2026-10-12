'use client';

import { useState } from 'react';
import { getHouseDesk } from '@/lib/house';
import { filingWhen, type HouseFiling } from '@/lib/trading/house-filing';
import styles from './SessionEpilogue.module.css';

const ROW_CAP = 5;

function deskShortName(deskId: HouseFiling['deskId']): string {
  return getHouseDesk(deskId)?.shortName ?? deskId;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function storyText(filings: HouseFiling[]): string {
  const desks = new Set(filings.map(filing => filing.deskId)).size;
  const lines = filings.map(
    filing => `– ${filingWhen(filing.createdAt)} · ${deskShortName(filing.deskId)} — ${filing.sentence}`,
  );
  return [
    `The book so far — ${plural(filings.length, 'filing')} across ${plural(desks, 'desk')} (Claflin)`,
    ...lines,
    'Paper only — nothing was signed or settled.',
  ].join('\n');
}

/**
 * The session narrated as a ledger card: every filed record across the desks,
 * newest first, each a way back into the record itself. Rows read exactly what
 * the books hold — no claim the storage can't back.
 */
export function SessionEpilogue({
  filings,
  onOpen,
}: {
  filings: HouseFiling[];
  onOpen: (filing: HouseFiling) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (filings.length === 0) return null;
  const desks = new Set(filings.map(filing => filing.deskId)).size;
  const rows = filings.slice(0, ROW_CAP);
  const rest = filings.length - rows.length;
  return (
    <aside className={styles.epilogue} aria-label="The book so far">
      <p className={styles.head}>
        The book so far — {plural(filings.length, 'filing')} across {plural(desks, 'desk')}
      </p>
      <ol className={styles.lines}>
        {rows.map(filing => (
          <li key={filing.recordId}>
            <button type="button" className={styles.line} onClick={() => onOpen(filing)}>
              <span className={styles.when}>{filingWhen(filing.createdAt)}</span>
              <span className={styles.desk}>{deskShortName(filing.deskId)}</span>
              <span className={styles.sentence}>{filing.sentence}</span>
              <span className={styles.go} aria-hidden="true">→</span>
            </button>
          </li>
        ))}
      </ol>
      {rest > 0 && <p className={styles.more}>…and {rest} more on file.</p>}
      <p className={styles.foot}>
        Paper only — nothing was signed or settled.{' '}
        <button
          type="button"
          className={styles.copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(storyText(filings));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              /* Clipboard unavailable — the story stays on screen. */
            }
          }}
        >
          {copied ? 'Copied ✓' : 'Copy the story'}
        </button>
      </p>
    </aside>
  );
}
