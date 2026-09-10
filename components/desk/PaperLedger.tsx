'use client';

import { memo, useEffect, useState } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { compactPaperEntry, formatRecordedTime, groupRecordsByDay, ledgerPreview } from '@/lib/trading/desk-documents';
import { downloadLedger, downloadLiveJournal, type LedgerFormat } from '@/lib/trading/ledger-export';
import { compactLiveEntry, type LiveJournalEntry } from '@/lib/trading/live-journal';
import { getBaseExplorerTxUrl } from '@/lib/base-chain';
import { PaperHistory } from './PaperHistory';
import styles from './WorkingDesk.module.css';

export const PaperLedger = memo(function PaperLedger({
  desk,
  liveEntries = [],
  liveReady = true,
  liveReconciling = false,
}: {
  desk: ReturnType<typeof useTradingDesk>;
  liveEntries?: readonly LiveJournalEntry[];
  liveReady?: boolean;
  liveReconciling?: boolean;
}) {
  const { records, historyReady, storageError, loadHistory, focusedRecordId, openRecord, foreground } = desk;
  const [exportNote, setExportNote] = useState<string | null>(null);
  const takeCopy = (format: LedgerFormat) => {
    const ok = downloadLedger(records, format);
    setExportNote(ok ? 'A paper copy is in your downloads.' : 'The copy could not be made here.');
  };
  const takeLiveCopy = (format: LedgerFormat) => {
    const ok = downloadLiveJournal(liveEntries, format);
    setExportNote(ok ? 'A live journal copy is in your downloads.' : 'The live copy could not be made here.');
  };
  const justFiledId = foreground.kind === 'receipt' ? foreground.recordId : null;
  useEffect(() => {
    if (!historyReady || !justFiledId) return;
    const element = document.querySelector('[data-just-filed="true"]') as HTMLElement | null;
    element?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  }, [historyReady, justFiledId]);
  const ticketNow = foreground.kind === 'quotation'
    ? 'A quotation is on the ticket — nothing filed yet.'
    : foreground.kind === 'receipt'
      ? 'Just filed — see the highlighted line.'
      : foreground.kind === 'archive'
        ? 'Reading a filed record — the ticket is read-only.'
        : foreground.kind === 'pending'
          ? 'An estimate is on its way — nothing to file yet.'
          : null;

  const emptyPaper = !storageError && historyReady && records.length === 0;
  const emptyLive = liveReady && liveEntries.length === 0;
  const livePreview = liveEntries.slice(0, 5);

  if (emptyPaper && emptyLive) {
    return (
      <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title" data-foreground={foreground.kind}>
        <div className={styles.ledgerTrayHead}>
          <p className={styles.eyebrow}>YOUR RECORD</p>
          <span className={styles.boardTally}>CLEAR</span>
        </div>
        <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your record.</h2>
        <div className={styles.ledgerEmpty}>
          <p>No paper or live evidence on file yet. Simulations land as paper; Base transactions land in the live journal.</p>
        </div>
      </section>
    );
  }

  const preview = ledgerPreview(records, focusedRecordId);
  const groups = groupRecordsByDay(preview);
  const older = Math.max(0, records.length - preview.length);

  return (
    <section id="paper-ledger" className={styles.paperLedger} aria-labelledby="ledger-title" data-foreground={foreground.kind}>
      <div className={styles.ledgerTrayHead}>
        <p className={styles.eyebrow}>YOUR RECORD</p>
        {(historyReady || liveReady) && (
          <span className={styles.boardTally}>
            {records.length === 1 ? '1 PAPER' : `${records.length} PAPER`}
            {liveEntries.length ? ` · ${liveEntries.length} LIVE` : ''}
          </span>
        )}
      </div>
      <h2 id="ledger-title" className={styles.ledgerTrayTitle}>Your record.</h2>
      {ticketNow && <p className={styles.ledgerMore} role="status">{ticketNow}</p>}
      {liveReconciling && <p className={styles.ledgerMore} role="status">Reconciling open Base transactions — nothing is being resubmitted.</p>}
      {storageError && <div role="alert"><p>{storageError}</p><button type="button" onClick={loadHistory}>Retry reading history</button></div>}

      {liveReady && livePreview.length > 0 && (
        <div className={styles.ledgerPreview} data-live-journal="true">
          <h3 className={styles.ledgerDay}>Live journal · Base</h3>
          <p className={styles.ledgerTrust}>Historical transactions. Not wallet holdings. Not paper simulations.</p>
          <ol className={styles.ledgerLines}>
            {livePreview.map(entry => {
              const compact = compactLiveEntry(entry);
              return (
                <li key={entry.id} data-live="true">
                  <a href={getBaseExplorerTxUrl(entry.hash)} target="_blank" rel="noreferrer">
                    <strong>{compact.symbol} · {compact.action}</strong>
                    <span>{compact.exchange}</span>
                    <time dateTime={new Date(compact.recordedAt).toISOString()}>{formatRecordedTime(compact.recordedAt)}</time>
                  </a>
                  <details>
                    <summary>Evidence</summary>
                    <p>{entry.settlement.message}</p>
                    <p>Reviewed terms: {entry.reviewed.inputAmount} {entry.reviewed.inputSymbol} → {entry.reviewed.outputAmount} {entry.reviewed.outputSymbol}</p>
                    {entry.settlement.feeEth && <p>Network fee ≈ {entry.settlement.feeEth} ETH</p>}
                    {entry.settlement.blockNumber != null && <p>Base block {entry.settlement.blockNumber}</p>}
                    <p>Tx <code>{entry.hash}</code></p>
                    <p>Document type: {entry.kind.replace(/-/g, ' ')} · not a position</p>
                  </details>
                </li>
              );
            })}
          </ol>
          {liveEntries.length > livePreview.length && (
            <p className={styles.ledgerMore}>{liveEntries.length - livePreview.length} older live {liveEntries.length - livePreview.length === 1 ? 'entry' : 'entries'} retained in this browser.</p>
          )}
          <div className={styles.ledgerExport} role="group" aria-label="Take a copy of the live journal">
            <button type="button" onClick={() => takeLiveCopy('csv')}>Live journal (CSV)</button>
            <button type="button" onClick={() => takeLiveCopy('json')}>Live journal (JSON)</button>
          </div>
        </div>
      )}

      {historyReady && records.length > 0 && (
        <div className={styles.ledgerPreview}>
          <h3 className={styles.ledgerDay}>Paper ledger</h3>
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
      {historyReady && older > 0 && <p className={styles.ledgerMore}>{older} older paper in the archive</p>}
      {exportNote && <p role="status" className={styles.ledgerMore}>{exportNote}</p>}
      {historyReady && records.length > 0 && (
        <details className={styles.ledgerArchive}>
          <summary>The paper archive</summary>
          <p className={styles.ledgerTrust}>Simulations kept in this browser. Sign in copies paper records to your account; deleting here does not remove that copy. Live journal entries stay local.</p>
          <div className={styles.ledgerExport} role="group" aria-label="Take a copy of the paper ledger">
            <button type="button" onClick={() => takeCopy('csv')}>Paper copy (CSV)</button>
            <button type="button" onClick={() => takeCopy('json')}>Paper copy (JSON)</button>
          </div>
          <PaperHistory desk={desk} embedded />
        </details>
      )}
    </section>
  );
});
