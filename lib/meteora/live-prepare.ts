/**
 * Prepare a Halley live launch proposal — two exact transactions bound to a
 * verified launch intent: createConfig (the 16-segment curve, ~1KB) then
 * createPool (the mint + bonding curve pool).
 *
 * A full 16-segment curve config does not fit a single Solana transaction
 * (1232-byte packet limit), and the paper preview projects exactly that
 * curve — so the launch splits at the protocol's natural seam rather than
 * degrade the curve. Both transactions share one blockhash and one review
 * window; the submit broadcasts them in order.
 *
 * The transactions are built server-side so each message can be hashed and
 * the signed result verified before broadcast. The ephemeral config and
 * base-mint keypairs are generated here and partially sign their
 * transactions — they are account-creation signers only and carry no
 * post-launch authority. The caller's wallet is payer, pool creator, fee
 * claimer and leftover receiver: the launch happens *from* the launcher's
 * wallet, in the same posture as every other launchpad.
 */

import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { decodeBase58 } from '../solana/catalog';
import { TradingError } from '../trading/domain';
import { isHalleyLaunchIntent, type HalleyLaunchIntent } from './contracts';
import { quoteMintForSymbol, type HalleyQuoteMint } from './catalog';
import { buildLaunchConfig, estimateLaunch } from './dbc';
import { resolveAnchor } from './anchor';
import { halleyLiveEnabled } from './flags';
import { saveHalleyLiveProposal } from './live-store';
import type { HalleyLiveProposal } from './live-contracts';

/** Live launch caps — tighter than paper's free-form projection. */
export const HALLEY_LIVE_LIMITS = {
  maxSupply: '1000000000000', // 1e12 whole tracker tokens
  maxGraduationQuote: '10000000', // 10M quote units
} as const;

const REVIEW_WINDOW_MS = 90_000;

export interface HalleyBuiltLaunch {
  configTransactionBase64: string;
  configMessageHash: string;
  poolTransactionBase64: string;
  poolMessageHash: string;
  blockhash: string;
  lastValidBlockHeight: string | null;
  pool: string;
  baseMint: string;
  config: string;
}

export type HalleyLaunchBuilder = (args: {
  intent: HalleyLaunchIntent;
  quote: HalleyQuoteMint;
  configParams: ConfigParameters;
  wallet: string;
  metadataUri: string;
}) => Promise<HalleyBuiltLaunch>;

function assertLiveWallet(wallet: string): string {
  if (typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
    throw new TradingError('invalid_intent', 'Connect a Solana wallet before preparing a live launch.', 422);
  }
  const decoded = decodeBase58(wallet);
  if (!decoded || decoded.length !== 32) {
    throw new TradingError('invalid_intent', 'That wallet address is not a valid Solana public key.', 422);
  }
  return wallet;
}

function assertLiveLimits(intent: HalleyLaunchIntent): void {
  try {
    if (BigInt(intent.supply) > BigInt(HALLEY_LIVE_LIMITS.maxSupply)) {
      throw new TradingError(
        'demo_limit',
        `Live launch limit: ${HALLEY_LIVE_LIMITS.maxSupply} supply and ${HALLEY_LIVE_LIMITS.maxGraduationQuote} quote units to graduation.`,
        422,
      );
    }
    const graduation = Number(intent.graduationQuote);
    if (!Number.isFinite(graduation) || graduation > Number(HALLEY_LIVE_LIMITS.maxGraduationQuote)) {
      throw new TradingError(
        'demo_limit',
        `Live launch limit: ${HALLEY_LIVE_LIMITS.maxSupply} supply and ${HALLEY_LIVE_LIMITS.maxGraduationQuote} quote units to graduation.`,
        422,
      );
    }
  } catch (error) {
    if (error instanceof TradingError) throw error;
    throw new TradingError('invalid_amount', 'The launch supply or graduation line is not a readable number.', 422);
  }
}

export function metadataUriFor(intent: HalleyLaunchIntent): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://claflin.trustfall.xyz').replace(/\/$/, '');
  const params = new URLSearchParams({ symbol: intent.symbol, name: intent.name });
  if (intent.anchorSymbol) params.set('anchor', intent.anchorSymbol);
  return `${base}/api/desk/halley/token-metadata?${params.toString()}`;
}

/**
 * The real builder — assembles the split `createConfigAndPoolWithFirstBuy`
 * pair (no first buy), shares one fresh blockhash across both, partially
 * signs the ephemeral config keypair on tx1 and the ephemeral base-mint
 * keypair on tx2, and leaves the payer slot for the caller's wallet.
 */
