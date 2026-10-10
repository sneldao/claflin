/**
 * Submit a signed Halley live launch — verify both wallet-signed messages
 * bind to the prepared transactions, verify the payer signed each, then
 * broadcast in order: createConfig first, createPool second (the pool
 * instruction reads the config account, so the order is protocol-forced).
 *
 * Outcomes: 'confirmed' (both landed), 'failed' (config rejected or errored
 * on-chain — nothing landed), 'partial' (config landed, pool did not —
 * the config account is stranded rent dust; a fresh proposal starts a new
 * launch), 'unknown' (a broadcast timed out mid-confirmation — reconcile
 * the recorded signatures, never relaunch blindly).
 */

import { Connection, VersionedTransaction } from '@solana/web3.js';
import { TradingError } from '../trading/domain';
import { halleyLiveEnabled } from './flags';
import { signedTransactionBindsToMessage } from './live-prepare';
import { loadHalleyLiveProposal, markHalleyLiveProposal } from './live-store';
import type { HalleyLiveLaunchResult } from './live-contracts';

function isZeroSignature(sig: Uint8Array): boolean {
  for (const b of sig) if (b !== 0) return false;
  return true;
}

async function broadcastAndConfirm(
  connection: Connection,
  raw: Buffer,
  blockhash: string,
  lastValidBlockHeight: number,
): Promise<{ outcome: 'confirmed' | 'failed' | 'unknown'; signature: string; detail?: string }> {
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
  } catch (error) {
    return {
      outcome: 'failed',
      signature: '',
      detail: error instanceof Error ? error.message.slice(0, 180) : 'rejected before broadcast',
    };
  }
  try {
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    if (confirmation.value.err) {
      return {
        outcome: 'failed',
        signature,
        detail: `failed on-chain: ${JSON.stringify(confirmation.value.err).slice(0, 180)}`,
      };
    }
    return { outcome: 'confirmed', signature };
  } catch {
    return { outcome: 'unknown', signature };
  }
}

