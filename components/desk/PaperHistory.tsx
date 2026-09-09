'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { compactPaperEntry, formatRecordedWhen } from '@/lib/trading/desk-documents';
import styles from './WorkingDesk.module.css';

export const PaperHistory = memo(function PaperHistory({ desk, embedded = false }: { desk: ReturnType<typeof useTradingDesk>; embedded?: boolean }) {
  const { records, focusedRecordId, openRecord, removeRecord } = desk;
  const auth = useDeskAuth();
  if (records.length === 0) return null;

  return <section id={embedded ? undefined : 'paper-history'} className={embedded ? styles.historyEmbed : styles.history} aria-labelledby={embedded ? undefined : 'history-title'}>
    {!embedded && <div>
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>THE ARCHIVE</p>
        <span className={styles.boardTally}>{records.length === 1 ? '1 ON FILE' : `${records.length} ON FILE`}</span>
      </div>
      <h2 id="history-title">Every filed paper.</h2>
      <p>Simulations, not live positions. Quoted time is secondary to when it was recorded.</p>
    </div>}
    {records.map(record => {
      const entry = compactPaperEntry(record);
      return <article key={record.id} className={styles.record} data-current={record.id === focusedRecordId ? 'true' : 'false'}>
        <div>
          <span>PAPER TRADE · {formatRecordedWhen(record.createdAt)}</span>
          <h3>{entry.symbol} · {entry.action}</h3>
          <p>{entry.exchange}</p>
        </div>
        {!embedded && <button type="button" onClick={() => openRecord(record.id)}>Open this record</button>}
        <details><summary>Record details</summary>
          <p>{record.quote.assumptions}</p>
          <p>Quoted {new Date(record.quote.quotedAt).toLocaleString()} · Recorded {new Date(record.createdAt).toLocaleString()}</p>
          <p>Base block {record.quote.blockNumber} · Pool <code>{record.quote.poolAddress}</code> · Quote {record.id}</p>
          <button type="button" onClick={() => { if (window.confirm(auth.authenticated ? 'Delete this paper record from this browser? The copy on your account is not removed.' : 'Delete this paper record from this browser? This cannot be undone.')) removeRecord(record.id); }}>Delete this paper record</button>
        </details>
      </article>;
    })}
  </section>;
});
