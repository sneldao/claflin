/**
 * Halley live actions on a launched pool — the participant side of the
 * desk. A launch nobody can buy into is a launch with no market, so the
 * desk prepares two single-transaction actions against an existing DBC pool:
 *
 * - swap: buy the tracker token with the quote asset, or sell it back, on
 *   the curve — quoted with the SDK's own swap math at the current slot,
 *   with a slippage floor enforced on-chain (`minimumAmountOut`).
 * - claim: the launcher (the config's fee claimer) collects accrued curve
 *   trading fees.
 *
 * Same discipline as the launch: built server-side, hashed, signed
 * unchanged by the wallet, verified byte-for-byte before broadcast, behind
 * the same dual live flags.
 *
 * Scope boundary, stated rather than guessed: only SPL-quoted pools (USDC)
 * are swapped or claimed here. xStock quotes are Token-2022 mints with
 * transfer hooks, and the SDK's swap builder adds no transfer-hook
 * accounts — a swap against them is refused as coverage_pending instead of
 * being sent to fail on-chain. A migrated pool is refused too: after
 * graduation the market is the DAMM v2 pool, not the curve.
 */

import { createHash } from 'node:crypto';
import BN from 'bn.js';
import { Connection, PublicKey, VersionedTransaction, type Transaction } from '@solana/web3.js';
import { DynamicBondingCurveClient, getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { decodeBase58 } from '../solana/catalog';
import { TradingError } from '../trading/domain';
import { HALLEY_QUOTE_MINTS } from './catalog';
import { halleyLiveEnabled } from './flags';
import { signedTransactionBindsToMessage } from './live-prepare';
import { broadcastAndConfirm, isZeroSignature } from './live-submit';
import { loadHalleyTxProposal, markHalleyTxProposal, saveHalleyTxProposal } from './live-tx-store';
import type { HalleyTxProposal, HalleyTxResult } from './live-contracts';
import { HALLEY_SWAP_LIMITS } from './limits';

export { HALLEY_SWAP_LIMITS };

const REVIEW_WINDOW_MS = 45_000;

/* ---- pure helpers ---- */

/** Whole-unit decimal string → raw integer string at `decimals`. */
export function toRawAmount(amount: string, decimals: number): string {
  if (typeof amount !== 'string' || !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount)) {
    throw new TradingError('invalid_amount', 'The amount is not a readable number.', 422);
  }
  const [whole, frac = ''] = amount.split('.');
  if (frac.length > decimals) {
    throw new TradingError('invalid_amount', `At most ${decimals} decimal places for this asset.`, 422);
  }
  const raw = BigInt(whole + frac.padEnd(decimals, '0'));
  if (raw <= BigInt(0)) throw new TradingError('invalid_amount', 'The amount must be greater than zero.', 422);
  return raw.toString();
}

