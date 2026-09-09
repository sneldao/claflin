import { createChainlinkFeedReader, createMarksService } from '../marks';
import type { MarksResult } from '../marks-shared';
import type { MarkAdapter } from '../adapters';

/**
 * Chainlink reference-feed adapter — Hetty's Base desk. Indicative
 * total-return observations, never venue offers.
 */
export const chainlinkMarkAdapter: MarkAdapter = {
  source: 'chainlink',
  market: 'Base',
  read(): Promise<MarksResult> {
    return createMarksService(createChainlinkFeedReader())();
  },
};
