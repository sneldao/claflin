import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJupiterClient, parseJupiterOrder } from '../lib/solana/jupiter';
import { createMintReader, parseScaledMintAccount } from '../lib/solana/mint';
import { createJupiterQuoteAdapter, SOLANA_PAPER_ASSUMPTIONS } from '../lib/trading/adapters/jupiter';
import { SOLANA_INSTRUMENTS, SOLANA_USDC_MINT } from '../lib/solana/catalog';
import { isSolanaEstimate } from '../lib/solana/contracts';
import { compareDecimals } from '../lib/solana/amounts';
import { AAPLX_FIXTURE } from '../lib/solana/fixtures';

const T = 1789656000000;
const AAPLX = SOLANA_INSTRUMENTS[0];

/** A jsonParsed RPC envelope for a healthy Token-2022 scaled mint. */
function mintBody({ decimals = 8, multiplier = '1.1', newMultiplier = '1', effectiveTs = 0, paused = false, frozen = false, slot = 447810681 } = {}) {
  return {
    result: {
      context: { slot },
      value: {
        data: {
          program: 'spl-token-2022',
          parsed: {
            info: {
              decimals,
              extensions: [
                { extension: 'defaultAccountState', state: { accountState: frozen ? 'frozen' : 'initialized' } },
                { extension: 'pausableConfig', state: { paused } },
                { extension: 'scaledUiAmountConfig', state: { authority: 'S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS', multiplier, newMultiplier, newMultiplierEffectiveTimestamp: effectiveTs } },
              ],
            },
          },
        },
      },
    },
  };
}

/** A strict-valid v2 /order response. */
function orderBody({ inAmount = '100000000', outAmount = '5000000', threshold = '4975000', inputMint = SOLANA_USDC_MINT, outputMint = AAPLX.mint, router = 'metis', transaction = null, slippageBps = 50, requestId = 'req-1' } = {}) {
  return {
    swapType: 'aggregator', mode: 'manual', swapMode: 'ExactIn',
    inputMint, outputMint, inAmount, outAmount, otherAmountThreshold: threshold,
    slippageBps, priceImpact: -0.654, priceImpactPct: '-0.00654',
    routePlan: [{ percent: 100, bps: 10000, swapInfo: { ammKey: 'x', label: 'Whirlpool', inputMint, outputMint, inAmount, outAmount } }],
    router, requestId, feeBps: 10, feeMint: SOLANA_USDC_MINT,
    platformFee: { amount: '100000', feeBps: 10, feeMint: SOLANA_USDC_MINT },
    transaction,
  };
}

function codeOf(error: unknown): { code: string; status: number } {
  const known = error as { code?: string; status?: number };
  return { code: known.code ?? 'no-code', status: known.status ?? 0 };
}

async function failureOf(fn: () => Promise<unknown> | unknown): Promise<{ code: string; status: number }> {
  try {
    await fn();
  } catch (error) {
    return codeOf(error);
  }
  return { code: 'did-not-throw', status: 0 };
}

function adapterWith({ mint = mintBody(), order = orderBody(), now = () => T, capture }: {
  mint?: unknown;
  order?: unknown;
  now?: () => number;
  capture?: { request?: { inputMint: string; outputMint: string; amountRaw: string } };
} = {}) {
  return createJupiterQuoteAdapter({
    now,
    readMint: async () => parseScaledMintAccount(mint, T),
    order: async request => {
      if (capture) capture.request = request;
      return parseJupiterOrder(order, request);
    },
  });
}