/** Raw integer string → whole-unit decimal string, trailing zeros trimmed. */
export function fromRawAmount(raw: string, decimals: number): string {
  const s = raw.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

function assertWallet(wallet: string): string {
  const decoded = typeof wallet === 'string' ? decodeBase58(wallet) : null;
  if (!decoded || decoded.length !== 32) {
    throw new TradingError('invalid_intent', 'Connect a Solana wallet first.', 422);
  }
  return wallet;
}

function assertPool(pool: string): string {
  const decoded = typeof pool === 'string' ? decodeBase58(pool) : null;
  if (!decoded || decoded.length !== 32) {
    throw new TradingError('invalid_intent', 'A launched pool address is required.', 422);
  }
  return pool;
}

function hashMessage(bytes: Uint8Array): string {
  return createHash('sha256').update(VersionedTransaction.deserialize(bytes).message.serialize()).digest('hex');
}

/* ---- ports ---- */

export interface HalleyPoolSnapshot {
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  /** 0 = SPL Token, 1 = Token-2022. */
  quoteTokenFlag: number;
  isMigrated: boolean;
  feeClaimer: string;
  /** Unclaimed partner (launcher) fees, raw. */
  partnerQuoteFee: string;
  partnerBaseFee: string;
}

export interface HalleyBuiltTx {
  transactionBase64: string;
  messageHash: string;
  blockhash: string;
  lastValidBlockHeight: string | null;
}

export interface HalleySwapQuote {
  expectedOut: string;
  minimumOut: string;
  tradingFee: string;
}

export interface HalleyTxPorts {
  readPool(pool: string): Promise<HalleyPoolSnapshot | null>;
  quoteSwap(args: { pool: string; swapBaseForQuote: boolean; amountIn: string; slippageBps: number }): Promise<HalleySwapQuote>;
  buildSwap(args: { pool: string; wallet: string; swapBaseForQuote: boolean; amountIn: string; minimumOut: string }): Promise<HalleyBuiltTx>;
  buildClaim(args: { pool: string; wallet: string; maxBase: string; maxQuote: string }): Promise<HalleyBuiltTx>;
}

/** The real ports — DBC SDK against SOLANA_RPC_URL. */
export function createHalleyTxPorts({
  rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
  commitment = 'confirmed',
}: { rpcUrl?: string; commitment?: 'processed' | 'confirmed' | 'finalized' } = {}): HalleyTxPorts {
  const connection = new Connection(rpcUrl, commitment);
  const client = DynamicBondingCurveClient.create(connection, commitment);

  async function finish(tx: Transaction, wallet: string): Promise<HalleyBuiltTx> {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
    tx.recentBlockhash = blockhash;
    tx.feePayer = new PublicKey(wallet);
    const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
      transactionBase64: Buffer.from(bytes).toString('base64'),
      messageHash: hashMessage(bytes),
      blockhash,
      lastValidBlockHeight: String(lastValidBlockHeight),
    };
  }

  return {
    async readPool(pool) {
      const key = new PublicKey(pool);
      const virtualPool = await client.state.getPool(key);
      if (!virtualPool) return null;
      const state = virtualPool.poolState;
      const config = await client.state.getPoolConfig(state.config);
      if (!config) return null;
      const metrics = await client.state.getPoolFeeMetrics(key).catch(() => null);
      return {
        baseMint: state.baseMint.toBase58(),
        quoteMint: config.quoteMint.toBase58(),
        baseDecimals: Number(config.tokenDecimal),
        quoteTokenFlag: Number(config.quoteTokenFlag),
        isMigrated: Boolean(state.isMigrated),
        feeClaimer: config.feeClaimer.toBase58(),
        partnerQuoteFee: metrics?.current.partnerQuoteFee.toString() ?? '0',
        partnerBaseFee: metrics?.current.partnerBaseFee.toString() ?? '0',
      };
    },
    async quoteSwap({ pool, swapBaseForQuote, amountIn, slippageBps }) {
      const key = new PublicKey(pool);
      const virtualPool = await client.state.getPool(key);
      if (!virtualPool) throw new TradingError('quote_unavailable', 'That pool could not be read.', 404);
      const config = await client.state.getPoolConfig(virtualPool.poolState.config);
      if (!config) throw new TradingError('quote_unavailable', 'That pool\u2019s config could not be read.', 404);
      const currentPoint = await getCurrentPoint(connection, config.activationType);
      const q = client.pool.swapQuote({
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn: new BN(amountIn),
        slippageBps,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint,
      }) as { outputAmount: BN; minimumAmountOut: BN; tradingFee?: BN };
      return {
        expectedOut: q.outputAmount.toString(),
        minimumOut: q.minimumAmountOut.toString(),
        tradingFee: q.tradingFee?.toString() ?? '0',
      };
    },
    async buildSwap({ pool, wallet, swapBaseForQuote, amountIn, minimumOut }) {
      const tx = await client.pool.swap({
        owner: new PublicKey(wallet),
        pool: new PublicKey(pool),
        amountIn: new BN(amountIn),
        minimumAmountOut: new BN(minimumOut),
        swapBaseForQuote,
        referralTokenAccount: null,
      });
      return finish(tx, wallet);
    },
    async buildClaim({ pool, wallet, maxBase, maxQuote }) {
      const owner = new PublicKey(wallet);
      const tx = await client.partner.claimPartnerTradingFee({
        feeClaimer: owner,
        payer: owner,
        pool: new PublicKey(pool),
        maxBaseAmount: new BN(maxBase),
        maxQuoteAmount: new BN(maxQuote),
      });
      return finish(tx, wallet);
    },
  };
}

/* ---- prepare ---- */

function quoteFor(snapshot: HalleyPoolSnapshot) {
  const quote = HALLEY_QUOTE_MINTS.find(q => q.mint === snapshot.quoteMint);
  if (!quote) {
    throw new TradingError('invalid_intent', 'That pool is not quoted in an asset from Halley\u2019s verified catalog.', 422);
  }
  if (snapshot.quoteTokenFlag !== 0 || quote.tokenProgram !== 'spl-token') {
    throw new TradingError(
      'coverage_pending',
      `${quote.symbol} is a Token-2022 quote with transfer hooks; the desk does not swap or claim against it yet. Trade it from a terminal that resolves transfer-hook accounts.`,
      422,
    );
  }
  return quote;
}

async function readLivePool(ports: HalleyTxPorts, pool: string): Promise<HalleyPoolSnapshot> {
  const snapshot = await ports.readPool(pool);
  if (!snapshot) throw new TradingError('quote_unavailable', 'No DBC pool at this address on the configured cluster.', 404);
  return snapshot;
}

