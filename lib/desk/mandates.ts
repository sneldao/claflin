import type { MarketMandate } from './contracts';

/**
 * Product/access mandates known to the house. A mandate is not a broker or a
 * rail: it names the issuer/product boundary and the rails on which verified
 * offerings may settle.
 */
export const MARKET_MANDATES: Readonly<Record<string, MarketMandate>> = Object.freeze({
  'coinbase-tokenized-stocks': Object.freeze({
    id: 'coinbase-tokenized-stocks' as const,
    label: 'Coinbase Tokenized Stocks',
    product: 'B20 tokenized stock',
    issuer: 'Coinbase',
    rails: [{ kind: 'evm' as const, network: 'eip155:8453' as const, chainId: 8453 }],
    venues: ['aerodrome'],
    quoteAsset: 'USDC' as const,
    status: 'active' as const,
  }),
  'backed-xstocks': Object.freeze({
    id: 'backed-xstocks' as const,
    label: 'Backed xStocks',
    product: 'Token-2022 xStock',
    issuer: 'Backed',
    rails: [{ kind: 'solana' as const, network: 'solana:mainnet' as const }],
    venues: ['jupiter'],
    quoteAsset: 'USDC' as const,
    status: 'active' as const,
  }),
  'robinhood-stock-tokens': Object.freeze({
    id: 'robinhood-stock-tokens' as const,
    label: 'Robinhood Stock Tokens',
    product: 'ERC-20 stock token',
    issuer: 'Robinhood Assets',
    rails: [{ kind: 'evm' as const, network: 'eip155:4663' as const, chainId: 4663 }],
    venues: [],
    quoteAsset: null,
    status: 'planned' as const,
  }),
  'arbitrum-pending': Object.freeze({
    id: 'arbitrum-pending' as const,
    label: 'Arbitrum mandate pending verification',
    product: 'Unverified Arbitrum product set',
    issuer: null,
    rails: [{ kind: 'evm' as const, network: 'eip155:42161' as const, chainId: 42161 }],
    venues: [],
    quoteAsset: null,
    status: 'planned' as const,
  }),
});
