/**
 * Jesse ledger export — v2 records with frozen comparison and multiplier.
 */
import type { JessePaperRecord } from './paper';

export type JesseLedgerFormat = 'csv' | 'json';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function jesseLedgerCsv(records: readonly JessePaperRecord[]): string {
  const header = [
    'id', 'createdAt', 'symbol', 'side', 'amount', 'unit',
    'inputAmount', 'inputSymbol', 'outputAmount', 'outputSymbol',
    'multiplier', 'amountInRaw', 'amountOutRaw',
    'comparisonStatus', 'referenceDifferenceBps', 'providerRequestId',
  ].join(',');
  const rows = records.map(r => {
    const q = r.quote;
    return [
      r.id,
      new Date(r.createdAt).toISOString(),
      r.instrumentSnapshot.symbol,
      q.intent.side,
      q.intent.amount,
      q.intent.unit,
      q.inputAmount,
      q.inputSymbol,
      q.outputAmount,
      q.outputSymbol,
      q.scaling.multiplier,
      q.amountInRaw,
      q.amountOutRaw,
      r.comparison?.status ?? '',
      r.comparison?.referenceDifferenceBps ?? '',
      q.providerRequestId,
    ].map(v => csvEscape(String(v))).join(',');
  });
  return [header, ...rows].join('\n');
}

export function jesseLedgerJson(records: readonly JessePaperRecord[]): string {
  return JSON.stringify(records, null, 2);
}

export function downloadJesseLedger(records: readonly JessePaperRecord[], format: JesseLedgerFormat): boolean {
  try {
    const body = format === 'csv' ? jesseLedgerCsv(records) : jesseLedgerJson(records);
    const type = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `claflin-jesse-ledger-${new Date().toISOString().slice(0, 10)}.${format}`;
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
