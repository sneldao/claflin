import type { HouseDeskId } from '@/lib/house';
import { HETTY_VOCAB, JESSE_VOCAB, slipOneLine, type SlipQuoteLike } from '@/lib/desk/written-slip';
import { loadJessePaperRecords } from '@/lib/solana/paper';
import { loadPaperRecords, type PaperStorage } from './paper-records';

export type HouseFiling = {
  deskId: Extract<HouseDeskId, 'hetty' | 'jesse'>;
  recordId: string;
  sentence: string;
  createdAt: number;
};

function pushQuote(
  candidates: HouseFiling[],
  deskId: HouseFiling['deskId'],
  recordId: string,
  createdAt: number,
  quote: SlipQuoteLike,
) {
  candidates.push({
    deskId,
    recordId,
    createdAt,
    sentence: slipOneLine(quote, deskId === 'jesse' ? JESSE_VOCAB : HETTY_VOCAB),
  });
}

/** The newest paper sentence this browser still holds, across both open desks. */
export function latestHouseFiling(storage: PaperStorage): HouseFiling | null {
  const candidates: HouseFiling[] = [];
  try {
    for (const record of loadPaperRecords(storage, 'hetty')) {
      pushQuote(candidates, 'hetty', record.id, record.createdAt, record.quote);
    }
  } catch {
    /* An unreadable Hetty book stays out of the hero. */
  }
  try {
    for (const record of loadJessePaperRecords(storage)) {
      pushQuote(candidates, 'jesse', record.id, record.createdAt, record.quote);
    }
  } catch {
    /* An unreadable Jesse book stays out of the hero. */
  }
  candidates.sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0] ?? null;
}

/** Calendar label for a filing, relative to the moment the house is read. */
export function filingWhen(createdAt: number, now = Date.now()): string {
  const filed = new Date(createdAt);
  const today = new Date(now);
  if (filed.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (filed.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return filed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
