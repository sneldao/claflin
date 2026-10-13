import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
  HALLEY_SWAP_LIMITS,
  fromRawAmount,
  prepareHalleyClaim,
  prepareHalleySwap,
  submitHalleyTx,
  toRawAmount,
  type HalleyPoolSnapshot,
  type HalleyTxPorts,
} from '../lib/meteora/live-tx';
import { clearHalleyTxMemory } from '../lib/meteora/live-tx-store';
import { HALLEY_QUOTE_MINTS } from '../lib/meteora/catalog';
import { TradingError } from '../lib/trading/domain';
import type { Connection } from '@solana/web3.js';

const WALLET_KP = Keypair.generate();
const WALLET = WALLET_KP.publicKey.toBase58();
const POOL_KP = Keypair.generate();
const POOL = POOL_KP.publicKey.toBase58();
const BASE_MINT_KP = Keypair.generate();
const USDC = HALLEY_QUOTE_MINTS.find(q => q.symbol === 'USDC')!;
const XSTOCK = HALLEY_QUOTE_MINTS.find(q => q.tokenProgram === 'spl-token-2022')!;

function snap(over: Partial<HalleyPoolSnapshot> = {}): HalleyPoolSnapshot {
  return {
    baseMint: BASE_MINT_KP.publicKey.toBase58(),
    quoteMint: USDC.mint,
    baseDecimals: 6,
    quoteTokenFlag: 0,
    isMigrated: false,
    feeClaimer: WALLET,
    partnerQuoteFee: '2500000',
    partnerBaseFee: '0',
    ...over,
  };
}

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

/** Ports whose calls are recorded — proves which SDK path each input took. */
function mockPorts(over: Partial<HalleyTxPorts> = {}): { ports: HalleyTxPorts; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ports: {
      async readPool() { calls.push('readPool'); return snap(); },
      async quoteSwap({ swapBaseForQuote, amountIn, slippageBps }) {
        calls.push(`quoteSwap:${swapBaseForQuote}:${amountIn}:${slippageBps}`);
        return { expectedOut: '950000', minimumOut: '940000', tradingFee: '10000' };
      },
      async buildSwap({ swapBaseForQuote, amountIn, minimumOut }) {
        calls.push(`buildSwap:${swapBaseForQuote}:${amountIn}:${minimumOut}`);
        const transactionBase64 = unsignedTxBase64(7);
        return { transactionBase64, messageHash: hashOf(transactionBase64), blockhash: '11111111111111111111111111111111', lastValidBlockHeight: '999999' };
      },
      async buildClaim({ maxBase, maxQuote }) {
        calls.push(`buildClaim:${maxBase}:${maxQuote}`);
        const transactionBase64 = unsignedTxBase64(8);
        return { transactionBase64, messageHash: hashOf(transactionBase64), blockhash: '11111111111111111111111111111111', lastValidBlockHeight: '999999' };
      },
      ...over,
    },
  };
}

async function error(fn: () => Promise<unknown>): Promise<TradingError> {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof TradingError, `expected TradingError, got ${e}`);
    return e;
  }
  assert.fail('expected a TradingError');
}

