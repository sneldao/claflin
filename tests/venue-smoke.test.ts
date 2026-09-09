import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteHandler, quoteBudget } from '../lib/trading/http';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

function makeQuote(intent: TradeIntent, now: number): QuoteEstimate {
  return {
    id: 'venue-smoke-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
    chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
    instrumentAddress: stock.contractAddress, instrumentName: stock.name,
    inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
    inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals, multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
    reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: now, session: 'unknown', pauseStatus: 'unchecked' },
    blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
  };
}

describe('read-only venue smoke check', () => {
  it('returns a paper-only estimate for a valid quote request', async () => {
    const now = Date.now();
    const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
    const quote = makeQuote(intent, now);
    const handler = createQuoteHandler(async (input) => {
      const params = input as Record<string, string>;
      assert.equal(params.instrumentId, stock.id);
      assert.equal(params.side, 'buy');
      assert.equal(params.amount, '10');
      assert.equal(params.unit, 'USDC');
      return quote;
    });

    const req = new Request(`http://localhost:3000/api/stocks/quote?instrumentId=${encodeURIComponent(stock.id)}&side=buy&amount=10&unit=USDC`);
    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const body = await res.json();
    assert.equal(body.kind, 'estimate');
    assert.equal(body.mode, 'paper');
    assert.equal(body.liveExecutionEnabled, false);
    assert.equal(body.inputAmount, '10');
    assert.equal(body.outputAmount, '0.02948502');
    assert.ok(body.assumptions, 'estimate should carry assumptions');
  });

  it('rejects legacy and malformed quote requests', async () => {
    const handler = createQuoteHandler(async () => makeQuote({ instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' }, Date.now()));
    for (const url of [
      'http://localhost:3000/api/stocks/quote?instrumentId=foo&side=buy&amount=10&unit=USDC&sizeUsd=100',
      'http://localhost:3000/api/stocks/quote?instrumentId=foo&side=buy&amount=10&unit=USDC&unit=USDC',
    ]) {
      const res = await handler(new Request(url));
      assert.equal(res.status, 400, `${url} should be rejected`);
      const body = await res.json();
      assert.equal(body.error, 'invalid_request');
    }
  });

  it('rate-limits under concurrent load and recovers', async () => {
    let calls = 0;
    const handler = createQuoteHandler(async () => {
      calls++;
      await new Promise(r => setTimeout(r, 10));
      return makeQuote({ instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' }, Date.now());
    });

    const url = `http://localhost:3000/api/stocks/quote?instrumentId=${encodeURIComponent(stock.id)}&side=buy&amount=10&unit=USDC`;
    const [first, second, third] = await Promise.all([
      handler(new Request(url)),
      handler(new Request(url)),
      handler(new Request(url)),
    ]);
    const statuses = [first.status, second.status, third.status].sort();
    assert.deepEqual(statuses, [200, 200, 429], 'two quotes should run, the third should be busy');
    assert.equal(calls, 2, 'quote reader should only be invoked for allowed requests');
  });

  it('honors the quote budget by blocking the 61st request in the same minute', async () => {
    const budget = quoteBudget(() => 1000);
    const handler = createQuoteHandler(async () => makeQuote({ instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' }, Date.now()), budget);
    const url = `http://localhost:3000/api/stocks/quote?instrumentId=${encodeURIComponent(stock.id)}&side=buy&amount=10&unit=USDC`;
    const results: number[] = [];
    for (let i = 0; i < 61; i++) results.push((await handler(new Request(url))).status);
    assert.equal(results.filter(s => s === 200).length, 60, '60 requests should succeed in one minute');
    assert.equal(results[60], 429, 'the 61st request should hit the budget');
  });

  it('returns an unavailable response when the quote reader throws', async () => {
    const handler = createQuoteHandler(async () => { throw new Error('RPC down'); });
    const url = `http://localhost:3000/api/stocks/quote?instrumentId=${encodeURIComponent(stock.id)}&side=buy&amount=10&unit=USDC`;
    const res = await handler(new Request(url));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'quote_unavailable');
  });
});

describe('quote budget', () => {
  it('resets the budget every minute and caps at 60 requests', () => {
    let now = 1000;
    const budget = quoteBudget(() => now);
    for (let i = 0; i < 60; i++) assert.equal(budget(), true, `request ${i + 1} should be allowed`);
    assert.equal(budget(), false, 'request 61 should be blocked within the same minute');
    now += 60001;
    assert.equal(budget(), true, 'budget should reset after the minute');
  });
});
