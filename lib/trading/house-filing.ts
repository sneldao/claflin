import type { HouseDeskId } from '@/lib/house';
import { HETTY_VOCAB, JESSE_VOCAB, slipOneLine, type SlipQuoteLike } from '@/lib/desk/written-slip';
import { loadJessePaperRecords } from '@/lib/solana/paper';
import { loadTenniePaperRecords } from '@/lib/robinhood/paper';
import { loadHalleyPaperRecords } from '@/lib/meteora/paper';
import { loadPaperRecords, type PaperStorage } from './paper-records';

export type HouseFiling = {
  deskId: Extract<HouseDeskId, 'hetty' | 'jesse' | 'tennie' | 'halley'>;
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
  try {
    for (const record of loadTenniePaperRecords(storage)) {
      candidates.push({
        deskId: 'tennie',
        recordId: record.id,
        createdAt: record.createdAt,
        sentence: record.quote.intent.side === 'buy'
          ? `Bought ${record.quote.outputAmount} ${record.instrumentSnapshot.symbol} for ${record.quote.inputAmount} USDG`
          : `Sold ${record.quote.inputAmount} ${record.instrumentSnapshot.symbol} for ${record.quote.outputAmount} USDG`,
      });
    }
  } catch {
    /* An unreadable Tennie book stays out of the hero. */
  }
  try {
    for (const record of loadHalleyPaperRecords(storage)) {
      const i = record.estimate.intent;
      candidates.push({
        deskId: 'halley',
        recordId: record.id,
        createdAt: record.createdAt,
        sentence: `Launch ${i.symbol} · ${i.quoteSymbol} quote · ${i.curve}`,
      });
    }
  } catch {
    /* An unreadable Halley book stays out of the hero. */
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