describe('halley live tx', () => {
  const prevClient = process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
  const prevServer = process.env.HALLEY_LIVE_ENABLED;

  beforeEach(() => {
    clearHalleyTxMemory();
    process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = 'true';
    process.env.HALLEY_LIVE_ENABLED = 'true';
  });
  afterEach(() => {
    if (prevClient === undefined) delete process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED;
    else process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED = prevClient;
    if (prevServer === undefined) delete process.env.HALLEY_LIVE_ENABLED;
    else process.env.HALLEY_LIVE_ENABLED = prevServer;
  });

  /* ---- raw amount helpers ---- */

  it('toRawAmount reads whole-unit decimals and refuses the rest', () => {
    assert.equal(toRawAmount('10', 6), '10000000');
    assert.equal(toRawAmount('1.5', 6), '1500000');
    assert.equal(toRawAmount('0.000001', 6), '1');
    assert.throws(() => toRawAmount('0', 6), TradingError);
    assert.throws(() => toRawAmount('-5', 6), TradingError);
    assert.throws(() => toRawAmount('abc', 6), TradingError);
    assert.throws(() => toRawAmount('1.0000001', 6), /decimal places/);
  });

  it('fromRawAmount round-trips and trims zeros', () => {
    assert.equal(fromRawAmount('10000000', 6), '10');
    assert.equal(fromRawAmount('1500000', 6), '1.5');
    assert.equal(fromRawAmount('1', 6), '0.000001');
    assert.equal(fromRawAmount('123456789', 8), '1.23456789');
  });

  /* ---- prepare swap: gates ---- */

  it('refuses every action while either live flag is off', async () => {
    process.env.HALLEY_LIVE_ENABLED = 'false';
    const { ports } = mockPorts();
    const e = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '10', ports }));
    assert.equal(e.code, 'desk_unavailable');
  });

  it('refuses malformed pool, wallet, side, and slippage before any RPC', async () => {
    const { ports, calls } = mockPorts();
    await error(() => prepareHalleySwap({ pool: 'not-a-key', wallet: WALLET, side: 'buy', amount: '1', ports }));
    await error(() => prepareHalleySwap({ pool: POOL, wallet: 'nope', side: 'buy', amount: '1', ports }));
    const e1 = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'hold', amount: '1', ports }));
    assert.equal(e1.code, 'invalid_intent');
    const e2 = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '1', slippageBps: HALLEY_SWAP_LIMITS.maxSlippageBps + 1, ports }));
    assert.equal(e2.code, 'invalid_amount');
    assert.deepEqual(calls, []);
  });

  it('refuses a graduated pool — the curve is no longer the market', async () => {
    const { ports } = mockPorts({ readPool: async () => snap({ isMigrated: true }) });
    const e = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '1', ports }));
    assert.equal(e.code, 'route_mismatch');
    assert.match(e.message, /DAMM v2/);
  });

  it('refuses a Token-2022 quote as coverage_pending — no transfer-hook accounts', async () => {
    const { ports } = mockPorts({ readPool: async () => snap({ quoteMint: XSTOCK.mint, quoteTokenFlag: 1 }) });
    const e = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '1', ports }));
    assert.equal(e.code, 'coverage_pending');
  });

  it('caps a live buy at the desk limit', async () => {
    const { ports } = mockPorts();
    const e = await error(() => prepareHalleySwap({
      pool: POOL, wallet: WALLET, side: 'buy',
      amount: String(Number(HALLEY_SWAP_LIMITS.maxBuyQuote) + 1), ports,
    }));
    assert.equal(e.code, 'demo_limit');
  });

  /* ---- prepare swap: direction and quoting ---- */

  it('buys with quote in, tracker out — swapBaseForQuote=false', async () => {
    const { ports, calls } = mockPorts();
    const p = await prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '10', ports, now: 1_700_000_000_000 });
    assert.equal(p.kind, 'swap');
    assert.equal(p.side, 'buy');
    assert.equal(p.amountIn, '10000000'); // 10 USDC at 6dp
    assert.equal(p.minimumOut, '940000');
    assert.equal(p.slippageBps, 100);
    assert.equal(p.expiresAt, 1_700_000_000_000 + 45_000);
    assert.match(p.summary, /Buy on the curve/);
    assert.deepEqual(calls, ['readPool', 'quoteSwap:false:10000000:100', 'buildSwap:false:10000000:940000']);
  });

  it('sells with tracker in, quote out — swapBaseForQuote=true', async () => {
    const { ports, calls } = mockPorts();
    const p = await prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'sell', amount: '50', ports });
    assert.equal(p.side, 'sell');
    assert.equal(p.amountIn, '50000000'); // 50 tracker at 6dp
    assert.deepEqual(calls, ['readPool', 'quoteSwap:true:50000000:100', 'buildSwap:true:50000000:940000']);
  });

  it('refuses a quote that returns nothing', async () => {
    const { ports } = mockPorts({
      quoteSwap: async () => ({ expectedOut: '0', minimumOut: '0', tradingFee: '0' }),
    });
    const e = await error(() => prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '1', ports }));
    assert.equal(e.code, 'quote_unavailable');
  });

  /* ---- prepare claim ---- */

  it('only the fee claimer can collect, and only when fees exist', async () => {
    const other = Keypair.generate().publicKey.toBase58();
    const { ports } = mockPorts();
    const e1 = await error(() => prepareHalleyClaim({ pool: POOL, wallet: other, ports }));
    assert.equal(e1.code, 'invalid_intent');
    const broke = mockPorts({ readPool: async () => snap({ partnerQuoteFee: '0', partnerBaseFee: '0' }) });
    const e2 = await error(() => prepareHalleyClaim({ pool: POOL, wallet: WALLET, ports: broke.ports }));
    assert.equal(e2.code, 'invalid_amount');
  });

  it('builds a claim for the accrued partner fees', async () => {
    const { ports, calls } = mockPorts();
    const p = await prepareHalleyClaim({ pool: POOL, wallet: WALLET, ports, now: 1_700_000_000_000 });
    assert.equal(p.kind, 'claim');
    assert.equal(p.expectedOut, '2500000');
    assert.match(p.summary, /2\.5 USDC/);
    assert.deepEqual(calls, ['readPool', 'buildClaim:0:2500000']);
  });

  /* ---- submit ---- */

  async function seededBuy() {
    const { ports } = mockPorts();
    return prepareHalleySwap({ pool: POOL, wallet: WALLET, side: 'buy', amount: '10', ports });
  }

  it('refuses an unknown or expired proposal', async () => {
    const e = await error(() => submitHalleyTx({
      proposalId: 'missing', signedTransactionBase64: unsignedTxBase64(1), idempotencyKey: 'key-0001', wallet: WALLET,
    }));
    assert.equal(e.code, 'quote_expired');
    const p = await seededBuy();
    const e2 = await error(() => submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: unsignedTxBase64(1), idempotencyKey: 'key-0002', wallet: WALLET,
      now: p.expiresAt + 1,
    }));
    assert.equal(e2.code, 'quote_expired');
  });

  it('refuses the wrong wallet, a mismatched transaction, and an unsigned one', async () => {
    const p = await seededBuy();
    const e1 = await error(() => submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: p.transactionBase64,
      idempotencyKey: 'key-0003', wallet: Keypair.generate().publicKey.toBase58(),
    }));
    assert.equal(e1.code, 'invalid_intent');
    const e2 = await error(() => submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: unsignedTxBase64(99), // different message
      idempotencyKey: 'key-0004', wallet: WALLET,
    }));
    assert.equal(e2.code, 'route_mismatch');
    const e3 = await error(() => submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: p.transactionBase64, // prepared tx is unsigned
      idempotencyKey: 'key-0005', wallet: WALLET,
    }));
    assert.equal(e3.code, 'route_mismatch');
  });

  it('confirms a correctly signed swap and replays the same idempotency key', async () => {
    const p = await seededBuy();
    const signed = VersionedTransaction.deserialize(Buffer.from(p.transactionBase64, 'base64'));
    signed.sign([WALLET_KP]);
    const signedB64 = Buffer.from(signed.serialize()).toString('base64');
    const sent: string[] = [];
    const connection = {
      sendRawTransaction: async (raw: Buffer) => { sent.push(raw.toString('hex').slice(0, 16)); return 'sig-abc'; },
      confirmTransaction: async () => ({ value: { err: null } }),
    } as unknown as Connection;

    const result = await submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: signedB64,
      idempotencyKey: 'key-0006', wallet: WALLET, connection,
    });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.signature, 'sig-abc');
    assert.match(result.message, /Buy confirmed/);
    assert.equal(sent.length, 1);

    const replay = await submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: signedB64,
      idempotencyKey: 'key-0006', wallet: WALLET, connection,
    });
    assert.equal(replay.signature, 'sig-abc');
    assert.equal(sent.length, 1); // never re-broadcast

    const clash = await error(() => submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: signedB64,
      idempotencyKey: 'key-different', wallet: WALLET, connection,
    }));
    assert.equal(clash.code, 'route_mismatch');
  });

  it('marks a timed-out confirmation unknown, never silently resends', async () => {
    const p = await seededBuy();
    const signed = VersionedTransaction.deserialize(Buffer.from(p.transactionBase64, 'base64'));
    signed.sign([WALLET_KP]);
    const connection = {
      sendRawTransaction: async () => 'sig-timeout',
      confirmTransaction: async () => { throw new Error('timeout'); },
    } as unknown as Connection;
    const result = await submitHalleyTx({
      proposalId: p.id, signedTransactionBase64: Buffer.from(signed.serialize()).toString('base64'),
      idempotencyKey: 'key-0007', wallet: WALLET, connection,
    });
    assert.equal(result.status, 'unknown');
    assert.match(result.message, /do not resend/);
  });
});
