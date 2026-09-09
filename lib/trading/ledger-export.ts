import { DESK_INSTRUMENTS } from './catalog';
import type { PaperRecord } from './paper-records';

/**
 * Take a copy of the paper ledger. The desk's error copy has always promised
 * an export; this is that door. The export is a client-side convenience copy
 * of browser-local simulations — not a statement, not a position report.
 */

export type LedgerFormat = 'csv' | 'json';

const CSV_HEADER = ['recorded', 'symbol', 'action', 'spend', 'received', 'record', 'pool'] as const;

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
