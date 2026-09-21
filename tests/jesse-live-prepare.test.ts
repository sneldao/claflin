import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { clearLiveProposalMemory } from '../lib/solana/live-store';
import { prepareJesseLiveProposal, signedTransactionBindsToProposal } from '../lib/solana/live-prepare';
import { jesseLiveEnabled } from '../lib/solana/flags';
import { TradingError } from '../lib/trading/domain';

const AAPL = 'sol:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const WALLET = '11111111111111111111111111111111';

function sampleTransactionBase64(): string {
  const payer = new PublicKey(WALLET);
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

describe('jesse live prepare', () => {
  const prevClient = process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED;
  const prevServer = process.env.JESSE_LIVE_ENABLED;

  beforeEach(() => {
    clearLiveProposalMemory();
    process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED = 'true';
    process.env.JESSE_LIVE_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevClient === undefined) delete process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED;
    else process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED = prevClient;
    if (prevServer === undefined) delete process.env.JESSE_LIVE_ENABLED;
    else process.env.JESSE_LIVE_ENABLED = prevServer;
  });

  it('requires both live flags', () => {
    process.env.NEXT_PUBLIC_JESSE_LIVE_ENABLED = 'true';
    process.env.JESSE_LIVE_ENABLED = 'false';
    assert.equal(jesseLiveEnabled(), false);
    process.env.JESSE_LIVE_ENABLED = 'true';
    assert.equal(jesseLiveEnabled(), true);
  });

  it('builds a proposal from a mocked Metis live order', async () => {
    assert.equal(jesseLiveEnabled(), true);
    const txB64 = sampleTransactionBase64();

    const proposal = await prepareJesseLiveProposal({
      intent: { instrumentId: AAPL, side: 'buy', unit: 'USDC', amount: '1' },
      wallet: WALLET,
      revision: 1,
      id: 'prop-test-1',
      now: 1_700_000_000_000,
      readMint: async () => ({
        decimals: 8,
        multiplier: '1.0026642075893797',
        observedSlot: 1,
        observedAt: 1_700_000_000_000,
        nextEffectiveAt: null,
      }),
      order: async () => ({
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
        inAmount: '1000000',
        outAmount: '3000',
        minOutputRaw: '2985',
        router: 'metis' as const,
        providerRequestId: 'req-live-1',
        slippageBps: 50,
        priceImpact: 0.01,
        feeBps: 0,
        feeMint: null,
        transactionBase64: txB64,
        lastValidBlockHeight: '100',
      }),
    });
    assert.equal(proposal.mode, 'live');
    assert.equal(proposal.wallet, WALLET);
    assert.equal(proposal.reviewedEstimate.inputAmount, '1');
    assert.equal(proposal.providerRequestId, 'req-live-1');
    assert.equal(proposal.messageHash.length, 64);
    assert.equal(signedTransactionBindsToProposal(proposal, txB64), true);
  });

  it('enforces live demo buy limit', async () => {
    await assert.rejects(
      () => prepareJesseLiveProposal({
        intent: { instrumentId: AAPL, side: 'buy', unit: 'USDC', amount: '251' },
        wallet: WALLET,
        revision: 1,
        readMint: async () => ({
          decimals: 8,
          multiplier: '1',
          observedSlot: 1,
          observedAt: 1,
          nextEffectiveAt: null,
        }),
        order: async () => {
          throw new Error('should not order');
        },
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'demo_limit',
    );
  });
});
