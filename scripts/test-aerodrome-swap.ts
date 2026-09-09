/**
 * Manual Aerodrome swap test on Base mainnet.
 *
 * This script is a one-off integration check for Track A. It requires a
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

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { buildAerodromeSwapTx, buildErc20ApproveTx } from '../lib/trading/aerodrome-router';
import { createAerodromeReader } from '../lib/trading/aerodrome';
import { createQuoteService } from '../lib/trading/quotes';
import { deskQuoteLimits } from '../lib/trading/desk-mandate';
import { OPEN_DESK_ID } from '../lib/house';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { BASE_USDC, AERODROME_SWAP_ROUTER } from '../lib/base-chain';

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
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const erc20Abi = ['function balanceOf(address account) view returns (uint256)', 'function allowance(address owner, address spender) view returns (uint256)'] as const;

async function main() {
  const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;

  console.log('Fetching live quote for', stock.symbol, SIDE, AMOUNT);
  const quoteService = createQuoteService(createAerodromeReader(), Date.now, () => crypto.randomUUID(), deskQuoteLimits(OPEN_DESK_ID));
  const quote = await quoteService({ instrumentId: stock.id, side: SIDE, unit: 'USDC', amount: AMOUNT });
  console.log('Quote:', quote.inputAmount, quote.inputSymbol, '→', quote.outputAmount, quote.outputSymbol);

  const inputToken = SIDE === 'buy' ? BASE_USDC : stock.contractAddress;
  const inputDecimals = SIDE === 'buy' ? 6 : stock.decimals!;
  const inputRaw = parseUnits(AMOUNT, inputDecimals);

  const allowance = await publicClient.readContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [walletAddress, AERODROME_SWAP_ROUTER],
  }) as bigint;

  if (allowance < inputRaw) {
    console.log('Approving router to spend', inputToken);
    const approve = buildErc20ApproveTx(inputToken as `0x${string}`, AERODROME_SWAP_ROUTER, inputRaw);
    const approveHash = await walletClient.sendTransaction({ to: approve.to, data: approve.data });
    console.log('Approve tx:', approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log('Approved');
  } else {
    console.log('Allowance sufficient');
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
  const swap = buildAerodromeSwapTx(quote, SLIPPAGE_BPS, walletAddress, deadline);

  console.log('Sending swap to', swap.to);
  const hash = await walletClient.sendTransaction({ to: swap.to, data: swap.data, value: swap.value });
  console.log('Swap tx:', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Receipt:', receipt.status, 'gasUsed', receipt.gasUsed.toString());

  const outputToken = SIDE === 'buy' ? stock.contractAddress : BASE_USDC;
  const outputDecimals = SIDE === 'buy' ? stock.decimals! : 6;
  const balance = await publicClient.readContract({
    address: outputToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  console.log('Output token balance:', formatUnits(balance, outputDecimals));
}

main().catch((e) => { console.error(e); process.exit(1); });
