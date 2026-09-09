'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { compactPaperEntry, formatRecordedTime, groupRecordsByDay, ledgerPreview } from '@/lib/trading/desk-documents';
import { PaperHistory } from './PaperHistory';
import styles from './WorkingDesk.module.css';

export const PaperLedger = memo(function PaperLedger({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { records, historyReady, storageError, loadHistory, focusedRecordId, openRecord, foreground } = desk;
  if (!storageError && historyReady && records.length === 0) return null;
  const justFiledId = foreground.kind === 'receipt' ? foreground.recordId : null;
  const preview = ledgerPreview(records, focusedRecordId);
  const groups = groupRecordsByDay(preview);
  const older = Math.max(0, records.length - preview.length);

  return (
    <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title">
      <div className={styles.ledgerTrayHead}>
        <p className={styles.eyebrow}>PAPER LEDGER</p>
        {historyReady && <span className={styles.boardTally}>{records.length === 1 ? '1 ON FILE' : `${records.length} ON FILE`}</span>}
      </div>
      <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your record.</h2>
      {storageError && <div role="alert"><p>{storageError}</p><button type="button" onClick={loadHistory}>Retry reading history</button></div>}
      {historyReady && (
        <div className={styles.ledgerPreview}>
          {groups.map(group => (
            <div key={group.label} className={styles.ledgerDayGroup}>
              <h3 className={styles.ledgerDay}>{group.label}</h3>
              <ol className={styles.ledgerLines}>
                {group.records.map(record => {
                  const entry = compactPaperEntry(record);
                  const current = entry.id === focusedRecordId;
                  const justFiled = entry.id === justFiledId;
                  return (
                    <li key={entry.id} data-current={current ? 'true' : 'false'} data-just-filed={justFiled ? 'true' : 'false'}>
                      <button type="button" onClick={() => openRecord(entry.id)} aria-current={current ? 'true' : undefined}>
                        <strong>{entry.symbol} · {entry.action}{justFiled ? ' · Just filed' : ''}</strong>
                        <span>{entry.exchange}</span>
                        <time dateTime={new Date(entry.recordedAt).toISOString()}>{formatRecordedTime(entry.recordedAt)}</time>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
      {historyReady && older > 0 && <p className={styles.ledgerMore}>{older} older in the archive</p>}
      {historyReady && records.length > 0 && (
        <details className={styles.ledgerArchive}>
          <summary>The archive</summary>
          <p className={styles.ledgerTrust}>Kept in this browser. Sign in copies records to your account; deleting here does not remove that copy.</p>
          <PaperHistory desk={desk} embedded />
        </details>
      )}
    </section>
  );
});
