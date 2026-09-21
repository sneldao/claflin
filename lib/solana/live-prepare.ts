/**
 * Prepare a Jesse live Jupiter proposal — fresh Metis order with taker.
 * Separate from paper quoting; never reuses a paper estimate's provider id.
 */

import { createHash } from 'node:crypto';
import { VersionedTransaction } from '@solana/web3.js';
import {
  decodeBase58,
  getSolanaInstrument,
  SOLANA_USDC_DECIMALS,
  SOLANA_USDC_MINT,
} from './catalog';
import { compareDecimals, displayedToRaw, effectiveDisplayed, rawToDisplayed } from './amounts';
import { createMintReader } from './mint';
import { isJesseIntent, type JesseIntent, type SolanaLiveProposal } from './contracts';
import { createJupiterLiveOrderClient, type JupiterLiveOrder } from './jupiter-live';
import { JUPITER_SLIPPAGE_BPS } from './jupiter';
import { saveLiveProposal } from './live-store';
import { jesseLiveEnabled } from './flags';
import { formatAmount, parseAmount, TradingError } from '../trading/domain';

/** Per-order live caps — aligned with Jesse amount chips; paper stays uncapped within paper limits. */
export const JESSE_LIVE_LIMITS = {
  buyMax: '250',
  sellMax: '10',
  quoteDecimals: 6,
} as const;

const REVIEW_WINDOW_MS = 60_000;

export function hashVersionedMessage(transactionBase64: string): string {
  const tx = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
  return createHash('sha256').update(tx.message.serialize()).digest('hex');
}

function assertLiveWallet(wallet: string): string {
  if (typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
    throw new TradingError('invalid_intent', 'Connect a Solana wallet before preparing a live order.', 422);
  }
  const decoded = decodeBase58(wallet);
  if (!decoded || decoded.length !== 32) {
    throw new TradingError('invalid_intent', 'That wallet address is not a valid Solana public key.', 422);
  }
  return wallet;
}

