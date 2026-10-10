/**
 * Halley live-launch contracts — the proposal a wallet reviews and signs.
 * Mirrors SolanaLiveProposal's shape: the server prepares exact
 * transactions bound to a verified intent, the client signs them unchanged,
 * and the server verifies the signed messages before broadcast.
 *
 * A launch creates a NEW base mint — a tracker/exposure token, never stock
 * ownership. The ephemeral config and base-mint keypairs are generated and
 * partially signed server-side (they are account-creation signers only and
 * hold no post-launch authority); the caller's wallet is payer, pool
 * creator, fee claimer and leftover receiver — the launch happens *from*
 * the launcher's wallet, never from the house's.
 */

import type { HalleyAnchor, HalleyLaunchIntent } from './contracts';

export interface HalleyLiveProposal {
  version: 1;
  id: string;
  deskId: 'halley';
  network: 'solana:mainnet';
  mode: 'live';
  intent: HalleyLaunchIntent;
  /** Payer / pool creator / fee claimer — the launcher's wallet. */
  wallet: string;
  revision: number;
  /** The mint this transaction creates (ephemeral keypair, base58). */
  baseMint: string;
  /** The fresh DBC config account (ephemeral keypair, base58). */
  config: string;
  /** The derived DBC pool address the launch will open. */
  pool: string;
  /** Metaplex metadata URI embedded in the launch. */
  tokenMetadataUri: string;
  quoteMint: string;
  quoteDecimals: number;
  quoteSymbol: string;
  anchor: HalleyAnchor | null;
  openingPriceQuote: string;
  graduationPriceQuote: string;
  /** Raw quote units at which the curve graduates to DAMM v2. */
  migrationQuoteThreshold: string;
  /** DAMM v2 migration config verified against the launch network. */
  migrationConfig: string;
  /**
   * The launch is two transactions — a full 16-segment DBC curve config
   * cannot fit a single Solana transaction (1232-byte packet limit), so the
   * config account is created first, then the pool+mint against it. Both
   * share one blockhash and one review window. Each is partially signed by
   * its ephemeral account-creation signer (config on tx1, baseMint on tx2);
   * the payer slot waits for the caller's wallet.
   */
  configTransactionBase64: string;
  /** sha256 of the unsigned config message bytes — the binding submit verifies. */
  configMessageHash: string;
  poolTransactionBase64: string;
  /** sha256 of the unsigned pool message bytes. */
  poolMessageHash: string;
  blockhash: string;
  lastValidBlockHeight: string | null;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
}

export type HalleyLiveLaunchResult = {
  proposalId: string;
  /** 'partial' = the config transaction landed but the pool transaction
   *  did not — the config account is stranded rent dust; a fresh proposal
   *  creates a new config and a new mint. */
  status: 'confirmed' | 'partial' | 'failed' | 'unknown';
  /** Pool transaction signature — present once broadcast. */
  signature: string | null;
  /** Config transaction signature — present once broadcast. */
  configSignature: string | null;
  message: string;
  baseMint: string;
  pool: string;
  solscanUrl: string | null;
  configSolscanUrl: string | null;
  mintUrl: string | null;
  poolUrl: string | null;
};
