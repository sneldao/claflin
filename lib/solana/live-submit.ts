/**
 * Submit a signed Jesse live proposal to Jupiter `/execute`.
 */

import { TradingError } from '../trading/domain';
import { jesseLiveEnabled } from './flags';
import { createJupiterExecuteClient } from './jupiter-live';
import { signedTransactionBindsToProposal } from './live-prepare';
import { loadLiveProposal, markLiveProposal } from './live-store';

export type JesseLiveSubmitResult = {
  proposalId: string;
  status: 'confirmed' | 'failed' | 'unknown';
  signature: string | null;
  message: string;
  inputAmountResult: string | null;
  outputAmountResult: string | null;
  solscanUrl: string | null;
};

export async function submitJesseLiveProposal(args: {
  proposalId: string;
  signedTransactionBase64: string;
  idempotencyKey: string;
  wallet: string;
  execute?: ReturnType<typeof createJupiterExecuteClient>;
  now?: number;
}): Promise<JesseLiveSubmitResult> {
  if (!jesseLiveEnabled()) {
    throw new TradingError('desk_unavailable', 'Jesse live settle is not enabled on this deployment.', 403);
  }
  if (typeof args.proposalId !== 'string' || args.proposalId.length === 0) {
    throw new TradingError('invalid_intent', 'Missing live proposal id.', 422);
  }
  if (typeof args.signedTransactionBase64 !== 'string' || args.signedTransactionBase64.length < 32) {
    throw new TradingError('invalid_intent', 'Missing signed transaction.', 422);
  }
  if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length < 8) {
    throw new TradingError('invalid_intent', 'Missing idempotency key.', 422);
  }

  const stored = await loadLiveProposal(args.proposalId);
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
  if (stored.status === 'confirmed' && stored.signature) {
    return {
      proposalId: proposal.id,
      status: 'confirmed',
      signature: stored.signature,
      message: 'This live settle already confirmed.',
      inputAmountResult: null,
      outputAmountResult: null,
      solscanUrl: `https://solscan.io/tx/${stored.signature}`,
    };
  }
  if (stored.idempotencyKey && stored.idempotencyKey !== args.idempotencyKey && stored.status === 'submitted') {
    throw new TradingError('invalid_intent', 'A different submit is already in flight for this proposal.', 409);
  }
  if (!signedTransactionBindsToProposal(proposal, args.signedTransactionBase64)) {
    throw new TradingError('route_mismatch', 'Signed transaction does not match the prepared live order.', 422);
  }

  await markLiveProposal(proposal.id, {
    status: 'submitted',
    idempotencyKey: args.idempotencyKey,
  });

  const execute = args.execute ?? createJupiterExecuteClient();
  try {
    const result = await execute({
      signedTransactionBase64: args.signedTransactionBase64,
      requestId: proposal.providerRequestId,
    });
    if (result.status === 'Success' && result.signature) {
      await markLiveProposal(proposal.id, { status: 'confirmed', signature: result.signature });
      return {
        proposalId: proposal.id,
        status: 'confirmed',
        signature: result.signature,
        message: 'Live settle confirmed on Solana via Jupiter.',
        inputAmountResult: result.inputAmountResult,
        outputAmountResult: result.outputAmountResult,
        solscanUrl: `https://solscan.io/tx/${result.signature}`,
      };
    }
    await markLiveProposal(proposal.id, {
      status: 'failed',
      signature: result.signature || null,
    });
    return {
      proposalId: proposal.id,
      status: 'failed',
      signature: result.signature || null,
      message: result.error ?? 'Live settle failed on the venue.',
      inputAmountResult: result.inputAmountResult,
      outputAmountResult: result.outputAmountResult,
      solscanUrl: result.signature ? `https://solscan.io/tx/${result.signature}` : null,
    };
  } catch (error) {
    await markLiveProposal(proposal.id, { status: 'unknown' });
    if (error instanceof TradingError) throw error;
    throw new TradingError(
      'quote_unavailable',
      'Execute timed out or failed. Outcome is unknown — reconcile the same signature; do not resign a different order.',
      503,
    );
  }
}
