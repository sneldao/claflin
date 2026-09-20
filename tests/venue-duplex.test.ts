import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVenueDuplex,
  clearVenueDuplexCache,
  readVenueDuplex,
  unavailableVenueDuplex,
  venueReferenceDifferenceBps,
} from '../lib/solana/market/venue-duplex';

const AAPL = 'sol:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const MINT = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

describe('venue duplex', () => {
  beforeEach(() => clearVenueDuplexCache());

  it('computes reference difference like PreStocks', () => {
    assert.equal(venueReferenceDifferenceBps(100, 101), '100.0');
    assert.equal(venueReferenceDifferenceBps(100, 99), '-100.0');
    assert.equal(venueReferenceDifferenceBps(0, 101), null);
  });

  it('builds comparable duplex from Backed reference', () => {
    const d = buildVenueDuplex({
      instrumentId: AAPL,
      referencePrice: 334.875,
      referenceSource: 'backed',
      venuePrice: 333.77,
      now: 1,
    });
    assert.equal(d.status, 'comparable');
    assert.equal(d.referenceSource, 'backed');
    assert.ok(d.reasonCodes.includes('issuer-indicative'));
    assert.ok(d.referenceDifferenceBps);
  });

  it('prefers Backed quote when present, else Jupiter stockData', async () => {
    const duplex = await readVenueDuplex({
      instrumentId: AAPL,
      now: 42,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/price-data')) {
          return new Response(JSON.stringify({ quote: 300 }), { status: 200 });
        }
        if (url.includes('price/v3')) {
          return new Response(JSON.stringify({
            [MINT]: { usdPrice: 301, stockData: { price: 299 } },
          }), { status: 200 });
        }
        return new Response('no', { status: 404 });
      },
    });
    assert.equal(duplex.status, 'comparable');
    assert.equal(duplex.referenceSource, 'backed');
    assert.equal(duplex.referencePrice, '300');
    assert.equal(duplex.venuePrice, '301');
  });

  it('falls back to Jupiter stockData when Backed quote is null', async () => {
    const duplex = await readVenueDuplex({
      instrumentId: AAPL,
      now: 42,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/price-data')) {
          return new Response(JSON.stringify({ quote: null }), { status: 200 });
        }
        return new Response(JSON.stringify({
          [MINT]: { usdPrice: 333.77, stockData: { price: 334.875 } },
        }), { status: 200 });
      },
    });
    assert.equal(duplex.status, 'comparable');
    assert.equal(duplex.referenceSource, 'jupiter-stock-data');
    assert.ok(duplex.reasonCodes.includes('jupiter-stock-reference'));
  });

  it('degrades when venue price missing', async () => {
    const duplex = await readVenueDuplex({
      instrumentId: AAPL,
      now: 42,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/price-data')) {
          return new Response(JSON.stringify({ quote: 300 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      },
    });
    assert.equal(duplex.status, 'unavailable');
    assert.ok(duplex.reasonCodes.includes('venue-price-unavailable'));
  });

  it('keeps unavailable shell honest', () => {
    const d = unavailableVenueDuplex(AAPL, ['provider-unavailable'], 1);
    assert.equal(d.status, 'unavailable');
    assert.equal(d.referenceDifferenceBps, null);
  });
});
