import { DESK_INSTRUMENTS } from './catalog';
import type { PaperRecord } from './paper-records';
import type { LiveJournalEntry } from './live-journal';
import { compactLiveEntry } from './live-journal';

/**
 * Take a copy of the paper ledger or live journal. The export is a
 * client-side convenience copy — paper rows are simulations; live rows are
 * historical transactions with provenance, never positions.
 */

export type LedgerFormat = 'csv' | 'json';

const CSV_HEADER = ['recorded', 'symbol', 'action', 'spend', 'received', 'record', 'pool'] as const;
const LIVE_CSV_HEADER = ['updated', 'kind', 'status', 'symbol', 'action', 'reviewed', 'observed', 'fee_eth', 'hash', 'block', 'note'] as const;

function symbolFor(record: PaperRecord): string {
  return DESK_INSTRUMENTS.find(item => item.id === record.quote.intent.instrumentId)?.symbol ?? record.quote.outputSymbol;
}

function recordedAt(record: PaperRecord): string {
  return new Date(record.createdAt).toISOString();
}

export function ledgerFilename(now: Date, format: LedgerFormat): string {
  const date = now.toISOString().slice(0, 10);
  return `claflin-paper-ledger-${date}.${format}`;
}

export function liveJournalFilename(now: Date, format: LedgerFormat): string {
  const date = now.toISOString().slice(0, 10);
  return `claflin-live-journal-${date}.${format}`;
}

export function ledgerCsv(records: readonly PaperRecord[]): string {
  const rows = records.map(record => {
    const quote = record.quote;
    const cells = [
      recordedAt(record),
      symbolFor(record),
      quote.intent.side === 'buy' ? 'paper buy' : 'paper sell',
      `${quote.inputAmount} ${quote.inputSymbol}`,
      `${quote.outputAmount} ${quote.outputSymbol}`,
      record.id,
      quote.poolAddress,
    ];
    return cells.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
  });
  return [CSV_HEADER.join(','), ...rows].join('\n');
}

export function ledgerJson(records: readonly PaperRecord[]): string {
  const payload = {
    kind: 'claflin-paper-ledger' as const,
    mode: 'paper' as const,
    exportedAt: new Date().toISOString(),
    note: 'Browser-local paper simulations, not fills, submissions, or positions.',
    records: records.map(record => ({
      id: record.id,
      recordedAt: recordedAt(record),
      deskId: record.deskId,
      symbol: symbolFor(record),
      side: record.quote.intent.side,
      spend: `${record.quote.inputAmount} ${record.quote.inputSymbol}`,
      received: `${record.quote.outputAmount} ${record.quote.outputSymbol}`,
      shareEquivalent: record.quote.shareEquivalent,
      quotedAt: new Date(record.quote.quotedAt).toISOString(),
      pool: record.quote.poolAddress,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function buildLedgerExport(records: readonly PaperRecord[], format: LedgerFormat, now = new Date()): { filename: string; body: string; type: string } {
  if (format === 'csv') return { filename: ledgerFilename(now, 'csv'), body: ledgerCsv(records), type: 'text/csv' };
  return { filename: ledgerFilename(now, 'json'), body: ledgerJson(records), type: 'application/json' };
}

/** Browser-side download. Returns false when the environment refuses (SSR, blocked). */
export function downloadLedger(records: readonly PaperRecord[], format: LedgerFormat): boolean {
  if (typeof document === 'undefined' || records.length === 0) return false;
  try {
    const { filename, body, type } = buildLedgerExport(records, format);
    const url = URL.createObjectURL(new Blob([body], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export function liveJournalCsv(entries: readonly LiveJournalEntry[]): string {
  const rows = entries.map(entry => {
    const compact = compactLiveEntry(entry);
    const cells = [
      new Date(entry.updatedAt).toISOString(),
      entry.kind,
      entry.settlement.status,
      compact.symbol,
      compact.action,
      `${entry.reviewed.inputAmount} ${entry.reviewed.inputSymbol} → ${entry.reviewed.outputAmount} ${entry.reviewed.outputSymbol}`,
      entry.settlement.amountInObserved && entry.settlement.amountOutObserved
        ? `${entry.settlement.amountInObserved} → ${entry.settlement.amountOutObserved}`
        : '',
      entry.settlement.feeEth ?? '',
      entry.hash,
      entry.settlement.blockNumber?.toString() ?? '',
      'Historical Base transaction — not a wallet holding; not a paper simulation.',
    ];
    return cells.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
  });
  return [LIVE_CSV_HEADER.join(','), ...rows].join('\n');
}

export function liveJournalJson(entries: readonly LiveJournalEntry[]): string {
  const payload = {
    kind: 'claflin-live-journal' as const,
    mode: 'live' as const,
    exportedAt: new Date().toISOString(),
    note: 'Browser-local live execution evidence on Base. Historical transactions, not current holdings. Reviewed terms are stored separately from confirmed outcomes.',
    entries: entries.map(entry => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.settlement.status,
      deskId: entry.deskId,
      walletAddress: entry.walletAddress,
      hash: entry.hash,
      updatedAt: new Date(entry.updatedAt).toISOString(),
      reviewed: entry.reviewed,
      settlement: entry.settlement,
      slippageBps: entry.slippageBps,
      isPosition: false,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function buildLiveJournalExport(entries: readonly LiveJournalEntry[], format: LedgerFormat, now = new Date()): { filename: string; body: string; type: string } {
  if (format === 'csv') return { filename: liveJournalFilename(now, 'csv'), body: liveJournalCsv(entries), type: 'text/csv' };
  return { filename: liveJournalFilename(now, 'json'), body: liveJournalJson(entries), type: 'application/json' };
}

export function downloadLiveJournal(entries: readonly LiveJournalEntry[], format: LedgerFormat): boolean {
  if (typeof document === 'undefined' || entries.length === 0) return false;
  try {
    const { filename, body, type } = buildLiveJournalExport(entries, format);
    const url = URL.createObjectURL(new Blob([body], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
