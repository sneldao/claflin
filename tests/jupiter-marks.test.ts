import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJupiterMarkAdapter } from '../lib/trading/adapters/jupiter-marks';
import { buildVenueDuplex, unavailableVenueDuplex } from '../lib/solana/market/venue-duplex';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import type { SolanaInstrumentId } from '../lib/solana/contracts';

const quoted = SOLANA_INSTRUMENTS.filter(i => i.quoteSupported);

describe('jupiter mark adapter', () => {
  it('turns comparable duplexes into venue marks with the stock reference alongside', async () => {
    const adapter = createJupiterMarkAdapter(async ({ instrumentId }) => buildVenueDuplex({
      instrumentId: instrumentId as SolanaInstrumentId,
      referencePrice: 200,
      referenceSource: 'backed',
      venuePrice: 201,
      now: 1_000,
    }));
    const result = await adapter.read();
    assert.equal(result.marks.length, quoted.length);
    const first = result.marks[0];
    assert.equal(first.instrumentId, quoted[0].id);
    assert.equal(first.symbol, quoted[0].symbol);
    assert.equal(first.reference.status, 'observed');
    assert.equal(first.reference.source, 'jupiter-price-v3');
    assert.equal(first.reference.priceUsdPerToken, '201');
    assert.equal(first.reference.updatedAt, 1_000);
    assert.deepEqual(first.stockReference, { priceUsd: '200', source: 'backed', differenceBps: '50.0' });
  });

  it('marks an instrument unavailable, with no reference leg, when its venue price is missing', async () => {
    const adapter = createJupiterMarkAdapter(async ({ instrumentId }) => instrumentId === quoted[0].id
      ? unavailableVenueDuplex(instrumentId as SolanaInstrumentId, ['venue-price-unavailable'])
      : buildVenueDuplex({ instrumentId: instrumentId as SolanaInstrumentId, referencePrice: 10, referenceSource: 'jupiter-stock-data', venuePrice: 10 }));
    const result = await adapter.read();
    const missing = result.marks.find(m => m.instrumentId === quoted[0].id)!;
    assert.equal(missing.reference.status, 'unavailable');
    assert.equal(missing.reference.priceUsdPerToken, undefined);
    assert.equal(missing.stockReference, undefined);
  });

  it('throws when no instrument has a venue price, so the cache can serve last-known-good', async () => {
    const adapter = createJupiterMarkAdapter(async ({ instrumentId }) =>
      unavailableVenueDuplex(instrumentId as SolanaInstrumentId, ['provider-unavailable']));
    await assert.rejects(() => adapter.read());
  });
});
