/**
 * Jesse foreground document — same policy as Hetty's foregroundDocument,
 * over JesseDeskStage and v2 paper records.
 */
import type { JesseDeskState } from './controller';
import type { JessePaperRecord } from './paper';
import type { DeskForeground } from '../desk/contracts';

export type JesseForeground = DeskForeground;

export function jesseForeground(
  state: JesseDeskState,
  viewedRecordId: string | null,
  records: JessePaperRecord[] | undefined,
): JesseForeground {
  if (viewedRecordId) {
    if (!records) return { kind: 'archive', recordId: viewedRecordId };
    const found = records.find(r => r.id === viewedRecordId);
    if (!found) return { kind: 'missing', recordId: viewedRecordId };
    if (state.stage === 'saved' && state.quote?.id === viewedRecordId) {
      return { kind: 'receipt', recordId: viewedRecordId };
    }
    return { kind: 'archive', recordId: viewedRecordId };
  }
  if (state.stage === 'quoting') return { kind: 'pending' };
  if (state.stage === 'review' && state.quote) {
    return { kind: 'quotation', quoteId: state.quote.id };
  }
  if (state.stage === 'saved' && state.quote) {
    return { kind: 'receipt', recordId: state.quote.id };
  }
  return { kind: 'draft' };
}

export function compactJesseEntry(record: JessePaperRecord): {
  id: string;
  symbol: string;
  side: string;
  amount: string;
  createdAt: number;
} {
  const { quote, instrumentSnapshot, createdAt, id } = record;
  return {
    id,
    symbol: instrumentSnapshot.symbol,
    side: quote.intent.side,
    amount: quote.intent.side === 'buy'
      ? `${quote.intent.amount} USDC`
      : `${quote.intent.amount} ${instrumentSnapshot.symbol}`,
    createdAt,
  };
}

export function groupJesseRecordsByDay(
  records: JessePaperRecord[],
  now = Date.now(),
): { label: string; records: JessePaperRecord[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const yesterday = today - 86_400_000;
  const groups = new Map<string, JessePaperRecord[]>();
  for (const record of records) {
    const day = new Date(record.createdAt);
    day.setHours(0, 0, 0, 0);
    const t = day.getTime();
    const label = t === today ? 'Today' : t === yesterday ? 'Yesterday' : day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const list = groups.get(label) ?? [];
    list.push(record);
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, group]) => ({ label, records: group }));
}
