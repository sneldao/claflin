// ============================================
// Canonical Instrument Catalog — Coinbase Tokenized Stocks
// ============================================
// Seeded from the official Base tokenized-stocks list
// (docs.base.org / brand.base.org/stocks), verified
// 2026-09-05. Instruments are keyed by contract address —
// tickers and names are display/search aliases only and can
// never resolve to a different contract. New listings should
// be discovered via B20Created events and issuer
// announcements, then verified before becoming tradable.
// ============================================

import type { Address } from 'viem';
import { validateAddress } from './address';
import { BASE_CHAIN_ID } from './base-chain';

/** Venue id for Aerodrome Slipstream pools on Base. */
export const AERODROME_VENUE = 'aerodrome';

export type InstrumentAvailability =
  | 'quote_candidate' // configured route; re-verify for each paper quote
  | 'insufficient_liquidity' // historical observation, not current executable depth
  | 'verification_pending' // contract exists, venue not verified
  | 'suspended'; // issuer pause/policy event

export interface VenuePair {
  /** Venue id — 'aerodrome' today; registry keys like 'jupiter', 'camelot', 'robinhood' later. */
  venue: string;
  /** Chain this venue settles on. Base is 8453; non-EVM venues use their own id space. */
  chainId: number;
  poolAddress: Address;
  quoteToken: Address;
  quoteSymbol: string;
  /** CL pool tickSpacing — base of the path filler for quotes */
  tickSpacing: number;
  /**
   * MixedRouteQuoterV3 CL-factory selector bits, OR'd with
   * tickSpacing in the path filler. Verified onchain per pool.
   */
  clFactoryBitmask: number;
  /** Last observed TVL in USD at verification time */
  liquidityUsdAtVerification: number;
  lastVerifiedAt: string; // ISO date
}

export interface TokenizedStock {
  /** Canonical identity: the B20 contract address on Base */
  contractAddress: Address;
  /** Tokenized-stock ticker, e.g. "NVDAc" */
  symbol: string;
  /** Underlying equity ticker, e.g. "NVDA" */
  underlyingSymbol: string;
  /** Company/instrument display name */
  name: string;
  issuer: 'Coinbase';
  /** Chainlink total-return feed (8 decimals, 24/5) */
  chainlinkFeed: Address;
  /**
   * Token decimals. B20 decimals are configurable per token
   * (verified: the four tradable names use 8 — not 18). Null
   * means "not yet verified"; adapters must read decimals()
   * onchain before sizing any amount.
   */
  decimals: number | null;
  availability: InstrumentAvailability;
  venuePairs: VenuePair[];
  /** Human-readable note shown when not tradable */
  availabilityNote?: string;
}

