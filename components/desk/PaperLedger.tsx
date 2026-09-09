'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { compactPaperEntry, formatRecordedTime } from '@/lib/trading/desk-documents';
import styles from './WorkingDesk.module.css';

export const PaperLedger = memo(function PaperLedger({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { records, historyReady, storageError, loadHistory, focusedRecordId, openRecord } = desk;
  if (!storageError && historyReady && records.length === 0) return null;

  return (
    <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title">
      <div className={styles.ledgerTrayHead}>
        <p className={styles.eyebrow}>PAPER LEDGER</p>
        {historyReady && <span className={styles.boardTally}>{records.length === 1 ? '1 ON FILE' : `${records.length} ON FILE`}</span>}
      </div>
      <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your record.</h2>
      {storageError && <div role="alert"><p>{storageError}</p><button type="button" onClick={loadHistory}>Retry reading history</button></div>}
      {historyReady && (
        <ol className={styles.ledgerLines}>
          {records.map(record => {
            const entry = compactPaperEntry(record);
            const current = entry.id === focusedRecordId;
            return (
              <li key={entry.id} data-current={current ? 'true' : 'false'}>
                <button type="button" onClick={() => openRecord(entry.id)} aria-current={current ? 'true' : undefined}>
                  <strong>{entry.symbol} · {entry.action}</strong>
                  <span>{entry.exchange}</span>
                  <time dateTime={new Date(entry.recordedAt).toISOString()}>Recorded {formatRecordedTime(entry.recordedAt)}</time>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
