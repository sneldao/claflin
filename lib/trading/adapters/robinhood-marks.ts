import { ROBINHOOD_INSTRUMENTS } from '../../robinhood/catalog';
import { createRobinhoodFeedReader, type RobinhoodFeedReading } from '../../robinhood/chain';
import { fetchRhjPrices } from '../../robinhood/rhj';
import { fetchLighterBook, fetchLighterBookStats, topOfBook, type LighterBook, type LighterBookStats } from '../../robinhood/lighter';
import { referenceObservation } from '../quotes';
import { TradingError } from '../domain';
import type { DeskMark, MarksResult } from '../marks-shared';
import type { MarkAdapter } from '../adapters';

type FeedReader = (feeds: readonly string[]) => Promise<RobinhoodFeedReading[]>;
type BookReader = (marketId: number) => Promise<LighterBook>;
type BookStatsReader = () => Promise<Map<number, LighterBookStats>>;

/**
 * Robinhood marks — Isabel's desk. The onchain Chainlink feed is the mark
 * (multiplier-adjusted token price, 24/5); the issuer's rhj `tokenBid`/
 * `tokenAsk` mid rides along as `stockReference` when both legs answered, so
 * the tape can show the onchain-versus-issuer gap without a second read.
 * Weekend staleness is honest — the 86400s heartbeat means Friday's last
 * print still displays, labelled.
 */
export function createRobinhoodMarkAdapter(
  readFeeds: FeedReader = createRobinhoodFeedReader(),
  readBook: BookReader = fetchLighterBook,
  readBookStats: BookStatsReader = fetchLighterBookStats,
  readPrices: typeof fetchRhjPrices = fetchRhjPrices,
): MarkAdapter {
  return {
    source: 'chainlink',
    market: 'Robinhood Chain',
    async read(): Promise<MarksResult> {
      const instruments = ROBINHOOD_INSTRUMENTS.filter(i => i.quoteSupported);
      const [readings, prices, bookStats] = await Promise.all([
        readFeeds(instruments.map(i => i.chainlinkFeed)),
        readPrices().catch(() => null),
        readBookStats().catch(() => null),
      ]);
      // Read Lighter books in parallel — each book's failure is local
      // to its instrument, not the whole read.
      const books = await Promise.all(
        instruments.map(instrument => readBook(instrument.lighterMarketId).catch(() => null)),
      );
      const now = Date.now();
      const marks: DeskMark[] = instruments.map((instrument, i) => {
        const reference = referenceObservation(readings[i] ?? null, now);
        const row = prices?.get(instrument.symbol);
        const tokenMid = row && row.tokenBid !== null && row.tokenBid > 0 && row.tokenAsk !== null && row.tokenAsk > 0
          ? (row.tokenBid + row.tokenAsk) / 2
          : null;
        const onchain = reference.priceUsdPerToken ? Number(reference.priceUsdPerToken) : null;
        const differenceBps = tokenMid !== null && onchain !== null
          ? (Math.round(10_000 * (tokenMid / onchain - 1) * 10) / 10).toFixed(1)
          : null;
        // The venue mark: the midpoint of the Lighter best bid/ask,
        // when the book is real. The stats carry realized 24h volume
        // when present.
        const book = books[i];
        let venueMark: DeskMark['venueMark'] | undefined;
        if (book) {
          const top = topOfBook(book);
          if (top.midPrice !== null) {
            const stats = bookStats?.get(instrument.lighterMarketId);
            venueMark = {
              priceUsd: top.midPrice,
              source: 'lighter' as const,
              observedAt: now,
              volume24hUsd: stats?.dailyQuoteVolume ?? null,
            };
          }
        }
        return {
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          name: instrument.name,
          reference,
          ...(tokenMid !== null
            ? {
                stockReference: {
                  priceUsd: tokenMid.toPrecision(12).replace(/\.?0+$/, ''),
                  source: 'robinhood' as const,
                  differenceBps,
                  halted: row?.halted === true,
                },
              }
            : {}),
          ...(venueMark ? { venueMark } : {}),
        };
      });
      if (marks.every(mark => !mark.reference.priceUsdPerToken)) {
        throw new TradingError('marks_unavailable', 'Onchain marks are unavailable. Estimates are unaffected.', 503);
      }
      return { asOf: now, marks };
    },
  };
}

export const robinhoodMarkAdapter = createRobinhoodMarkAdapter();