describe('jupiter adapter — conversions', () => {
  it('quotes a USDC buy into scaled xStock units', async () => {
    const capture: { request?: { inputMint: string; outputMint: string; amountRaw: string } } = {};
    const estimate = await adapterWith({ capture }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' });
    assert.ok(isSolanaEstimate(estimate));
    if (!isSolanaEstimate(estimate)) return;
    assert.deepEqual(capture.request, { inputMint: SOLANA_USDC_MINT, outputMint: AAPLX.mint, amountRaw: '100000000' });
    assert.equal(estimate.version, 2);
    assert.equal(estimate.deskId, 'jesse');
    assert.equal(estimate.network, 'solana:mainnet');
    assert.equal(estimate.venue, 'jupiter');
    assert.equal(estimate.router, 'metis');
    assert.equal(estimate.inputSymbol, 'USDC');
    assert.equal(estimate.outputSymbol, 'AAPLx');
    assert.equal(estimate.inputAmount, '100');
    assert.equal(estimate.amountInRaw, '100000000');
    assert.equal(estimate.amountOutRaw, '5000000');
    /* 5_000_000 atoms at d=8, m=1.1 → 0.05 raw × 1.1 = 0.055 displayed. */
    assert.equal(estimate.outputAmount, '0.055');
    assert.equal(estimate.effectiveScaledAmount, '0.055');
    assert.equal(estimate.requestedScaledAmount, null);
    assert.equal(estimate.slippageBps, 50);
    assert.equal(estimate.minOutputRaw, '4975000');
    assert.equal(estimate.feeBps, 10);
    assert.equal(estimate.feeMint, SOLANA_USDC_MINT);
    assert.equal(estimate.priceImpactPercent, '-0.654');
    assert.equal(estimate.providerRequestId, 'req-1');
    assert.equal(estimate.scaling.multiplier, '1.1');
    assert.equal(estimate.quotedAt, T);
    assert.equal(estimate.expiresAt, T + 30000);
    assert.equal(estimate.assumptions, SOLANA_PAPER_ASSUMPTIONS);
    assert.equal(estimate.intent.instrumentId, AAPLX.id);
  });

  it('quotes a scaled-token sell back to USDC with exact rounding', async () => {
    const capture: { request?: { inputMint: string; outputMint: string; amountRaw: string } } = {};
    const estimate = await adapterWith({ capture, order: orderBody({ inAmount: '500000000', outAmount: '109125000', threshold: '108579375', inputMint: AAPLX.mint, outputMint: SOLANA_USDC_MINT }) }).quote({ instrumentId: AAPLX.id, side: 'sell', unit: 'scaled-token', amount: '5.5' });
    assert.ok(isSolanaEstimate(estimate));
    if (!isSolanaEstimate(estimate)) return;
    /* floor(5.5 / 1.1 × 10^8) = 500_000_000 atoms exactly. */
    assert.deepEqual(capture.request, { inputMint: AAPLX.mint, outputMint: SOLANA_USDC_MINT, amountRaw: '500000000' });
    assert.equal(estimate.requestedScaledAmount, '5.5');
    assert.equal(estimate.effectiveScaledAmount, '5.5');
    assert.equal(estimate.inputAmount, '5.5');
    assert.equal(estimate.outputSymbol, 'USDC');
    assert.equal(estimate.outputAmount, '109.125');
  });

  it('shows requested versus effective when sell rounding bites', async () => {
    /* m=1.5: selling 1 displayed unit moves floor(1/1.5×10^8) = 66_666_666
       atoms, which displays as 0.99999999 — never rounded up. */
    const estimate = await adapterWith({
      mint: mintBody({ multiplier: '1.5' }),
      order: orderBody({ inAmount: '66666666', outAmount: '21000000', threshold: '20895000', inputMint: AAPLX.mint, outputMint: SOLANA_USDC_MINT }),
    }).quote({ instrumentId: AAPLX.id, side: 'sell', unit: 'scaled-token', amount: '1' });
    assert.ok(isSolanaEstimate(estimate));
    if (!isSolanaEstimate(estimate)) return;
    assert.equal(estimate.amountInRaw, '66666666');
    assert.equal(estimate.requestedScaledAmount, '1');
    assert.equal(estimate.effectiveScaledAmount, '0.99999999');
  });
});

describe('jupiter adapter — scaling schedule', () => {
  it('shortens expiry across a pending multiplier activation', async () => {
    const pendingAt = T + 10000;
    const estimate = await adapterWith({ mint: mintBody({ multiplier: '1.1', newMultiplier: '1.2', effectiveTs: pendingAt / 1000 }) }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' });
    assert.ok(isSolanaEstimate(estimate));
    if (!isSolanaEstimate(estimate)) return;
    /* The activation lands mid-window: conversion uses the current
       multiplier and the quote must not outlive the change. */
    assert.equal(estimate.scaling.multiplier, '1.1');
    assert.equal(estimate.scaling.nextEffectiveAt, pendingAt);
    assert.equal(estimate.expiresAt, pendingAt);
  });

  it('applies a queued multiplier whose activation has passed', async () => {
    const mint = parseScaledMintAccount(mintBody({ multiplier: '1.1', newMultiplier: '1.2', effectiveTs: (T - 1000) / 1000 }), T);
    assert.equal(mint.multiplier, '1.2');
    assert.equal(mint.nextEffectiveAt, null);
  });

  it('refuses an issuer-paused or frozen mint', async () => {
    assert.deepEqual(await failureOf(() => adapterWith({ mint: mintBody({ paused: true }) }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' })), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => adapterWith({ mint: mintBody({ frozen: true }) }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' })), { code: 'quote_unavailable', status: 503 });
  });

  it('fails closed when mint decimals drift from the verified catalog', async () => {
    assert.deepEqual(await failureOf(() => adapterWith({ mint: mintBody({ decimals: 6 }) }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' })), { code: 'unverified_units', status: 422 });
  });

  it('expires a quote whose review window closes during loading', async () => {
    const calls = [T, T + 31000];
    const estimate = adapterWith({ now: () => calls.shift() ?? T + 31000 }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '100' });
    assert.deepEqual(await failureOf(() => estimate), { code: 'quote_expired', status: 503 });
  });
});

describe('jupiter order parser — fail closed', () => {
  const expected = { inputMint: SOLANA_USDC_MINT, outputMint: AAPLX.mint, amountRaw: '100000000' };
  it('rejects mint, amount-echo, router, swap-mode and slippage mismatches', () => {
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ outputMint: AAPLX_FIXTURE.mint }), expected))).code, 'route_mismatch');
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ inAmount: '99999999' }), expected))).code, 'route_mismatch');
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ router: 'jupiterz' }), expected))).code, 'route_mismatch');
    assert.equal((awaitlessCode(() => parseJupiterOrder({ ...orderBody(), swapMode: 'ExactOut' }, expected))).code, 'route_mismatch');
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ slippageBps: 100 }), expected))).code, 'route_mismatch');
  });
  it('rejects an executable payload on the paper path', () => {
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ transaction: 'AQAB' as unknown as null }), expected))).code, 'route_mismatch');
  });
  it('rejects invalid or inconsistent amounts', () => {
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ outAmount: '0' }), expected))).code, 'invalid_quote');
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ outAmount: '1.5' }), expected))).code, 'invalid_quote');
    assert.equal((awaitlessCode(() => parseJupiterOrder(orderBody({ threshold: '99999999' }), expected))).code, 'invalid_quote');
    assert.equal((awaitlessCode(() => parseJupiterOrder({ ...orderBody(), requestId: '' }, expected))).code, 'quote_unavailable');
    assert.equal((awaitlessCode(() => parseJupiterOrder(null, expected))).code, 'quote_unavailable');
  });
  function awaitlessCode(fn: () => unknown): { code: string; status: number } {
    try {
      fn();
    } catch (error) {
      return codeOf(error);
    }
    return { code: 'did-not-throw', status: 0 };
  }
});

