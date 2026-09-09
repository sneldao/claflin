import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicClient } from 'viem';
import { approveInputForQuote, estimateSwapGas, swapForQuote } from '../lib/trading/execute-swap';
import { AERODROME_SWAP_ROUTER } from '../lib/base-chain';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;
const wallet = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;
const now = Date.now();

const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
const quote: QuoteEstimate = {
  id: 'exec-test-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
  inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals!,
  multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
  reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: Math.floor(now / 1000), session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function client(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    waitForTransactionReceipt: async () => ({ status: 'success' }),
    estimateGas: async () => 210000n,
    getGasPrice: async () => 1000000n,
    ...overrides,
  } as unknown as PublicClient;
}

describe('live execution helpers', () => {
  it('approveInputForQuote returns the hash once the receipt confirms', async () => {
    const sent: unknown[] = [];
    const hash = await approveInputForQuote(
      { sendTransaction: async (tx) => { sent.push(tx); return '0xapprove'; }, publicClient: client() },
      quote,
    );
    assert.equal(hash, '0xapprove');
    const tx = sent[0] as { to: string; chainId: number };
    assert.equal(tx.chainId, 8453);
    assert.notEqual(tx.to.toLowerCase(), AERODROME_SWAP_ROUTER.toLowerCase(), 'approval targets the token, not the router');
  });

  it('approveInputForQuote throws on a reverted approval', async () => {
    const publicClient = client({ waitForTransactionReceipt: async () => ({ status: 'reverted' }) });
    await assert.rejects(
      () => approveInputForQuote({ sendTransaction: async () => '0xapprove', publicClient }, quote),
      /reverted/,
    );
  });

  it('swapForQuote sends the swap to the router and returns the hash', async () => {
    const sent: unknown[] = [];
    const hash = await swapForQuote(
      { walletAddress: wallet, sendTransaction: async (tx) => { sent.push(tx); return '0xswap'; }, publicClient: client() },
      quote,
      50,
    );
    assert.equal(hash, '0xswap');
    const tx = sent[0] as { to: string; value: bigint };
    assert.equal(tx.to, AERODROME_SWAP_ROUTER);
    assert.equal(tx.value, 0n);
  });

  it('swapForQuote refuses an expired quote instead of broadcasting', async () => {
    const stale = { ...quote, expiresAt: Date.now() - 1000 };
    await assert.rejects(
      () => swapForQuote({ walletAddress: wallet, sendTransaction: async () => '0xswap', publicClient: client() }, stale, 50),
      /expired/,
    );
  });

  it('estimateSwapGas returns the estimated cost inputs, or null when unreadable', async () => {
    const ok = await estimateSwapGas(client(), quote, wallet);
    assert.deepEqual(ok, { gas: 210000n, gasPrice: 1000000n });
    const failing = client({ estimateGas: async () => { throw new Error('execution reverted'); } });
    assert.equal(await estimateSwapGas(failing, quote, wallet), null);
  });
});
