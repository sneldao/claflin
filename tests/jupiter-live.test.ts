import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseJupiterLiveOrder } from '../lib/solana/jupiter-live';
import { clearLiveProposalMemory } from '../lib/solana/live-store';

const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_AAPL = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

describe('jupiter live order parser', () => {
  beforeEach(() => clearLiveProposalMemory());

  it('accepts Metis order with transaction', () => {
    const expected = {
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      amountRaw: '1000000',
      taker: '11111111111111111111111111111111',
    };
    const order = parseJupiterLiveOrder({
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      inAmount: '1000000',
      outAmount: '3000',
      otherAmountThreshold: '2985',
      router: 'metis',
      requestId: 'req-1',
      slippageBps: 50,
      transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAED',
      lastValidBlockHeight: '123',
    }, expected);
    assert.equal(order.router, 'metis');
    assert.ok(order.transactionBase64.length > 0);
    assert.equal(order.providerRequestId, 'req-1');
  });

  it('refuses missing transaction on live path', () => {
    assert.throws(() => parseJupiterLiveOrder({
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      inAmount: '1000000',
      outAmount: '3000',
      otherAmountThreshold: '2985',
      router: 'metis',
      requestId: 'req-1',
      transaction: null,
    }, {
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      amountRaw: '1000000',
      taker: '11111111111111111111111111111111',
    }));
  });

  it('refuses non-Metis router', () => {
    assert.throws(() => parseJupiterLiveOrder({
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      inAmount: '1000000',
      outAmount: '3000',
      otherAmountThreshold: '2985',
      router: 'jupiterz',
      requestId: 'req-1',
      transaction: 'AQ==',
    }, {
      inputMint: MINT_USDC,
      outputMint: MINT_AAPL,
      amountRaw: '1000000',
      taker: '11111111111111111111111111111111',
    }));
  });
});
