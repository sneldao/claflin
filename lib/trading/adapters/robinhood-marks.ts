import { ROBINHOOD_INSTRUMENTS } from '../../robinhood/catalog';
import { createRobinhoodFeedReader, type RobinhoodFeedReading } from '../../robinhood/chain';
import { fetchRhjPrices } from '../../robinhood/rhj';
import { referenceObservation } from '../quotes';
import { TradingError } from '../domain';
import type { DeskMark, MarksResult } from '../marks-shared';
import type { MarkAdapter } from '../adapters';

type FeedReader = (feeds: readonly string[]) => Promise<RobinhoodFeedReading[]>;

/**
 * Robinhood marks — Isabel's desk. The onchain Chainlink feed is the mark
 * (multiplier-adjusted token price, 24/5); the issuer's rhj `tokenBid`/
 * `tokenAsk` mid rides along as `stockReference` when both legs answered, so
 * the tape can show the onchain-versus-issuer gap without a second read.
 * Weekend staleness is honest — the 86400s heartbeat means Friday's last
 * print still displays, labelled.
 */
export function createRobinhoodMarkAdapter(readFeeds: FeedReader = createRobinhoodFeedReader()): MarkAdapter {
  return {
    source: 'chainlink',
    market: 'Robinhood Chain',
    async read(): Promise<MarksResult> {
      const instruments = ROBINHOOD_INSTRUMENTS.filter(i => i.quoteSupported);
      const [readings, prices] = await Promise.all([
        readFeeds(instruments.map(i => i.chainlinkFeed)),
        fetchRhjPrices().catch(() => null),
      ]);
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
