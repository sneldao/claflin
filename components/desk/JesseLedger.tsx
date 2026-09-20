'use client';

import { memo, useEffect, useState } from 'react';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import { compactJesseEntry, groupJesseRecordsByDay } from '@/lib/solana/desk-documents';
import { downloadJesseLedger, type JesseLedgerFormat } from '@/lib/solana/ledger-export';
import { formatRecordedTime } from '@/lib/trading/desk-documents';
import { loadDeskSlips, type DeskSlip } from '@/lib/trading/desk-slips';
import styles from './WorkingDesk.module.css';

export const JesseLedger = memo(function JesseLedger({ jesse }: { jesse: JesseDesk }) {
  const { records, historyReady, storageError, viewedRecordId, openRecord, removeRecord, foreground } = jesse;
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [slips, setSlips] = useState<DeskSlip[]>([]);
  const justFiledId = foreground.kind === 'receipt' ? foreground.recordId : null;

  useEffect(() => {
    if (!historyReady || !justFiledId) return;
    const element = document.querySelector('[data-just-filed="true"]') as HTMLElement | null;
    element?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  }, [historyReady, justFiledId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setSlips(loadDeskSlips(window.localStorage, 'jesse')); }
    catch { setSlips([]); }
  }, [records, historyReady]);

  const takeCopy = (format: JesseLedgerFormat) => {
    const ok = downloadJesseLedger(records, format);
    setExportNote(ok ? 'A paper copy is in your downloads.' : 'The copy could not be made here.');
  };

  if (!storageError && historyReady && records.length === 0 && slips.length === 0) {
    return (
      <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title" data-foreground={foreground.kind}>
        <div className={styles.ledgerTrayHead}>
          <p className={styles.eyebrow}>YOUR RECORD</p>
          <span className={styles.boardTally}>CLEAR</span>
        </div>
        <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your Solana record.</h2>
        <div className={styles.ledgerEmpty}>
          <p>No paper on file yet — file your first Jesse instruction above. Kept in this browser only.</p>
        </div>
      </section>
    );
  }

  const preview = records.slice(0, 5);
  const groups = groupJesseRecordsByDay(preview);
  const older = Math.max(0, records.length - preview.length);

  return (
    <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title" data-foreground={foreground.kind}>
      <div className={styles.ledgerTrayHead}>
        <p className={styles.eyebrow}>YOUR RECORD</p>
        <span className={styles.boardTally}>{records.length}</span>
      </div>
      <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your Solana record.</h2>
      {storageError && <p className={styles.notice} role="alert">{storageError}</p>}
      {foreground.kind === 'receipt' && (
        <p className={styles.notice} role="status">Just filed — see the highlighted line. Kept in this browser.</p>
      )}
      <ul className={styles.ledgerPreview}>
        {groups.map(group => (
          <li key={group.label}>
            <p className={styles.ledgerDay}>{group.label}</p>
            <ul>
              {group.records.map(record => {
                const entry = compactJesseEntry(record);
                const active = viewedRecordId === record.id || justFiledId === record.id;
                return (
                  <li key={record.id} data-just-filed={justFiledId === record.id ? 'true' : undefined}>
                    <button
                      type="button"
                      className={styles.ledgerLine}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => openRecord(record.id)}
                    >
                      <strong>{entry.side.toUpperCase()} {entry.symbol}</strong>
                      <span>{entry.amount}</span>
                      <small>{formatRecordedTime(entry.createdAt)}</small>
                    </button>
                    <button type="button" className={styles.ledgerDelete} onClick={() => removeRecord(record.id)} aria-label={`Delete ${entry.symbol} record`}>
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      {older > 0 && (
        <details className={styles.ledgerArchive}>
          <summary>The archive · {older} more</summary>
          <ul>
            {records.slice(5).map(record => {
              const entry = compactJesseEntry(record);
              return (
                <li key={record.id}>
                  <button type="button" className={styles.ledgerLine} onClick={() => openRecord(record.id)}>
                    <strong>{entry.side.toUpperCase()} {entry.symbol}</strong>
                    <span>{entry.amount}</span>
                    <small>{formatRecordedTime(entry.createdAt)}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {slips.length > 0 && (
        <div className={styles.deskSlips}>
          <p className={styles.eyebrow}>DESK SLIPS</p>
          {slips.map(slip => (
            <p key={slip.id} className={styles.deskSlip}>{slip.instruction}<small>{slip.disclaimer}</small></p>
          ))}
        </div>
      )}
      <div className={styles.ledgerExport}>
        <button type="button" onClick={() => takeCopy('csv')}>Copy CSV</button>
        <button type="button" onClick={() => takeCopy('json')}>Copy JSON</button>
        {exportNote && <span role="status">{exportNote}</span>}
      </div>
    </section>
  );
});