const NVDAc: Address = '0xb20000000000000000000078ee7ce2fE4908108C';
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Verified primary Aerodrome USDC pools (DEX Screener +
// onchain probing, 2026-09-05). All four: token0=USDC,
// tickSpacing=10, newest CL factory → cl2 bitmask (1 << 19).
const CL2 = 1 << 19;
const VERIFIED_PAIRS: Record<string, VenuePair> = {
  NVDAc: {
    venue: AERODROME_VENUE,
    chainId: BASE_CHAIN_ID,
    poolAddress: '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9',
    quoteToken: USDC,
    quoteSymbol: 'USDC',
    tickSpacing: 10,
    clFactoryBitmask: CL2,
    liquidityUsdAtVerification: 2577766,
    lastVerifiedAt: '2026-09-05',
  },
  AAPLc: {
    venue: AERODROME_VENUE,
    chainId: BASE_CHAIN_ID,
    poolAddress: '0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0',
    quoteToken: USDC,
    quoteSymbol: 'USDC',
    tickSpacing: 10,
    clFactoryBitmask: CL2,
    liquidityUsdAtVerification: 1407876,
    lastVerifiedAt: '2026-09-05',
  },
  METAc: {
    venue: AERODROME_VENUE,
    chainId: BASE_CHAIN_ID,
    poolAddress: '0xEAF57753BC382E0324a1D43F72E7027705a2273E',
    quoteToken: USDC,
    quoteSymbol: 'USDC',
    tickSpacing: 10,
    clFactoryBitmask: CL2,
    liquidityUsdAtVerification: 1098178,
    lastVerifiedAt: '2026-09-05',
  },
  GOOGLc: {
    venue: AERODROME_VENUE,
    chainId: BASE_CHAIN_ID,
    poolAddress: '0xB1987CAD1682841b4b641d50E520777eC5Ab5542',
    quoteToken: USDC,
    quoteSymbol: 'USDC',
    tickSpacing: 10,
    clFactoryBitmask: CL2,
    liquidityUsdAtVerification: 1628385,
    lastVerifiedAt: '2026-09-05',
  },
};

/**
 * Full catalog of Coinbase B20 contracts on Base.
 * Contract + feed addresses from the official Base guide.
 */
export const TOKENIZED_STOCKS: TokenizedStock[] = [
  {
    contractAddress: NVDAc,
    symbol: 'NVDAc',
    underlyingSymbol: 'NVDA',
    name: 'NVIDIA Corporation',
    issuer: 'Coinbase',
    chainlinkFeed: '0x04689a41629776563E6822F76f2e57D148d28513',
    decimals: 8,
    availability: 'quote_candidate',
    venuePairs: [VERIFIED_PAIRS.NVDAc],
  },
  {
    contractAddress: '0xb200000000000000000000C2e324d24d7eEcd1fb',
    symbol: 'AAPLc',
    underlyingSymbol: 'AAPL',
    name: 'Apple Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0x787f13dEa48Db0897CbCDD985de77809D837F988',
    decimals: 8,
    availability: 'quote_candidate',
    venuePairs: [VERIFIED_PAIRS.AAPLc],
  },
  {
    contractAddress: '0xb2000000000000000000008bC8786B856E61707C',
    symbol: 'METAc',
    underlyingSymbol: 'META',
    name: 'Meta Platforms Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D',
    decimals: 8,
    availability: 'quote_candidate',
    venuePairs: [VERIFIED_PAIRS.METAc],
  },
  {
    contractAddress: '0xb2000000000000000000002D0BA3164cc74f58B7',
    symbol: 'GOOGLc',
    underlyingSymbol: 'GOOGL',
    name: 'Alphabet Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2',
    decimals: 8,
    availability: 'quote_candidate',
    venuePairs: [VERIFIED_PAIRS.GOOGLc],
  },
  // Deployed but thin — not gated into the tradable set until
  // depth is verified above the floor.
  {
    contractAddress: '0xb2000000000000000000001e800a7f5189430cD0',
    symbol: 'TSLAc',
    underlyingSymbol: 'TSLA',
    name: 'Tesla, Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4',
    decimals: null,
    availability: 'insufficient_liquidity',
    venuePairs: [],
    availabilityNote:
      'Listed on Base with limited onchain liquidity (~$150k across venues as of 2026-09-05). Below the desk depth floor.',
  },
  {
    contractAddress: '0xb200000000000000000000d9192b6B456483C2E8',
    symbol: 'AMZNc',
    underlyingSymbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xB200000000000000000000Ab99cFa739E253872B',
    symbol: 'MSFTc',
    underlyingSymbol: 'MSFT',
    name: 'Microsoft Corporation',
    issuer: 'Coinbase',
    chainlinkFeed: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xb2000000000000000000004884b426556b92883d',
    symbol: 'MSTRc',
    underlyingSymbol: 'MSTR',
    name: 'Strategy Inc. (MicroStrategy)',
    issuer: 'Coinbase',
    chainlinkFeed: '0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xb200000000000000000000397293Cb8cda9a10c5',
    symbol: 'SNDKc',
    underlyingSymbol: 'SNDK',
    name: 'Sandisk Corporation',
    issuer: 'Coinbase',
    chainlinkFeed: '0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xb2000000000000000000007b9fcbd005511aCBd5',
    symbol: 'SPCXc',
    underlyingSymbol: 'SPCX',
    name: 'SpaceX',
    issuer: 'Coinbase',
    chainlinkFeed: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xb200000000000000000000c85a31389D71F3ecfb',
    symbol: 'COINc',
    underlyingSymbol: 'COIN',
    name: 'Coinbase Global, Inc.',
    issuer: 'Coinbase',
    chainlinkFeed: '0x408e44f504A7371a345F03a73dDC96A4b48e8aa7',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xB20000000000000000000019f6E7C675b73C2e4D',
    symbol: 'CRCLc',
    underlyingSymbol: 'CRCL',
    name: 'Circle Internet Group',
    issuer: 'Coinbase',
    chainlinkFeed: '0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
  {
    contractAddress: '0xB2000000000000000000004AFF16039bA04bdFBc',
    symbol: 'INTCc',
    underlyingSymbol: 'INTC',
    name: 'Intel Corporation',
    issuer: 'Coinbase',
    chainlinkFeed: '0xAB657C39bac0D5886250D70849e2E3E008F2EECB',
    decimals: null,
    availability: 'verification_pending',
    venuePairs: [],
  },
];

// ============================================
// Resolution — contract-address keyed, never ticker search
// ============================================

const byAddress = new Map(
  TOKENIZED_STOCKS.map((s) => [s.contractAddress.toLowerCase(), s]),
);

/** Exact contract-address resolution. Returns undefined for anything else. */
export function getInstrumentByAddress(
  address: string,
): TokenizedStock | undefined {
  if (!validateAddress(address)) return undefined;
  return byAddress.get(address.toLowerCase());
}

/**
 * Search-alias resolution. A ticker/name maps only to the canonical
 * catalog entry — there is no path by which a query can resolve to a
 * contract outside the registry.
 */
export function resolveInstrument(
  query: string,
): { instrument: TokenizedStock | null; reason?: string } {
  const q = query.trim();
  if (!q) return { instrument: null, reason: 'empty_query' };

  const direct = getInstrumentByAddress(q);
  if (direct) return { instrument: direct };

  const qLower = q.toLowerCase();
  const match = TOKENIZED_STOCKS.find(
    (s) =>
      s.symbol.toLowerCase() === qLower ||
      s.underlyingSymbol.toLowerCase() === qLower ||
      s.name.toLowerCase() === qLower,
  );
  if (match) return { instrument: match };
  return { instrument: null, reason: 'not_on_this_desk' };
}

/** Legacy selector for paper-quote candidates, not live trading availability. */
export function tradableInstruments(): TokenizedStock[] {
  return TOKENIZED_STOCKS.filter(
    (s) => s.availability === 'quote_candidate' && s.venuePairs.length > 0,
  );
}
