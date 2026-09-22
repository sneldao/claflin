/**
 * Jesse foreground document — same policy as Hetty's foregroundDocument,
 * over JesseDeskStage and v2 paper records.
 */
import type { JesseDeskState } from './controller';
import type { JessePaperRecord } from './paper';
import type { DeskForegroundDocument } from '../desk/contracts';

export type JesseForeground = DeskForegroundDocument;

/**
 * The one document under shared attention — the same DeskForegroundDocument
 * contract as every desk engine, over JesseDeskState and v2 paper records.
 */
export function jesseForeground(
  state: JesseDeskState,
  viewedRecordId: string | null,
  records: JessePaperRecord[] | undefined,
): JesseForeground {
  const viewed = viewedRecordId ? records?.find(r => r.id === viewedRecordId) : undefined;
  const instrumentId = viewed?.quote.intent.instrumentId
    ?? state.quote?.intent.instrumentId
    ?? state.draft.instrumentId
    ?? null;
  if (viewedRecordId) {
    if (!records) return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
    if (!viewed) return { kind: 'missing', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
    if (state.stage === 'saved' && state.quote?.id === viewedRecordId) {
      return { kind: 'receipt', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
    }
    return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
  }
  if (state.stage === 'quoting') {
    return { kind: 'pending', quoteId: null, recordId: null, instrumentId, actionable: false, readonly: false };
  }
  if (state.stage === 'review' && state.quote) {
    return { kind: 'quotation', quoteId: state.quote.id, recordId: null, instrumentId, actionable: true, readonly: false };
  }
  if (state.stage === 'saved' && state.quote) {
    return { kind: 'receipt', quoteId: state.quote.id, recordId: state.quote.id, instrumentId, actionable: false, readonly: true };
  }
  return { kind: 'draft', quoteId: null, recordId: null, instrumentId, actionable: true, readonly: false };
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
