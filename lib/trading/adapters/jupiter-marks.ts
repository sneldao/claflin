import { SOLANA_INSTRUMENTS } from '../../solana/catalog';
import { readVenueDuplex } from '../../solana/market/venue-duplex';
import { TradingError } from '../domain';
import type { DeskMark, MarksResult } from '../marks-shared';
import type { MarkAdapter } from '../adapters';

type DuplexReader = (args: { instrumentId: string }) => ReturnType<typeof readVenueDuplex>;

/**
 * Jupiter venue marks — Jesse's Solana desk. The venue-duplex reader is the
 * single source of truth: the venue leg becomes the mark, and when both legs
 * were comparable the issuer/stock reference rides along as `stockReference`
 * so the desk can show the onchain-versus-reference gap without a second read.
 */
export function createJupiterMarkAdapter(read: DuplexReader = readVenueDuplex): MarkAdapter {
  return {
    source: 'jupiter-price-v3',
    market: 'Solana',
    async read(): Promise<MarksResult> {
      const instruments = SOLANA_INSTRUMENTS.filter(i => i.quoteSupported);
      const duplexes = await Promise.all(instruments.map(i => read({ instrumentId: i.id })));
      const marks: DeskMark[] = instruments.map((instrument, i) => {
        const duplex = duplexes[i];
        return {
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          name: instrument.name,
          reference: {
            status: duplex.venuePrice ? 'observed' : 'unavailable',
            source: 'jupiter-price-v3',
            priceUsdPerToken: duplex.venuePrice ?? undefined,
            updatedAt: duplex.observedAt,
            session: 'unknown',
            pauseStatus: 'unchecked',
          },
          ...(duplex.status === 'comparable' && duplex.referencePrice && duplex.referenceSource
            ? {
                stockReference: {
                  priceUsd: duplex.referencePrice,
                  source: duplex.referenceSource,
                  differenceBps: duplex.referenceDifferenceBps,
                },
              }
            : {}),
        };
      });
      if (marks.every(mark => !mark.reference.priceUsdPerToken)) {
        throw new TradingError('marks_unavailable', 'Jupiter venue marks are unavailable. Estimates are unaffected.', 503);
      }
      return { asOf: Date.now(), marks };
    },
  };
}

export const jupiterMarkAdapter = createJupiterMarkAdapter();