export function createHalleyLaunchBuilder({
  rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
  commitment = 'confirmed',
}: {
  rpcUrl?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
} = {}): HalleyLaunchBuilder {
  return async ({ intent, quote, configParams, wallet, metadataUri }) => {
    const connection = new Connection(rpcUrl, commitment);
    const client = DynamicBondingCurveClient.create(connection, commitment);
    const payer = new PublicKey(wallet);
    const config = Keypair.generate();
    const baseMint = Keypair.generate();

    const { createConfigTx, createPoolWithFirstBuyTx } = await client.partner.createConfigAndPoolWithFirstBuy({
      payer,
      config: config.publicKey,
      feeClaimer: payer,
      leftoverReceiver: payer,
      quoteMint: new PublicKey(quote.mint),
      ...(quote.badge ? { tokenBadge: new PublicKey(quote.badge) } : {}),
      ...configParams,
      preCreatePoolParam: {
        baseMint: baseMint.publicKey,
        name: intent.name.slice(0, 32),
        symbol: intent.symbol.slice(0, 10),
        uri: metadataUri,
        poolCreator: payer,
      },
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
    for (const tx of [createConfigTx, createPoolWithFirstBuyTx]) {
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;
    }
    createConfigTx.partialSign(config);
    createPoolWithFirstBuyTx.partialSign(baseMint);

    const configBytes = createConfigTx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const poolBytes = createPoolWithFirstBuyTx.serialize({ requireAllSignatures: false, verifySignatures: false });

    return {
      configTransactionBase64: Buffer.from(configBytes).toString('base64'),
      configMessageHash: createHash('sha256').update(
        VersionedTransaction.deserialize(configBytes).message.serialize(),
      ).digest('hex'),
      poolTransactionBase64: Buffer.from(poolBytes).toString('base64'),
      poolMessageHash: createHash('sha256').update(
        VersionedTransaction.deserialize(poolBytes).message.serialize(),
      ).digest('hex'),
      blockhash,
      lastValidBlockHeight: String(lastValidBlockHeight),
      pool: deriveDbcPoolAddress(new PublicKey(quote.mint), baseMint.publicKey, config.publicKey).toBase58(),
      baseMint: baseMint.publicKey.toBase58(),
      config: config.publicKey.toBase58(),
    };
  };
}

export async function prepareHalleyLiveProposal(args: {
  intent: unknown;
  wallet: string;
  revision: number;
  buildLaunch?: HalleyLaunchBuilder;
  resolveAnchorPort?: typeof resolveAnchor;
  now?: number;
  id?: string;
}): Promise<HalleyLiveProposal> {
  if (!halleyLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Halley live launch is not enabled on this deployment.', 403);
  }
  if (!isHalleyLaunchIntent(args.intent)) {
    throw new TradingError('invalid_intent', 'A launch needs a name, a symbol, a quote asset, a curve, a supply, and a graduation line.', 422);
  }
  const intent = args.intent;
  const wallet = assertLiveWallet(args.wallet);
  const quote = quoteMintForSymbol(intent.quoteSymbol);
  if (!quote) {
    throw new TradingError('invalid_intent', `Quote asset ${intent.quoteSymbol} is not in the verified launch catalog.`, 422);
  }
  assertLiveLimits(intent);

  const now = args.now ?? Date.now();
  const resolve = args.resolveAnchorPort ?? resolveAnchor;
  /* Same fail-closed posture as the estimate route: a requested anchor that
     cannot be evidenced refuses the live launch rather than repricing the
     opening at 1.0 under a false sense of anchoring. */
  const anchor = await resolve(intent.anchorSymbol, intent.quoteSymbol, now);
  if (intent.anchorSymbol && anchor?.status !== 'observed') {
    throw new TradingError(
      anchor?.status === 'stale' ? 'anchor_stale' : 'anchor_unavailable',
      anchor?.status === 'stale'
        ? `The ${intent.anchorSymbol} equity mark is stale — try again when marks are live, or drop the anchor.`
        : `No live ${intent.anchorSymbol} equity mark is available on this deployment.`,
      422,
    );
  }

  const estimate = estimateLaunch(intent, anchor, now, 'mainnet');
  if (!estimate.migration.config) {
    throw new TradingError('coverage_pending', 'The DAMM v2 migration config for this network has not been verified yet.', 422);
  }
  const configParams = buildLaunchConfig(intent, quote, anchor);
  const build = args.buildLaunch ?? createHalleyLaunchBuilder();
  const built = await build({ intent, quote, configParams, wallet, metadataUri: metadataUriFor(intent) });

  const proposal: HalleyLiveProposal = {
    version: 1,
    id: args.id ?? crypto.randomUUID(),
    deskId: 'halley',
    network: 'solana:mainnet',
    mode: 'live',
    intent,
    wallet,
    revision: args.revision,
    baseMint: built.baseMint,
    config: built.config,
    pool: built.pool,
    tokenMetadataUri: metadataUriFor(intent),
    quoteMint: quote.mint,
    quoteDecimals: quote.decimals,
    quoteSymbol: quote.symbol,
    anchor,
    openingPriceQuote: estimate.openingPriceQuote,
    graduationPriceQuote: estimate.graduationPriceQuote,
    migrationQuoteThreshold: estimate.migrationQuoteThreshold,
    migrationConfig: estimate.migration.config,
    configTransactionBase64: built.configTransactionBase64,
    configMessageHash: built.configMessageHash,
    poolTransactionBase64: built.poolTransactionBase64,
    poolMessageHash: built.poolMessageHash,
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    quotedAt: now,
    expiresAt: now + REVIEW_WINDOW_MS,
    assumptions: estimate.assumptions,
  };

  await saveHalleyLiveProposal(proposal, Math.max(5_000, proposal.expiresAt - now));
  return proposal;
}

/** Verify signed bytes still bind to a prepared unsigned message. */
export function signedTransactionBindsToMessage(
  unsignedTransactionBase64: string,
  signedTransactionBase64: string,
): boolean {
  try {
    const unsigned = VersionedTransaction.deserialize(Buffer.from(unsignedTransactionBase64, 'base64'));
    const signed = VersionedTransaction.deserialize(Buffer.from(signedTransactionBase64, 'base64'));
    return Buffer.from(unsigned.message.serialize()).equals(Buffer.from(signed.message.serialize()));
  } catch {
    return false;
  }
}

/** Verify both signed transactions still bind to the prepared launch. */
export function signedLaunchBindsToProposal(
  proposal: HalleyLiveProposal,
  signedConfigTransactionBase64: string,
  signedPoolTransactionBase64: string,
): boolean {
  return signedTransactionBindsToMessage(proposal.configTransactionBase64, signedConfigTransactionBase64)
    && signedTransactionBindsToMessage(proposal.poolTransactionBase64, signedPoolTransactionBase64);
}