describe('jupiter client — provider failure mapping', () => {
  const jsonResponse = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  const request = { inputMint: SOLANA_USDC_MINT, outputMint: AAPLX.mint, amountRaw: '100000000' };

  it('sends the pinned routing policy and the key only when configured', async () => {
    const seen: { url?: string; headers?: HeadersInit } = {};
    const client = createJupiterClient({
      apiKey: 'test-key',
      fetchImpl: (url, init) => {
        seen.url = url as string;
        seen.headers = init?.headers;
        return jsonResponse(200, orderBody());
      },
    });
    await client(request);
    assert.ok(seen.url!.startsWith('https://api.jup.ag/swap/v2/order?'));
    assert.ok(seen.url!.includes('swapMode=ExactIn'));
    assert.ok(seen.url!.includes('slippageBps=50'));
    assert.ok(seen.url!.includes('excludeRouters=jupiterz%2Cdflow%2Cokx'));
    assert.deepEqual(seen.headers, { 'x-api-key': 'test-key' });

    /* Empty string = not configured (explicit, so the developer's own
       JUPITER_API_KEY env cannot leak into the test). */
    const keyless = createJupiterClient({ apiKey: '', fetchImpl: (url, init) => { seen.headers = init?.headers; return jsonResponse(200, orderBody()); } });
    await keyless(request);
    assert.deepEqual(seen.headers, {});
  });

  it('maps 401/500 to unavailable, 429 to rate_limited, provider error to no_route, timeout to unavailable', async () => {
    assert.deepEqual(await failureOf(() => createJupiterClient({ fetchImpl: () => jsonResponse(401, {}) })(request)), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => createJupiterClient({ fetchImpl: () => jsonResponse(500, {}) })(request)), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => createJupiterClient({ fetchImpl: () => jsonResponse(429, { code: 429 }) })(request)), { code: 'rate_limited', status: 429 });
    assert.deepEqual(await failureOf(() => createJupiterClient({ fetchImpl: () => jsonResponse(200, { error: 'Failed to get quotes' }) })(request)), { code: 'no_route', status: 422 });
    assert.deepEqual(await failureOf(() => createJupiterClient({ fetchImpl: () => Promise.reject(new Error('aborted')) })(request)), { code: 'quote_unavailable', status: 503 });
  });
});