export async function submitHalleyLiveProposal(args: {
  proposalId: string;
  signedConfigTransactionBase64: string;
  signedPoolTransactionBase64: string;
  idempotencyKey: string;
  wallet: string;
  connection?: Connection;
  now?: number;
}): Promise<HalleyLiveLaunchResult> {
  if (!halleyLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Halley live launch is not enabled on this deployment.', 403);
  }
  if (typeof args.proposalId !== 'string' || args.proposalId.length === 0) {
    throw new TradingError('invalid_intent', 'Missing live proposal id.', 422);
  }
  if (typeof args.signedConfigTransactionBase64 !== 'string' || args.signedConfigTransactionBase64.length < 32) {
    throw new TradingError('invalid_intent', 'Missing signed config transaction.', 422);
  }
  if (typeof args.signedPoolTransactionBase64 !== 'string' || args.signedPoolTransactionBase64.length < 32) {
    throw new TradingError('invalid_intent', 'Missing signed pool transaction.', 422);
  }
  if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length < 8) {
    throw new TradingError('invalid_intent', 'Missing idempotency key.', 422);
  }

  const stored = await loadHalleyLiveProposal(args.proposalId);
  if (!stored) {
    throw new TradingError('quote_expired', 'That live proposal expired or was not found. Prepare a fresh one.', 410);
  }
  const { proposal } = stored;
  const now = args.now ?? Date.now();
  if (now >= proposal.expiresAt) {
    throw new TradingError('quote_expired', 'That live proposal expired. Prepare a fresh one.', 410);
  }
  if (proposal.wallet !== args.wallet) {
    throw new TradingError('invalid_intent', 'Wallet does not match the prepared live proposal.', 403);
  }

  const urls = (signature: string | null, configSignature: string | null) => ({
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    configSolscanUrl: configSignature ? `https://solscan.io/tx/${configSignature}` : null,
    mintUrl: `https://solscan.io/token/${proposal.baseMint}`,
    poolUrl: `https://solscan.io/account/${proposal.pool}`,
  });
  const result = (
    status: HalleyLiveLaunchResult['status'],
    message: string,
    signature: string | null,
    configSignature: string | null,
  ): HalleyLiveLaunchResult => ({
    proposalId: proposal.id,
    status,
    signature,
    configSignature,
    message,
    baseMint: proposal.baseMint,
    pool: proposal.pool,
    ...urls(signature, configSignature),
  });

  if (stored.status === 'confirmed' && stored.signature) {
    return result('confirmed', 'This launch already confirmed.', stored.signature, stored.configSignature);
  }
  if (stored.idempotencyKey && stored.idempotencyKey !== args.idempotencyKey && stored.status === 'submitted') {
    throw new TradingError('invalid_intent', 'A different submit is already in flight for this proposal.', 409);
  }
  if (!signedTransactionBindsToMessage(proposal.configTransactionBase64, args.signedConfigTransactionBase64)
    || !signedTransactionBindsToMessage(proposal.poolTransactionBase64, args.signedPoolTransactionBase64)) {
    throw new TradingError('route_mismatch', 'Signed transactions do not match the prepared launch.', 422);
  }

  let signedConfig: VersionedTransaction;
  let signedPool: VersionedTransaction;
  try {
    signedConfig = VersionedTransaction.deserialize(Buffer.from(args.signedConfigTransactionBase64, 'base64'));
    signedPool = VersionedTransaction.deserialize(Buffer.from(args.signedPoolTransactionBase64, 'base64'));
  } catch {
    throw new TradingError('route_mismatch', 'Signed transactions could not be read.', 422);
  }
  /* The payer is signature slot 0 — the launch must be authorized by the
     launcher's wallet, not merely by the ephemeral account signers. */
  if (!signedConfig.signatures[0] || isZeroSignature(signedConfig.signatures[0])
    || !signedPool.signatures[0] || isZeroSignature(signedPool.signatures[0])) {
    throw new TradingError('route_mismatch', 'The wallet did not sign the launch transactions.', 422);
  }

  await markHalleyLiveProposal(proposal.id, {
    status: 'submitted',
    idempotencyKey: args.idempotencyKey,
  });

  const connection = args.connection ?? new Connection(
    process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
    'confirmed',
  );
  const lastValidBlockHeight = proposal.lastValidBlockHeight ? Number(proposal.lastValidBlockHeight) : 0;
  const configRaw = Buffer.from(args.signedConfigTransactionBase64, 'base64');
  const poolRaw = Buffer.from(args.signedPoolTransactionBase64, 'base64');

  /* Stage 1 — the config account. */
  const configTx = await broadcastAndConfirm(connection, configRaw, proposal.blockhash, lastValidBlockHeight);
  if (configTx.outcome === 'failed') {
    await markHalleyLiveProposal(proposal.id, {
      status: 'failed',
      configSignature: configTx.signature || null,
    });
    return result(
      'failed',
      `The launch was rejected at the config step — nothing landed.${configTx.detail ? ` ${configTx.detail}` : ''}`,
      null,
      configTx.signature || null,
    );
  }
  if (configTx.outcome === 'unknown') {
    await markHalleyLiveProposal(proposal.id, {
      status: 'unknown',
      configSignature: configTx.signature,
    });
    return result(
      'unknown',
      'The config transaction was broadcast but confirmation timed out — reconcile the config signature; do not relaunch.',
      null,
      configTx.signature,
    );
  }
  await markHalleyLiveProposal(proposal.id, {
    status: 'submitted',
    configSignature: configTx.signature,
  });

  /* Stage 2 — the pool + mint. Protocol-forced order: createPool reads the
     config account tx1 just created. */
  const poolTx = await broadcastAndConfirm(connection, poolRaw, proposal.blockhash, lastValidBlockHeight);
  if (poolTx.outcome === 'confirmed') {
    await markHalleyLiveProposal(proposal.id, {
      status: 'confirmed',
      signature: poolTx.signature,
      configSignature: configTx.signature,
    });
    return result(
      'confirmed',
      `${proposal.intent.symbol} is live — mint ${proposal.baseMint.slice(0, 8)}… on a Meteora DBC curve.`,
      poolTx.signature,
      configTx.signature,
    );
  }
  if (poolTx.outcome === 'unknown') {
    await markHalleyLiveProposal(proposal.id, {
      status: 'unknown',
      signature: poolTx.signature,
      configSignature: configTx.signature,
    });
    return result(
      'unknown',
      'The config landed and the pool transaction was broadcast but confirmation timed out — reconcile both signatures; do not relaunch.',
      poolTx.signature,
      configTx.signature,
    );
  }
  await markHalleyLiveProposal(proposal.id, {
    status: 'partial',
    signature: poolTx.signature || null,
    configSignature: configTx.signature,
  });
  return result(
    'partial',
    `The curve config landed (tx ${configTx.signature.slice(0, 8)}…) but the pool transaction failed${poolTx.detail ? ` — ${poolTx.detail}` : ''}. The config is stranded rent dust (~0.002 SOL); prepare a fresh launch to try again.`,
    poolTx.signature || null,
    configTx.signature,
  );
}

