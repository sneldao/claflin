// ============================================
// Base Chain Configuration
// ============================================
// Config for Hetty's execution desk: Coinbase Tokenized
// Stocks (B20) on Base. Independent of the Arbitrum
// call-payment/identity configuration in arbitrum-chain.ts —
// trade execution, billing, and registry networks are
// separate decisions.
// ============================================

import type { Address } from 'viem';

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const BASE_RPC_URL =
  process.env.BASE_RPC_URL || 'https://mainnet.base.org';

export const BASE_EXPLORER_URL =
  process.env.BASE_EXPLORER_URL || 'https://basescan.org';

/** Native USDC on Base */
export const BASE_USDC: Address =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_USDC_DECIMALS = 6;

/** WETH on Base */
export const BASE_WETH: Address =
  '0x4200000000000000000000000000000000000006';

// ============================================
// Aerodrome (Slipstream) contract addresses
// ============================================
// Source: aerodrome-finance/slipstream deployment table,
// verified 2026-09-05.

/**
 * MixedRouteQuoterV3 — onchain quote lens supporting the three
 * CL factories via bitmask in the path filler. Verified
 * 2026-09-05: the original MixedQuoter (0x0A5a…) does not
 * resolve pools on the newest CL factory.
 */
export const AERODROME_MIXED_QUOTER: Address =
  '0xCd2A7D98e82D6107eac1828ce8DeAA6acB65b555';

/**
 * Aerodrome: SlipStream Swap Router.
 * Verified 2026-09-09 on BaseScan as the active CL router
 * (exactInputSingle/exactOutput). The router derives the pool
 * from tokenIn, tokenOut, and tickSpacing using the default CL factory.
 */
export const AERODROME_SWAP_ROUTER: Address =
  '0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5';

/**
 * CL factory bitmasks OR'd into the path's int24 filler
 * (MixedRouteQuoterV3 selects among three factories this way).
 * Verified 2026-09-05: all four verified stock pools live on
 * the newest factory → CL_FACTORY2_BITMASK.
 */
export const AERODROME_CL_FACTORY_BITMASK = 1 << 20; // legacyCLFactory
export const AERODROME_CL_FACTORY2_BITMASK = 1 << 19; // newest factory
export const AERODROME_CL_FACTORY_NEWEST: Address =
  '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef';

// ============================================
// B20 specifics
// ============================================
// Coinbase Tokenized Stocks are B20 precompiles. Their
// addresses encode the ASSET variant prefix 0xb200…, which
// is a sanity check only — identity comes from the official
// contract list, never the prefix or ticker.

export const B20_ASSET_PREFIX = '0xb200';
export const B20_REGISTRY: Address =
  '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD';

export function getBaseExplorerAddressUrl(address: string): string {
  return `${BASE_EXPLORER_URL}/address/${address}`;
}

export function getBaseExplorerTxUrl(txHash: string): string {
  return `${BASE_EXPLORER_URL}/tx/${txHash}`;
}