describe('mint reader', () => {
  it('posts a jsonParsed getAccountInfo for the exact mint', async () => {
    const seen: { url?: string; body?: string } = {};
    const read = createMintReader({
      rpcUrl: 'https://rpc.example',
      now: () => T,
      fetchImpl: (url, init) => {
        seen.url = url as string;
        seen.body = init?.body as string;
        return Promise.resolve(new Response(JSON.stringify(mintBody()), { status: 200 }));
      },
    });
    const observation = await read(AAPLX.mint);
    assert.equal(seen.url, 'https://rpc.example');
    assert.ok(seen.body!.includes(AAPLX.mint));
    assert.ok(seen.body!.includes('jsonParsed'));
    assert.equal(observation.observedSlot, 447810681);
    assert.equal(observation.observedAt, T);
    assert.equal(observation.multiplier, '1.1');
  });

  it('fails closed on unreachable RPC, non-200, and unreadable payloads', async () => {
    const withFetch = (fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) => createMintReader({ rpcUrl: 'https://rpc.example', fetchImpl })(AAPLX.mint);
    assert.deepEqual(await failureOf(() => withFetch(() => Promise.reject(new Error('down')))), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => withFetch(() => Promise.resolve(new Response('{}', { status: 429 })))), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => withFetch(() => Promise.resolve(new Response('not json', { status: 200 })))), { code: 'quote_unavailable', status: 503 });
    assert.deepEqual(await failureOf(() => withFetch(() => Promise.resolve(new Response(JSON.stringify({ result: { context: { slot: 1 }, value: null } }), { status: 200 })))), { code: 'quote_unavailable', status: 503 });
  });
});

describe('jupiter adapter — intent and limits', () => {
  it('rejects Base-style intents and unknown instruments', async () => {
    assert.deepEqual(await failureOf(() => adapterWith().quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '0' })), { code: 'invalid_intent', status: 400 });
    assert.deepEqual(await failureOf(() => adapterWith().quote({ instrumentId: AAPLX.id, side: 'sell', unit: 'token', amount: '1' })), { code: 'invalid_intent', status: 400 });
    /* The fixture mint is a valid 32-byte id, but it is not allowlisted. */
    assert.deepEqual(await failureOf(() => adapterWith().quote({ instrumentId: AAPLX_FIXTURE.id, side: 'buy', unit: 'USDC', amount: '100' })), { code: 'unknown_instrument', status: 404 });
  });

  it('enforces the desk demo limits on both sides', async () => {
    assert.deepEqual(await failureOf(() => adapterWith().quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '10000.01' })), { code: 'demo_limit', status: 400 });
    assert.deepEqual(await failureOf(() => adapterWith().quote({ instrumentId: AAPLX.id, side: 'sell', unit: 'scaled-token', amount: '1000.00000001' })), { code: 'demo_limit', status: 400 });
    /* Exact caps pass: 10000 USDC and 1000 displayed tokens. */
    const buy = await adapterWith({ order: orderBody({ inAmount: '10000000000' }) }).quote({ instrumentId: AAPLX.id, side: 'buy', unit: 'USDC', amount: '10000' });
    assert.ok(isSolanaEstimate(buy));
    const sell = await adapterWith({ order: orderBody({ inAmount: '90909090909', outAmount: '100000000000', threshold: '99500000000', inputMint: AAPLX.mint, outputMint: SOLANA_USDC_MINT }) }).quote({ instrumentId: AAPLX.id, side: 'sell', unit: 'scaled-token', amount: '1000' });
    assert.ok(isSolanaEstimate(sell));
  });
});

describe('compareDecimals', () => {
  it('compares without floats', () => {
    assert.equal(compareDecimals('1000.00000001', '1000'), 1);
    assert.equal(compareDecimals('999.99999999', '1000'), -1);
    assert.equal(compareDecimals('1000.0', '1000'), 0);
    assert.equal(compareDecimals('0.055', '0.055'), 0);
    assert.equal(compareDecimals('99', '100'), -1);
    assert.equal(compareDecimals('100', '99'), 1);
    assert.throws(() => compareDecimals('abc', '1'));
  });
});
