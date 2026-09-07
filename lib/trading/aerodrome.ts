import { ethers } from 'ethers';
import { AERODROME_CL_FACTORY_NEWEST, AERODROME_MIXED_QUOTER, BASE_RPC_URL } from '../base-chain';
import type { QuoteReader } from './quotes';

const tokenAbi = ['function decimals() view returns (uint8)', 'function multiplier() view returns (uint256)'];
const poolAbi = [
  'function token0() view returns (address)', 'function token1() view returns (address)',
  'function factory() view returns (address)', 'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
];
const quoterAbi = [
  'function factory() view returns (address)',
  'function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] prices,uint32[] ticks,uint256 gasEstimate)',
];
export const feedAbi = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
];

export const BASE = ethers.Network.from(8453);

/** Prefer env, then rotate public Base endpoints when one rate-limits. */
export function baseRpcCandidates(): string[] {
  const fromEnv = [BASE_RPC_URL, process.env.BASE_RPC_FALLBACK_URL].filter((u): u is string => Boolean(u && u.trim()));
  const publicFallbacks = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://1rpc.io/base',
    'https://base.drpc.org',
  ];
  return [...new Set([...fromEnv, ...publicFallbacks].map(u => u.replace(/\/+$/, '')))];
}

export function isTransientRpcError(error: unknown): boolean {
  const info = error && typeof error === 'object' && 'info' in error
    ? (error as { info?: { error?: { code?: number; message?: string }; responseStatus?: string } }).info
    : undefined;
  const code = info?.error?.code;
  const message = `${info?.error?.message || ''} ${info?.responseStatus || ''} ${error instanceof Error ? error.message : ''}`.toLowerCase();
  return code === -32016
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('over rate limit')
    || message.includes('server_error')
    || message.includes('server response')
    || message.includes('521')
    || message.includes('502')
    || message.includes('503')
    || message.includes('timeout')
    || message.includes('econnreset')
    || message.includes('fetch failed');
}

export async function withRpcRetry<T>(run: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!isTransientRpcError(error) || i === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw last;
}

async function readOn(rpcUrl: string, stock: Parameters<QuoteReader['read']>[0], pair: Parameters<QuoteReader['read']>[1], side: 'buy' | 'sell', amount: bigint) {
  const request = new ethers.FetchRequest(rpcUrl);
  request.timeout = 8000;
  const provider = new ethers.JsonRpcProvider(request, BASE, { staticNetwork: true, batchMaxCount: 6, batchStallTime: 16 });
  try {
    return await withRpcRetry(async () => {
      const block = await provider.getBlock('latest');
      if (!block || Date.now() - block.timestamp * 1000 > 60000) throw new Error('stale_block');
      const at = { blockTag: block.number };
      const pool = new ethers.Contract(pair.poolAddress, poolAbi, provider);
      const token = new ethers.Contract(stock.contractAddress, tokenAbi, provider);
      const quoter = new ethers.Contract(AERODROME_MIXED_QUOTER, quoterAbi, provider);
      const factoryContract = new ethers.Contract(AERODROME_CL_FACTORY_NEWEST, ['function getPool(address,address,int24) view returns (address)'], provider);

      const knownTokenDecimals = stock.decimals;
      const identityReads: Promise<unknown>[] = [
        pool.token0(at), pool.token1(at), pool.factory(at), pool.tickSpacing(at), pool.liquidity(at),
        token.multiplier(at), quoter.factory(at),
        factoryContract.getPool(stock.contractAddress, pair.quoteToken, pair.tickSpacing, at),
      ];
      if (knownTokenDecimals === null) identityReads.push(token.decimals(at));
      const values = await Promise.all(identityReads);
      const [token0, token1, factory, spacing, liquidity, multiplier, quoterFactory, resolvedPool] = values;
      const tokenDecimals = knownTokenDecimals === null ? Number(values[8]) : knownTokenDecimals;
      const quoteDecimals = 6;

      const expectedTokens = [stock.contractAddress, pair.quoteToken].map(a => a.toLowerCase()).sort();
      const decimalsOk = stock.decimals !== null
        ? tokenDecimals === stock.decimals
        : Number.isInteger(tokenDecimals) && tokenDecimals > 0 && tokenDecimals <= 18;
      if ([String(token0), String(token1)].map(a => a.toLowerCase()).sort().join() !== expectedTokens.join()
        || String(resolvedPool).toLowerCase() !== pair.poolAddress.toLowerCase()
        || String(factory).toLowerCase() !== AERODROME_CL_FACTORY_NEWEST.toLowerCase()
        || String(quoterFactory).toLowerCase() !== AERODROME_CL_FACTORY_NEWEST.toLowerCase()
        || Number(spacing) !== pair.tickSpacing
        || !decimalsOk
        || quoteDecimals !== 6) {
        throw new Error('route_mismatch');
      }

      const input = side === 'buy' ? pair.quoteToken : stock.contractAddress;
      const output = side === 'buy' ? stock.contractAddress : pair.quoteToken;
      const path = ethers.solidityPacked(['address', 'int24', 'address'], [input, pair.tickSpacing | pair.clFactoryBitmask, output]);
      const quoteAndFeed = await Promise.all([
        quoter.quoteExactInput.staticCall(path, amount, at),
        (async () => {
          try {
            const feed = new ethers.Contract(stock.chainlinkFeed, feedAbi, provider);
            const [round, decimals] = await Promise.all([feed.latestRoundData(at), feed.decimals(at)]);
            return { answer: BigInt(round.answer), decimals: Number(decimals), updatedAt: Number(round.updatedAt) };
          } catch { return null; }
        })(),
      ]);
      const [amountOut] = quoteAndFeed[0];
      const reference = quoteAndFeed[1];
      return {
        chainId: 8453, blockNumber: block.number, blockTimestamp: block.timestamp,
        token0: String(token0), token1: String(token1), factory: String(factory), quoterFactory: String(quoterFactory),
        resolvedPool: String(resolvedPool), tickSpacing: Number(spacing), tokenDecimals,
        quoteDecimals, multiplier: BigInt(multiplier as bigint), liquidity: BigInt(liquidity as bigint),
        amountOut: BigInt(amountOut), reference,
      };
    });
  } finally {
    provider.destroy();
  }
}

export function createAerodromeReader(): QuoteReader {
  return {
    async read(stock, pair, side, amount) {
      let last: unknown;
      for (const rpcUrl of baseRpcCandidates()) {
        try {
          return await readOn(rpcUrl, stock, pair, side, amount);
        } catch (error) {
          last = error;
          if (!isTransientRpcError(error)) throw error;
        }
      }
      throw last instanceof Error ? last : new Error('quote_unavailable');
    },
  };
}
