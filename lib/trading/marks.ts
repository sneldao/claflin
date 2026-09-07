import { ethers } from 'ethers';
import { BASE, baseRpcCandidates, feedAbi, isTransientRpcError, withRpcRetry } from './aerodrome';
import { DESK_INSTRUMENTS } from './catalog';
import { referenceObservation } from './quotes';
import type { DeskMark, MarksResult } from './marks-shared';

export type { DeskMark, MarksResult } from './marks-shared';

/**
 * Desk reference marks — Chainlink total-return observations for each
 * quote-supported instrument. These are reference valuations, NOT venue
 * offers: the tape displays them as indicative, and they never gate or
 * substitute for a reviewed estimate.
 */

export type FeedReading = { answer: bigint; decimals: number; updatedAt: number } | null;
export type FeedReader = (feeds: readonly string[]) => Promise<FeedReading[]>;

/** Read each Chainlink feed once per RPC candidate, tolerating per-feed failure. */
export function createChainlinkFeedReader(): FeedReader {
  return async (feeds) => {
    let last: unknown;
    for (const rpcUrl of baseRpcCandidates()) {
      const request = new ethers.FetchRequest(rpcUrl);
      request.timeout = 8000;
      const provider = new ethers.JsonRpcProvider(request, BASE, { staticNetwork: true, batchMaxCount: 10, batchStallTime: 16 });
      try {
        return await withRpcRetry(async () => {
          return await Promise.all(feeds.map(async (feedAddress) => {
            try {
              const feed = new ethers.Contract(feedAddress, feedAbi, provider);
              const [round, decimals] = await Promise.all([feed.latestRoundData(), feed.decimals()]);
              return { answer: BigInt(round.answer), decimals: Number(decimals), updatedAt: Number(round.updatedAt) };
            } catch { return null; }
          }));
        });
      } catch (error) {
        last = error;
        if (!isTransientRpcError(error)) throw error;
      } finally {
        provider.destroy();
      }
    }
    throw last instanceof Error ? last : new Error('marks_unavailable');
  };
}

export function createMarksService(readFeeds: FeedReader, clock = Date.now) {
  return async (): Promise<MarksResult> => {
    const instruments = DESK_INSTRUMENTS.filter(s => s.quoteSupported);
    const readings = await readFeeds(instruments.map(s => s.chainlinkFeed));
    const now = clock();
    return {
      asOf: now,
      marks: instruments.map((stock, i) => ({
        instrumentId: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        reference: referenceObservation(readings[i] ?? null, now),
      })),
    };
  };
}