export async function prepareHalleySwap(args: {
  pool: string;
  wallet: string;
  side: unknown;
  amount: string;
  slippageBps?: number;
  ports?: HalleyTxPorts;
  now?: number;
  id?: string;
}): Promise<HalleyTxProposal> {
  if (!halleyLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Halley live trading is not enabled on this deployment.', 403);
  }
  const pool = assertPool(args.pool);
  const wallet = assertWallet(args.wallet);
  if (args.side !== 'buy' && args.side !== 'sell') {
    throw new TradingError('invalid_intent', 'Say buy or sell.', 422);
  }
  const side = args.side;
  const slippageBps = args.slippageBps ?? HALLEY_SWAP_LIMITS.defaultSlippageBps;
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > HALLEY_SWAP_LIMITS.maxSlippageBps) {
    throw new TradingError('invalid_amount', `Slippage must be between 1 and ${HALLEY_SWAP_LIMITS.maxSlippageBps} bps.`, 422);
  }

  const ports = args.ports ?? createHalleyTxPorts();
  const snapshot = await readLivePool(ports, pool);
  if (snapshot.isMigrated) {
    throw new TradingError('route_mismatch', 'This launch has graduated \u2014 the market is the DAMM v2 pool now, not the curve.', 422);
  }
  const quote = quoteFor(snapshot);
  const swapBaseForQuote = side === 'sell';
  const inDecimals = swapBaseForQuote ? snapshot.baseDecimals : quote.decimals;
  const outDecimals = swapBaseForQuote ? quote.decimals : snapshot.baseDecimals;
  const amountIn = toRawAmount(args.amount, inDecimals);
  if (side === 'buy' && BigInt(amountIn) > BigInt(toRawAmount(HALLEY_SWAP_LIMITS.maxBuyQuote, quote.decimals))) {
    throw new TradingError('demo_limit', `Live buy limit: ${HALLEY_SWAP_LIMITS.maxBuyQuote} ${quote.symbol} per order.`, 422);
  }

  const q = await ports.quoteSwap({ pool, swapBaseForQuote, amountIn, slippageBps });
  if (BigInt(q.minimumOut) <= BigInt(0)) {
    throw new TradingError('quote_unavailable', 'The curve returns nothing for that size \u2014 try a larger amount.', 422);
  }
  const built = await ports.buildSwap({ pool, wallet, swapBaseForQuote, amountIn, minimumOut: q.minimumOut });

  const now = args.now ?? Date.now();
  const inSym = swapBaseForQuote ? 'tracker' : quote.symbol;
  const outSym = swapBaseForQuote ? quote.symbol : 'tracker';
  const proposal: HalleyTxProposal = {
    version: 1,
    id: args.id ?? crypto.randomUUID(),
    deskId: 'halley',
    network: 'solana:mainnet',
    mode: 'live',
    kind: 'swap',
    wallet,
    pool,
    baseMint: snapshot.baseMint,
    quoteMint: snapshot.quoteMint,
    quoteSymbol: quote.symbol,
    side,
    amountIn,
    amountInDecimals: inDecimals,
    expectedOut: q.expectedOut,
    minimumOut: q.minimumOut,
    amountOutDecimals: outDecimals,
    slippageBps,
    tradingFee: q.tradingFee,
    ...built,
    quotedAt: now,
    expiresAt: now + REVIEW_WINDOW_MS,
    summary: `${side === 'buy' ? 'Buy' : 'Sell'} on the curve: ${fromRawAmount(amountIn, inDecimals)} ${inSym} for at least ${fromRawAmount(q.minimumOut, outDecimals)} ${outSym} (quoted ${fromRawAmount(q.expectedOut, outDecimals)}, ${slippageBps / 100}% slippage floor).`,
  };
  await saveHalleyTxProposal(proposal, REVIEW_WINDOW_MS);
  return proposal;
}

