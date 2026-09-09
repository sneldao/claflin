/**
 * Manual Aerodrome swap test on Base mainnet.
 *
 * This script is a one-off integration check for Tracks A and B. It requires a
 * funded wallet with ETH for gas and USDC for a buy, or the B20 token for a
 * sell. It will spend real funds. Run only with a test wallet and a tiny size.
 *
 * Setup:
 *   export BASE_RPC_URL=https://mainnet.base.org
 *   export TEST_WALLET_PRIVATE_KEY=0x...
 *   export TEST_WALLET_ADDRESS=0x...
 *
 * Run:
 *   npx tsx scripts/test-aerodrome-swap.ts
 */

import { createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createAerodromeReader } from '../lib/trading/aerodrome';
import { createQuoteService } from '../lib/trading/quotes';
import { deskQuoteLimits } from '../lib/trading/desk-mandate';
import { OPEN_DESK_ID } from '../lib/house';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { createBasePublicClient, executeAerodromeSwap, waitForLiveOutcome } from '../lib/trading/execute-swap';

const SIDE = 'buy' as const;
const AMOUNT = '0.10';
const SLIPPAGE_BPS = 100; // 1%

const privateKey = process.env.TEST_WALLET_PRIVATE_KEY;
const walletAddressRaw = process.env.TEST_WALLET_ADDRESS;
const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

if (!privateKey) throw new Error('TEST_WALLET_PRIVATE_KEY is required');
if (!walletAddressRaw) throw new Error('TEST_WALLET_ADDRESS is required');

const walletAddress = walletAddressRaw as `0x${string}`;
const account = privateKeyToAccount(privateKey as `0x${string}`);
const publicClient = createBasePublicClient(rpcUrl);
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

async function main() {
  const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

  console.log('Fetching live quote for', stock.symbol, SIDE, AMOUNT);
  const quoteService = createQuoteService(createAerodromeReader(), Date.now, () => crypto.randomUUID(), deskQuoteLimits(OPEN_DESK_ID));
  const quote = await quoteService({ instrumentId: stock.id, side: SIDE, unit: 'USDC', amount: AMOUNT });
  console.log('Quote:', quote.inputAmount, quote.inputSymbol, '→', quote.outputAmount, quote.outputSymbol);

  const sendTransaction = async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint; chainId: number }) => {
    return walletClient.sendTransaction({ account, to: tx.to, data: tx.data, value: tx.value, chain: base });
  };

  const submitted = await executeAerodromeSwap(
    { walletAddress, sendTransaction, publicClient },
    quote,
    SLIPPAGE_BPS,
  );
  console.log('Submitted:', submitted);

  if (submitted.status === 'submitted') {
    const final = await waitForLiveOutcome(publicClient, submitted.hash);
    console.log('Outcome:', final);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