export async function prepareJesseLiveProposal(args: {
  intent: unknown;
  wallet: string;
  revision: number;
  order?: (request: { inputMint: string; outputMint: string; amountRaw: string; taker: string }) => Promise<JupiterLiveOrder>;
  readMint?: (mint: string) => Promise<{
    decimals: number;
    multiplier: string;
    observedSlot: number;
    observedAt: number;
    nextEffectiveAt: number | null;
  }>;
  now?: number;
  id?: string;
}): Promise<SolanaLiveProposal> {
  if (!jesseLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Jesse live settle is not enabled on this deployment.', 403);
  }
  if (!isJesseIntent(args.intent)) {
    throw new TradingError('invalid_intent', 'Use a supported Solana instrument, buy with a USDC spend, or sell a scaled token quantity.');
  }
  const intent = args.intent as JesseIntent;
  const wallet = assertLiveWallet(args.wallet);
  const instrument = getSolanaInstrument(intent.instrumentId);
  if (!instrument.quoteSupported) {
    throw new TradingError('coverage_pending', 'Live coverage for this instrument has not been verified.', 422);
  }

  const now = args.now ?? Date.now();
  const readMint = args.readMint ?? createMintReader({
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
  });
  const orderFn = args.order ?? createJupiterLiveOrderClient();

  const mint = await readMint(instrument.mint);
  if (mint.decimals !== instrument.decimals) {
    throw new TradingError('unverified_units', 'Token units have changed since verification. No live order is available.', 422);
  }

  const buy = intent.side === 'buy';
  let amountInRaw: string;
  if (buy) {
    const spend = parseAmount(intent.amount, SOLANA_USDC_DECIMALS);
    if (spend > parseAmount(JESSE_LIVE_LIMITS.buyMax, SOLANA_USDC_DECIMALS)) {
      throw new TradingError(
        'demo_limit',
        `Live order limit: ${JESSE_LIVE_LIMITS.buyMax} USDC per buy or ${JESSE_LIVE_LIMITS.sellMax} scaled tokens per sell.`,
      );
    }
    amountInRaw = spend.toString();
  } else {
    if (compareDecimals(intent.amount, JESSE_LIVE_LIMITS.sellMax) > 0) {
      throw new TradingError(
        'demo_limit',
        `Live order limit: ${JESSE_LIVE_LIMITS.buyMax} USDC per buy or ${JESSE_LIVE_LIMITS.sellMax} scaled tokens per sell.`,
      );
    }
    try {
      amountInRaw = displayedToRaw(intent.amount, instrument.decimals, mint.multiplier).toString();
    } catch (error) {
      throw new TradingError('invalid_amount', error instanceof Error ? error.message : 'Enter a positive decimal amount.');
    }
  }

  const liveOrder = await orderFn({
    inputMint: buy ? SOLANA_USDC_MINT : instrument.mint,
    outputMint: buy ? instrument.mint : SOLANA_USDC_MINT,
    amountRaw: amountInRaw,
    taker: wallet,
  });

  let messageHash: string;
  try {
    messageHash = hashVersionedMessage(liveOrder.transactionBase64);
  } catch {
    throw new TradingError('invalid_quote', 'The venue returned a transaction that could not be verified.', 503);
  }

  const stockRaw = BigInt(buy ? liveOrder.outAmount : amountInRaw);
  const scaling = {
    multiplier: mint.multiplier,
    observedSlot: mint.observedSlot,
    observedAt: mint.observedAt,
    nextEffectiveAt: mint.nextEffectiveAt,
  };
  const expiresAt = mint.nextEffectiveAt !== null
    ? Math.min(now + REVIEW_WINDOW_MS, mint.nextEffectiveAt)
    : now + REVIEW_WINDOW_MS;

  const proposal: SolanaLiveProposal = {
    version: 1,
    id: args.id ?? crypto.randomUUID(),
    deskId: 'jesse',
    network: 'solana:mainnet',
    mode: 'live',
    intent: { ...intent, instrumentId: instrument.id },
    wallet,
    revision: args.revision,
    reviewedEstimate: {
      inputMint: buy ? SOLANA_USDC_MINT : instrument.mint,
      outputMint: buy ? instrument.mint : SOLANA_USDC_MINT,
      inputSymbol: buy ? 'USDC' : instrument.symbol,
      outputSymbol: buy ? instrument.symbol : 'USDC',
      inputAmount: buy
        ? formatAmount(BigInt(amountInRaw), SOLANA_USDC_DECIMALS)
        : effectiveDisplayed(stockRaw, instrument.decimals, mint.multiplier),
      outputAmount: buy
        ? rawToDisplayed(BigInt(liveOrder.outAmount), instrument.decimals, mint.multiplier)
        : formatAmount(BigInt(liveOrder.outAmount), SOLANA_USDC_DECIMALS),
      amountInRaw,
      amountOutRaw: liveOrder.outAmount,
      minOutputRaw: liveOrder.minOutputRaw,
      router: liveOrder.router,
      feeBps: liveOrder.feeBps,
      slippageBps: liveOrder.slippageBps ?? JUPITER_SLIPPAGE_BPS,
      scaling,
    },
    transactionBase64: liveOrder.transactionBase64,
    messageHash,
    providerRequestId: liveOrder.providerRequestId,
    lastValidBlockHeight: liveOrder.lastValidBlockHeight,
    expiresAt,
    minOutputRaw: liveOrder.minOutputRaw,
    slippageBps: liveOrder.slippageBps ?? JUPITER_SLIPPAGE_BPS,
    feeSummary: {
      networkFeeLamports: null,
      rentLamports: null,
      providerFeeBps: liveOrder.feeBps,
    },
  };

  await saveLiveProposal(proposal, Math.max(5_000, expiresAt - now));
  return proposal;
}

/** Verify signed bytes still bind to the prepared unsigned message. */
export function signedTransactionBindsToProposal(
  proposal: SolanaLiveProposal,
  signedTransactionBase64: string,
): boolean {
  try {
    const unsigned = VersionedTransaction.deserialize(Buffer.from(proposal.transactionBase64, 'base64'));
    const signed = VersionedTransaction.deserialize(Buffer.from(signedTransactionBase64, 'base64'));
    return Buffer.from(unsigned.message.serialize()).equals(Buffer.from(signed.message.serialize()));
  } catch {
    return false;
  }
}
