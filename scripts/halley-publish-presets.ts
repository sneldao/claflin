/**
 * Publish Halley's DBC presets as shared on-chain configs — the pay-to-use
 * preset marketplace. Each preset becomes one DBC config account whose
 * partner (fee claimer) is the house and whose poolCreationFee is charged
 * on every pool another builder opens against it.
 *
 * Dry run by default: builds and SDK-validates every preset and prints the
 * parameters. Nothing is sent without --send.
 *
 * Usage:
 *   pnpm exec tsx scripts/halley-publish-presets.ts
 *   HALLEY_PRESET_PAYER=<base58 secret key> pnpm exec tsx scripts/halley-publish-presets.ts --send --cluster devnet
 *   HALLEY_PRESET_PAYER=... pnpm exec tsx scripts/halley-publish-presets.ts --send --cluster mainnet --only equity-band
 *
 * Then set HALLEY_PRESET_CONFIGS to the printed JSON so
 * /api/desk/halley/presets lists the addresses.
 */

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { HALLEY_PRESETS, PRESET_POOL_CREATION_FEE_LAMPORTS, presetConfig } from '../lib/meteora/preset-catalog';
import { decodeBase58 } from '../lib/solana/catalog';

const USDC = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;
const RPC = {
  mainnet: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
  devnet: process.env.HALLEY_DEVNET_RPC ?? 'https://api.devnet.solana.com',
} as const;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
  const send = process.argv.includes('--send');
  const cluster = (arg('--cluster') ?? 'devnet') as 'mainnet' | 'devnet';
  if (cluster !== 'mainnet' && cluster !== 'devnet') throw new Error('--cluster must be mainnet or devnet');
  const only = arg('--only');
  const presets = HALLEY_PRESETS.filter(p => !only || p.id === only);
  if (presets.length === 0) throw new Error(`no preset ${only}`);

  for (const preset of presets) {
    const params = presetConfig(preset, PRESET_POOL_CREATION_FEE_LAMPORTS);
    console.log(`ok  ${preset.id.padEnd(12)} curve=${preset.curve} fee=${preset.profiles.fee} liq=${preset.profiles.liquidity} post=${preset.profiles.postGraduation} threshold=${params.migrationQuoteThreshold.toString()}`);
  }
  if (!send) {
    console.log('\ndry run — every preset built and passed SDK validation. Re-run with --send to publish.');
    return;
  }
  if (!process.env.HALLEY_PRESET_PAYER) throw new Error('HALLEY_PRESET_PAYER (base58 secret key) is required with --send');
  const payer = Keypair.fromSecretKey(decodeBase58(process.env.HALLEY_PRESET_PAYER)!);
  const connection = new Connection(RPC[cluster], 'confirmed');
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const published: Record<string, string> = {};
  for (const preset of presets) {
    const config = Keypair.generate();
    const tx = await client.partner.createConfig({
      config: config.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: new PublicKey(USDC[cluster]),
      payer: payer.publicKey,
      ...presetConfig(preset, PRESET_POOL_CREATION_FEE_LAMPORTS),
    });
    const sig = await sendAndConfirmTransaction(connection, tx, [payer, config], { commitment: 'confirmed' });
    published[preset.id] = config.publicKey.toBase58();
    console.log(`published ${preset.id} → ${config.publicKey.toBase58()} (tx ${sig})`);
  }
  console.log(`\nHALLEY_PRESET_CONFIGS='${JSON.stringify(published)}'`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
