'use client';

import { memo } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import styles from './WorkingDesk.module.css';

export const PaperHistory = memo(function PaperHistory({ desk }: { desk: ReturnType<typeof useTradingDesk> }) {
  const { records, historyReady, storageError, loadHistory, edit, removeRecord } = desk;
  const auth = useDeskAuth();
  return <section id="paper-history" className={styles.history} aria-labelledby="history-title">
    <div>
      <div className={styles.boardHead}>
        <p className={styles.eyebrow}>RETURN TO YOUR WORK</p>
        {historyReady && <span className={styles.boardTally}>{records.length === 0 ? 'LEDGER BLANK' : `${records.length} ON FILE`}</span>}
      </div>
      <h2 id="history-title">Your paper record.</h2>
      <p>Saved in this browser first. Simulations, not live positions.</p>
    </div>
    {storageError && <div role="alert"><p>{storageError}</p><button type="button" onClick={loadHistory}>Retry reading history</button></div>}
    {historyReady && records.length === 0 && (
      <div className={styles.ledgerEmpty}>
        <p>The ledger is blank. Your first paper trade writes the first line.</p>
        <button type="button" onClick={() => document.getElementById('instruction')?.scrollIntoView({ block: 'start' })}>Draft an instruction</button>
      </div>
    )}
    {records.map(record => <article key={record.id} className={styles.record}>
      <div><span>PAPER TRADE · {new Date(record.createdAt).toLocaleString()}</span><h3>{record.quote.inputAmount} {record.quote.inputSymbol} → {record.quote.outputAmount} {record.quote.outputSymbol}</h3></div>
      <button type="button" onClick={() => { edit(record.quote.intent); document.getElementById('stock')?.focus(); document.getElementById('instruction')?.scrollIntoView({ block: 'start' }); }}>Use as a new draft</button>
      <details><summary>Record details</summary>
        <p>{record.quote.assumptions}</p>
        <p>Base block {record.quote.blockNumber} · Pool <code>{record.quote.poolAddress}</code> · Quote {record.id}</p>
        <button type="button" onClick={() => { if (window.confirm(auth.authenticated ? 'Delete this paper record from this browser? The copy on your account is not removed.' : 'Delete this paper record from this browser? This cannot be undone.')) removeRecord(record.id); }}>Delete this paper record</button>
      </details>
    </article>)}
  </section>;
});
