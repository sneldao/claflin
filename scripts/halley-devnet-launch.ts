/**
 * Devnet smoke for the PRODUCTION Halley launch builder.
 *
 * Runs the exact createHalleyLaunchBuilder the prepare route uses — same
 * createConfigAndPool call, same v0 conversion, same ephemeral-signer
 * partial signing — against devnet, with a devnet quote mint and a
 * controlled payer keypair. Proves the transaction the app will ask a
 * wallet to sign actually lands and opens a DBC pool.
 *
 * Usage:
 *   pnpm exec tsx scripts/halley-devnet-launch.ts
 *   HALLEY_SMOKE_PAYER=<base58 secret key> pnpm exec tsx scripts/halley-devnet-launch.ts
 *
 * Without HALLEY_SMOKE_PAYER a fresh keypair is generated and a devnet
 * airdrop is requested (rate-limited — rerun with the printed keypair if
 * the airdrop fails).
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { createHalleyLaunchBuilder } from '../lib/meteora/live-prepare';
import { buildLaunchConfig } from '../lib/meteora/dbc';
import { decodeBase58, encodeBase58 } from '../lib/solana/catalog';
import type { HalleyLaunchIntent } from '../lib/meteora/contracts';
import type { HalleyQuoteMint } from '../lib/meteora/catalog';

const DEVNET_RPC = process.env.HALLEY_DEVNET_RPC ?? 'https://api.devnet.solana.com';

/** Circle's public devnet USDC — a real SPL mint, no fixture needed. */
const DEVNET_USDC: HalleyQuoteMint = {
  symbol: 'USDC',
  mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  decimals: 6,
  tokenProgram: 'spl-token',
  badge: null,
  underlyingSymbol: null,
};

const INTENT: HalleyLaunchIntent = {
  name: 'Claflin Smoke',
  symbol: 'SMK',
  anchorSymbol: null,
  quoteSymbol: 'USDC',
  curve: 'flat',
  supply: '1000000',
  graduationQuote: '150',
};

async function main(): Promise<void> {
  const payer = process.env.HALLEY_SMOKE_PAYER
    ? Keypair.fromSecretKey(decodeBase58(process.env.HALLEY_SMOKE_PAYER)!)
    : Keypair.generate();
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  let balance = await connection.getBalance(payer.publicKey);
  if (balance < 50_000_000) {
    console.log('requesting devnet airdrop for', payer.publicKey.toBase58());
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 1_000_000_000);
      await connection.confirmTransaction(sig, 'confirmed');
      balance = await connection.getBalance(payer.publicKey);
    } catch {
      console.log('airdrop refused — fund this keypair manually, then rerun with:');
      console.log('HALLEY_SMOKE_PAYER=' + encodeBase58(payer.secretKey));
      process.exit(2);
    }
  }
  console.log('payer', payer.publicKey.toBase58(), 'balance', balance / 1e9, 'SOL');

  const configParams = buildLaunchConfig(INTENT, DEVNET_USDC, null);
  const build = createHalleyLaunchBuilder({ rpcUrl: DEVNET_RPC });
  const built = await build({
    intent: INTENT,
    quote: DEVNET_USDC,
    configParams,
    wallet: payer.publicKey.toBase58(),
    metadataUri: 'https://claflin.trustfall.xyz/api/desk/halley/token-metadata?symbol=SMK&name=Claflin%20Smoke',
  });

  /* Exactly what the wallet ceremony does: deserialize each prepared
     transaction, add the payer signature on top of the ephemeral partial
     signatures, submit in protocol order (config → pool). */
  const signed: Buffer[] = [];
  for (const [label, b64] of [['config', built.configTransactionBase64], ['pool', built.poolTransactionBase64]] as const) {
    const vtx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
    const before = Buffer.from(vtx.message.serialize());
    vtx.sign([payer]);
    if (!before.equals(Buffer.from(vtx.message.serialize()))) {
      throw new Error(`signing changed the ${label} message — the submit binding would fail`);
    }
    signed.push(Buffer.from(vtx.serialize()));
  }

  const configSig = await connection.sendRawTransaction(signed[0], { skipPreflight: false });
  console.log('config tx:', `https://solscan.io/tx/${configSig}?cluster=devnet`);
  await connection.confirmTransaction(configSig, 'confirmed');

  const signature = await connection.sendRawTransaction(signed[1], { skipPreflight: false });
  console.log('launch tx:', `https://solscan.io/tx/${signature}?cluster=devnet`);
  await connection.confirmTransaction(signature, 'confirmed');

  /* The graduation watcher reads the same way the pool-status route does. */
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const pool = await client.state.getPool(built.pool);
  if (!pool) throw new Error(`pool ${built.pool} not found after confirm`);
  const progress = await client.state.getPoolQuoteTokenCurveProgress(built.pool);
  const threshold = await client.state.getPoolMigrationQuoteThreshold(built.pool);

  console.log('pool:   ', `https://solscan.io/account/${built.pool}?cluster=devnet`);
  console.log('mint:   ', `https://solscan.io/token/${built.baseMint}?cluster=devnet`);
  console.log('config: ', built.config);
  console.log('curve progress:', (progress * 100).toFixed(2) + '%', '· migration threshold:', threshold.toString(), 'raw quote units');
  console.log('SMOKE OK — the production builder deploys a working DBC launch.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
