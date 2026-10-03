import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { readBaseStockReference, readAllBaseStockReferences, referenceDifferenceBps, readCoinbaseExchangeTicker, DEFAULT_MAX_AGE_MS } from '../lib/trading/marks/base-stock-reference';

/**
 * The Base stock reference is the underlying-equity spot price (NVDA on
 * Coinbase Exchange, not the B20c token on Base). It fills the board's
 * "stock ref" cell for Hetty the same way Jesse's venue-duplex and
 * Isabel's rhj/prices fill theirs.
 */

describe('base stock reference — Coinbase Exchange read', () => {
  it('parses a well-formed ticker response', async () => {
    const fakeFetch = (async (url: string) => {
      assert.match(url, /api\.exchange\.coinbase\.com\/products\/NVDA-USD\/ticker/);
      return new Response(JSON.stringify({ price: '123.45' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const result = await readCoinbaseExchangeTicker('NVDA-USD', fakeFetch);
    assert.ok('priceUsd' in result);
    assert.equal(result.priceUsd, '123.45');
    assert.ok(result.observedAt > 0);
  });

  it('returns a transport error on a non-2xx response', async () => {
    const fakeFetch = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const result = await readCoinbaseExchangeTicker('NVDA-USD', fakeFetch);
    assert.ok('error' in result);
    assert.equal(result.error, 'bad-response');
  });

  it('returns a bad-response error when the body is not parseable', async () => {
    const fakeFetch = (async () => new Response('"plain string"', { status: 200 })) as typeof fetch;
    const result = await readCoinbaseExchangeTicker('NVDA-USD', fakeFetch);
    assert.ok('error' in result);
    assert.equal(result.error, 'bad-response');
  });

  it('returns a bad-response error when the price is non-positive', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ price: '0' }), { status: 200 })) as typeof fetch;
    const result = await readCoinbaseExchangeTicker('NVDA-USD', fakeFetch);
    assert.ok('error' in result);
    assert.equal(result.error, 'bad-response');
  });
});

describe('base stock reference — instrument reads', () => {
  it('returns ok with a positive price for a healthy read', async () => {
    const instrument = DESK_INSTRUMENTS[0];
    const now = Date.now();
    const fakeFetch = (async () => new Response(JSON.stringify({ price: '500.00' }), { status: 200 })) as typeof fetch;
    const result = await readBaseStockReference(instrument, { fetcher: fakeFetch, now });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.value.priceUsd, '500');
    assert.equal(result.value.source, 'coinbase-exchange');
    assert.equal(result.value.observedAt, now);
    assert.equal(result.value.symbol, instrument.symbol);
    assert.equal(result.value.underlyingSymbol, instrument.underlyingSymbol);
  });

  it('returns unavailable when the read is older than maxAgeMs', async () => {
    const instrument = DESK_INSTRUMENTS[0];
    const fakeFetch = (async () => new Response(JSON.stringify({ price: '500' }), { status: 200 })) as typeof fetch;
    const result = await readBaseStockReference(instrument, { fetcher: fakeFetch, now: Date.now() + DEFAULT_MAX_AGE_MS + 1 });
    assert.equal(result.kind, 'unavailable');
    if (result.kind !== 'unavailable') return;
    assert.equal(result.reason.kind, 'stale');
  });

  it('returns unavailable with a transport reason on a network error', async () => {
    const instrument = DESK_INSTRUMENTS[0];
    const fakeFetch = (async () => { throw new Error('ECONNRESET'); }) as typeof fetch;
    const result = await readBaseStockReference(instrument, { fetcher: fakeFetch });
    assert.equal(result.kind, 'unavailable');
    if (result.kind !== 'unavailable') return;
    assert.equal(result.reason.kind, 'transport');
  });

  it('returns a row for every Base instrument in batch', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ price: '100.00' }), { status: 200 })) as typeof fetch;
    const all = await readAllBaseStockReferences({ fetcher: fakeFetch });
    assert.equal(all.size, DESK_INSTRUMENTS.length);
    for (const instrument of DESK_INSTRUMENTS) {
      assert.ok(all.has(instrument.id), `missing row for ${instrument.symbol}`);
    }
  });
});

describe('base stock reference — gap math', () => {
  it('returns positive bps when the token is above the underlying', () => {
    // 110 / 100 - 1 = 0.10 = 1000 bps
    assert.equal(referenceDifferenceBps('110', '100'), '1000.0');
  });

  it('returns negative bps when the token is below the underlying', () => {
    // 95 / 100 - 1 = -0.05 = -500 bps
    assert.equal(referenceDifferenceBps('95', '100'), '-500.0');
  });

  it('returns 0.0 when the two legs are equal', () => {
    assert.equal(referenceDifferenceBps('100', '100'), '0.0');
  });

  it('returns null when either leg is missing', () => {
    assert.equal(referenceDifferenceBps(null, '100'), null);
    assert.equal(referenceDifferenceBps('100', null), null);
    assert.equal(referenceDifferenceBps(null, null), null);
  });

  it('returns null when the underlying leg is zero', () => {
    // division by zero is not a number; return null, not Infinity
    assert.equal(referenceDifferenceBps('100', '0'), null);
  });

  it('returns one decimal place, like Jesse and Isabel', () => {
    // 100.123 / 100 = 1.00023 → 12.3 bps → one decimal
    assert.equal(referenceDifferenceBps('100.123', '100'), '12.3');
  });
});

describe('base stock reference — honesty', () => {
  it('never returns a price for a read that did not happen', async () => {
    const fakeFetch = (async () => new Response('', { status: 500 })) as typeof fetch;
    const result = await readBaseStockReference(DESK_INSTRUMENTS[0], { fetcher: fakeFetch });
    assert.equal(result.kind, 'unavailable');
  });

  it('the underlying ticker in the product id is uppercase', async () => {
    let requestedUrl = '';
    const fakeFetch = (async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ price: '1' }), { status: 200 });
    }) as typeof fetch;
    await readBaseStockReference(DESK_INSTRUMENTS[0], { fetcher: fakeFetch });
    // The product id is "<TICKER>-USD" with the underlying uppercase.
    assert.match(requestedUrl, /\/products\/[A-Z]+-USD\/ticker/);
  });
});