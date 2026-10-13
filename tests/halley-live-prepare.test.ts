import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { clearHalleyLiveMemory } from '../lib/meteora/live-store';
import {
  HALLEY_LIVE_LIMITS,
  metadataUriFor,
  prepareHalleyLiveProposal,
  signedLaunchBindsToProposal,
  type HalleyBuiltLaunch,
} from '../lib/meteora/live-prepare';
import { submitHalleyLiveProposal } from '../lib/meteora/live-submit';
import { markHalleyLiveProposal } from '../lib/meteora/live-store';
import { halleyLiveEnabled } from '../lib/meteora/flags';
import { TradingError } from '../lib/trading/domain';
import type { HalleyAnchor, HalleyLaunchIntent } from '../lib/meteora/contracts';
import type { Connection } from '@solana/web3.js';

const WALLET_KP = Keypair.generate();
const WALLET = WALLET_KP.publicKey.toBase58();

const INTENT: HalleyLaunchIntent = {
  name: 'Test Tracker',
  symbol: 'TTRK',
  anchorSymbol: null,
  quoteSymbol: 'USDC',
  curve: 'flat',
  supply: '1000000',
  graduationQuote: '150',
};

function unsignedTxBase64(tag: number): string {
  const message = new TransactionMessage({
    payerKey: WALLET_KP.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [new TransactionInstruction({ keys: [], programId: WALLET_KP.publicKey, data: Buffer.from([tag]) })],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

function hashOf(txB64: string): string {
  const tx = VersionedTransaction.deserialize(Buffer.from(txB64, 'base64'));
  return createHash('sha256').update(tx.message.serialize()).digest('hex');
}

function mockBuild(): (args: unknown) => Promise<HalleyBuiltLaunch> {
  return async () => {
    const configB64 = unsignedTxBase64(1);
    const poolB64 = unsignedTxBase64(2);
    return {
      configTransactionBase64: configB64,
      configMessageHash: hashOf(configB64),
      poolTransactionBase64: poolB64,
      poolMessageHash: hashOf(poolB64),
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: '999999',
      pool: '11111111111111111111111111111111',
      baseMint: '11111111111111111111111111111111',
      config: '11111111111111111111111111111111',
    };
  };
}

const OBSERVED_ANCHOR: HalleyAnchor = {
  symbol: 'NVDA',
  source: 'pyth-pro',
  equityUsd: '180',
  pairRatio: null,
  quoteEquityUsd: null,
  observedAt: 1_700_000_000_000,
  status: 'observed',
};

describe('halley live prepare', () => {
  const prevClient = process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
  const prevServer = process.env.HALLEY_LIVE_ENABLED;

  beforeEach(() => {
    clearHalleyLiveMemory();
    process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = 'true';
    process.env.HALLEY_LIVE_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevClient === undefined) delete process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
    else process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = prevClient;
    if (prevServer === undefined) delete process.env.HALLEY_LIVE_ENABLED;
    else process.env.HALLEY_LIVE_ENABLED = prevServer;
  });

  it('requires both live flags', () => {
    process.env.HALLEY_LIVE_ENABLED = 'false';
    assert.equal(halleyLiveEnabled(), false);
    process.env.HALLEY_LIVE_ENABLED = 'true';
    assert.equal(halleyLiveEnabled(), true);
  });

  it('builds a live proposal bound to the wallet and message', async () => {
    const proposal = await prepareHalleyLiveProposal({
      intent: INTENT,
      wallet: WALLET,
      revision: 1,
      id: 'halley-test-1',
      now: 1_700_000_000_000,
      buildLaunch: mockBuild(),
    });
    assert.equal(proposal.mode, 'live');
    assert.equal(proposal.deskId, 'halley');
    assert.equal(proposal.wallet, WALLET);
    assert.equal(proposal.network, 'solana:mainnet');
    assert.equal(proposal.quoteMint.length > 0, true);
    assert.equal(proposal.migrationConfig.length > 0, true);
    assert.equal(proposal.configMessageHash.length, 64);
    assert.equal(proposal.poolMessageHash.length, 64);
    assert.equal(proposal.expiresAt, 1_700_000_000_000 + 90_000);
    assert.equal(signedLaunchBindsToProposal(proposal, proposal.configTransactionBase64, proposal.poolTransactionBase64), true);
    /* The metadata URI says what the mint is — a tracker, not stock. */
    const uri = metadataUriFor(INTENT);
    assert.match(uri, /\/api\/desk\/halley\/token-metadata\?/);
    assert.match(uri, /symbol=TTRK/);
  });

  it('refuses a malformed intent before any curve math runs', async () => {
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: { ...INTENT, symbol: 'x' },
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'invalid_intent',
    );
  });

  it('refuses a wallet that is not a Solana public key', async () => {
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: INTENT,
        wallet: 'not-a-wallet',
        revision: 1,
        buildLaunch: mockBuild(),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'invalid_intent',
    );
  });

  it('refuses a quote asset outside the verified catalog', async () => {
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: { ...INTENT, quoteSymbol: 'BONK' },
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'invalid_intent',
    );
  });

  it('enforces the live launch caps', async () => {
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: { ...INTENT, supply: '9999999999999' },
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'demo_limit',
    );
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: { ...INTENT, graduationQuote: '99999999' },
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'demo_limit',
    );
    assert.equal(HALLEY_LIVE_LIMITS.maxSupply, '1000000000000');
  });

  it('fails closed when a requested anchor cannot be evidenced', async () => {
    const anchored = { ...INTENT, anchorSymbol: 'NVDA' };
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: anchored,
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
        resolveAnchorPort: async () => ({ ...OBSERVED_ANCHOR, status: 'unavailable' }),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'anchor_unavailable',
    );
    await assert.rejects(
      () => prepareHalleyLiveProposal({
        intent: anchored,
        wallet: WALLET,
        revision: 1,
        buildLaunch: mockBuild(),
        resolveAnchorPort: async () => ({ ...OBSERVED_ANCHOR, status: 'stale' }),
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'anchor_stale',
    );
  });

  it('accepts an observed anchor and records it on the proposal', async () => {
    const proposal = await prepareHalleyLiveProposal({
      intent: { ...INTENT, anchorSymbol: 'NVDA' },
      wallet: WALLET,
      revision: 1,
      buildLaunch: mockBuild(),
      resolveAnchorPort: async () => OBSERVED_ANCHOR,
    });
    assert.equal(proposal.anchor?.status, 'observed');
    assert.equal(proposal.anchor?.symbol, 'NVDA');
  });
});