export async function prepareHalleyClaim(args: {
  pool: string;
  wallet: string;
  ports?: HalleyTxPorts;
  now?: number;
  id?: string;
}): Promise<HalleyTxProposal> {
  if (!halleyLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Halley live trading is not enabled on this deployment.', 403);
  }
  const pool = assertPool(args.pool);
  const wallet = assertWallet(args.wallet);
  const ports = args.ports ?? createHalleyTxPorts();
  const snapshot = await readLivePool(ports, pool);
  const quote = quoteFor(snapshot);
  if (snapshot.feeClaimer !== wallet) {
    throw new TradingError('invalid_intent', 'Only the launch\u2019s fee claimer can collect its curve fees.', 403);
  }
  if (BigInt(snapshot.partnerQuoteFee) === BigInt(0) && BigInt(snapshot.partnerBaseFee) === BigInt(0)) {
    throw new TradingError('invalid_amount', 'No curve fees have accrued to claim yet.', 422);
  }
  const built = await ports.buildClaim({
    pool,
    wallet,
    maxBase: snapshot.partnerBaseFee,
    maxQuote: snapshot.partnerQuoteFee,
  });
  const now = args.now ?? Date.now();
  const proposal: HalleyTxProposal = {
    version: 1,
    id: args.id ?? crypto.randomUUID(),
    deskId: 'halley',
    network: 'solana:mainnet',
    mode: 'live',
    kind: 'claim',
    wallet,
    pool,
    baseMint: snapshot.baseMint,
    quoteMint: snapshot.quoteMint,
    quoteSymbol: quote.symbol,
    side: null,
    amountIn: '0',
    amountInDecimals: quote.decimals,
    expectedOut: snapshot.partnerQuoteFee,
    minimumOut: '0',
    amountOutDecimals: quote.decimals,
    slippageBps: 0,
    tradingFee: '0',
    ...built,
    quotedAt: now,
    expiresAt: now + REVIEW_WINDOW_MS,
    summary: `Collect ${fromRawAmount(snapshot.partnerQuoteFee, quote.decimals)} ${quote.symbol} of accrued curve trading fees.`,
  };
  await saveHalleyTxProposal(proposal, REVIEW_WINDOW_MS);
  return proposal;
}

/* ---- submit ---- */

export async function submitHalleyTx(args: {
  proposalId: string;
  signedTransactionBase64: string;
  idempotencyKey: string;
  wallet: string;
  connection?: Connection;
  now?: number;
}): Promise<HalleyTxResult> {
  if (!halleyLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Halley live trading is not enabled on this deployment.', 403);
  }
  if (typeof args.signedTransactionBase64 !== 'string' || args.signedTransactionBase64.length < 32) {
    throw new TradingError('invalid_intent', 'Missing signed transaction.', 422);
  }
  if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length < 8) {
    throw new TradingError('invalid_intent', 'Missing idempotency key.', 422);
  }
  const stored = await loadHalleyTxProposal(args.proposalId);
  if (!stored) throw new TradingError('quote_expired', 'That proposal expired or was not found. Prepare a fresh one.', 410);
  const { proposal } = stored;
  const result = (status: HalleyTxResult['status'], message: string, signature: string | null): HalleyTxResult => ({
    proposalId: proposal.id,
    kind: proposal.kind,
    status,
    signature,
    message,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
  });

  /* Idempotent replay: the same key returns the recorded outcome. */
  if (stored.status !== 'prepared') {
    if (stored.idempotencyKey === args.idempotencyKey) {
      return result(
        stored.status === 'submitted' ? 'unknown' : stored.status,
        'Already submitted \u2014 this is the recorded outcome.',
        stored.signature,
      );
    }
    throw new TradingError('route_mismatch', 'That proposal was already submitted.', 409);
  }
  if ((args.now ?? Date.now()) >= proposal.expiresAt) {
    throw new TradingError('quote_expired', 'That quote expired \u2014 the curve moves. Prepare a fresh one.', 410);
  }
  if (proposal.wallet !== args.wallet) {
    throw new TradingError('invalid_intent', 'Wallet does not match the prepared proposal.', 403);
  }
  if (!signedTransactionBindsToMessage(proposal.transactionBase64, args.signedTransactionBase64)) {
    throw new TradingError('route_mismatch', 'The signed transaction does not match the prepared one.', 422);
  }
  let signed: VersionedTransaction;
  try {
    signed = VersionedTransaction.deserialize(Buffer.from(args.signedTransactionBase64, 'base64'));
  } catch {
    throw new TradingError('route_mismatch', 'Signed transaction could not be read.', 422);
  }
  if (!signed.signatures[0] || isZeroSignature(signed.signatures[0])) {
    throw new TradingError('route_mismatch', 'The wallet did not sign the transaction.', 422);
  }

  await markHalleyTxProposal(proposal.id, { status: 'submitted', idempotencyKey: args.idempotencyKey });
  const connection = args.connection ?? new Connection(process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com', 'confirmed');
  const sent = await broadcastAndConfirm(
    connection,
    Buffer.from(args.signedTransactionBase64, 'base64'),
    proposal.blockhash,
    proposal.lastValidBlockHeight ? Number(proposal.lastValidBlockHeight) : 0,
  );
  await markHalleyTxProposal(proposal.id, { status: sent.outcome, signature: sent.signature || null });
  const what = proposal.kind === 'claim' ? 'Fee claim' : proposal.side === 'buy' ? 'Buy' : 'Sell';
  if (sent.outcome === 'confirmed') return result('confirmed', `${what} confirmed on the curve.`, sent.signature);
  if (sent.outcome === 'unknown') {
    return result('unknown', `${what} was broadcast but confirmation timed out \u2014 reconcile the signature; do not resend.`, sent.signature);
  }
  return result('failed', `${what} did not land.${sent.detail ? ` ${sent.detail}` : ''}`, sent.signature || null);
}