describe('halley live submit', () => {
  const prevClient = process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
  const prevServer = process.env.HALLEY_LIVE_ENABLED;

  async function seed(now = 1_700_000_000_000) {
    return prepareHalleyLiveProposal({
      intent: INTENT,
      wallet: WALLET,
      revision: 1,
      now,
      buildLaunch: mockBuild(),
    });
  }

  function signedBase64(unsignedB64: string): string {
    const tx = VersionedTransaction.deserialize(Buffer.from(unsignedB64, 'base64'));
    tx.sign([WALLET_KP]);
    return Buffer.from(tx.serialize()).toString('base64');
  }

  function signedArgs(proposal: { configTransactionBase64: string; poolTransactionBase64: string }) {
    return {
      signedConfigTransactionBase64: signedBase64(proposal.configTransactionBase64),
      signedPoolTransactionBase64: signedBase64(proposal.poolTransactionBase64),
    };
  }

  function conn(confirm: { value: { err: unknown } } | Error = { value: { err: null } }): Connection {
    return {
      sendRawTransaction: async () => '5'.repeat(88),
      confirmTransaction: async () => {
        if (confirm instanceof Error) throw confirm;
        return confirm;
      },
    } as unknown as Connection;
  }

  beforeEach(() => {
    clearHalleyLiveMemory();
    process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = 'true';
    process.env.HALLEY_LIVE_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevClient === undefined) delete process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
    else process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = prevClient;
    if (prevServer === undefined) delete process.env.HALLEY_LIVE_ENABLED;
    else process.env.HALLEY_LIVE_ENABLED = prevServer;
  });

  it('confirms a signed launch and returns onchain evidence', async () => {
    const proposal = await seed();
    const result = await submitHalleyLiveProposal({
      proposalId: proposal.id,
      ...signedArgs(proposal),
      idempotencyKey: 'idem-key-0001',
      wallet: WALLET,
      connection: conn(),
      now: proposal.expiresAt - 1,
    });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.signature, '5'.repeat(88));
    assert.match(result.solscanUrl ?? '', /solscan\.io\/tx\//);
    assert.match(result.mintUrl ?? '', /solscan\.io\/token\//);
  });

  it('refuses a wallet that does not match the proposal', async () => {
    const proposal = await seed();
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: proposal.id,
        ...signedArgs(proposal),
        idempotencyKey: 'idem-key-0001',
        wallet: 'DifferentWallet1111111111111111111111111111111',
        now: proposal.expiresAt - 1,
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'invalid_intent' && err.status === 403,
    );
  });

  it('refuses an expired proposal', async () => {
    const proposal = await seed(1_000);
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: proposal.id,
        ...signedArgs(proposal),
        idempotencyKey: 'idem-key-0001',
        wallet: WALLET,
        now: proposal.expiresAt,
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'quote_expired',
    );
  });

  it('refuses a missing proposal', async () => {
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: 'no-such-proposal',
        signedConfigTransactionBase64: signedBase64(unsignedTxBase64(1)),
        signedPoolTransactionBase64: signedBase64(unsignedTxBase64(2)),
        idempotencyKey: 'idem-key-0001',
        wallet: WALLET,
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'quote_expired',
    );
  });

  it('refuses a signed message that does not bind to the prepared transaction', async () => {
    const proposal = await seed();
    const other = new TransactionMessage({
      payerKey: Keypair.generate().publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [],
    }).compileToV0Message();
    const tampered = Buffer.from(new VersionedTransaction(other).serialize()).toString('base64');
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: proposal.id,
        signedConfigTransactionBase64: tampered,
        signedPoolTransactionBase64: signedBase64(proposal.poolTransactionBase64),
        idempotencyKey: 'idem-key-0001',
        wallet: WALLET,
        now: proposal.expiresAt - 1,
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'route_mismatch',
    );
  });

  it('refuses a transaction the wallet did not sign', async () => {
    const proposal = await seed();
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: proposal.id,
        signedConfigTransactionBase64: proposal.configTransactionBase64,
        signedPoolTransactionBase64: signedBase64(proposal.poolTransactionBase64),
        idempotencyKey: 'idem-key-0001',
        wallet: WALLET,
        now: proposal.expiresAt - 1,
      }),
      (err: unknown) => err instanceof TradingError && err.code === 'route_mismatch',
    );
  });

  it('blocks a second submit under a different idempotency key', async () => {
    const proposal = await seed();
    await markHalleyLiveProposal(proposal.id, { status: 'submitted', idempotencyKey: 'idem-key-000a' });
    await assert.rejects(
      () => submitHalleyLiveProposal({
        proposalId: proposal.id,
        ...signedArgs(proposal),
        idempotencyKey: 'idem-key-000b',
        wallet: WALLET,
        now: proposal.expiresAt - 1,
      }),
      (err: unknown) => err instanceof TradingError && err.status === 409,
    );
  });

  it('returns the confirmed evidence idempotently on resubmit', async () => {
    const proposal = await seed();
    await markHalleyLiveProposal(proposal.id, { status: 'confirmed', signature: '5'.repeat(88) });
    const result = await submitHalleyLiveProposal({
      proposalId: proposal.id,
      ...signedArgs(proposal),
      idempotencyKey: 'idem-key-diff',
      wallet: WALLET,
      now: proposal.expiresAt - 1,
    });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.signature, '5'.repeat(88));
  });

  it('marks an on-chain failure failed, distinct from broadcast timeouts', async () => {
    const proposal = await seed();
    const failed = await submitHalleyLiveProposal({
      proposalId: proposal.id,
      ...signedArgs(proposal),
      idempotencyKey: 'idem-key-0001',
      wallet: WALLET,
      connection: conn({ value: { err: { InstructionError: [0, 'Custom'] } } }),
      now: proposal.expiresAt - 1,
    });
    assert.equal(failed.status, 'failed');

    const proposal2 = await seed();
    const unknown = await submitHalleyLiveProposal({
      proposalId: proposal2.id,
      ...signedArgs(proposal2),
      idempotencyKey: 'idem-key-0002',
      wallet: WALLET,
      connection: conn(new Error('confirm timeout')),
      now: proposal2.expiresAt - 1,
    });
    assert.equal(unknown.status, 'unknown');
    assert.match(unknown.message, /do not relaunch/i);
  });

  it('marks a landed-config failed-pool launch partial, never confirmed', async () => {
    const proposal = await seed();
    let call = 0;
    const staged = {
      sendRawTransaction: async () => `sig${++call}`.padEnd(88, 'x'),
      confirmTransaction: async () => call === 1 ? { value: { err: null } } : { value: { err: { InstructionError: [0, 'Custom'] } } },
    } as unknown as Connection;
    const result = await submitHalleyLiveProposal({
      proposalId: proposal.id,
      ...signedArgs(proposal),
      idempotencyKey: 'idem-key-0001',
      wallet: WALLET,
      connection: staged,
      now: proposal.expiresAt - 1,
    });
    assert.equal(result.status, 'partial');
    assert.equal(result.configSignature?.startsWith('sig1'), true);
    assert.match(result.message, /fresh launch/i);
  });
});
