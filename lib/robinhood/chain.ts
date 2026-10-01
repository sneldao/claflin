/**
 * Robinhood Chain reads — eip155:4663. Server-only (ethers + env).
 *
 * ROBINHOOD_RPC_URL is the env-gated provider endpoint (Alchemy is Robinhood's
 * recommended provider); the public dRPC endpoint is the keyless fallback used
 * by the spike — fine for reads, not a production guarantee.
 */

import { ethers } from 'ethers';
import { feedAbi, isTransientRpcError, withRpcRetry } from '../trading/aerodrome';
import { ROBINHOOD_CHAIN_ID } from './contracts';

export const ROBINHOOD = ethers.Network.from(ROBINHOOD_CHAIN_ID);

const ERC8056_ABI = ['function uiMultiplier() view returns (uint256)'];

export function robinhoodRpcCandidates(): string[] {
  const fromEnv = [process.env.ROBINHOOD_RPC_URL].filter((u): u is string => Boolean(u && u.trim()));
  const publicFallbacks = ['https://robinhood.drpc.org'];
  return [...new Set([...fromEnv, ...publicFallbacks].map(u => u.replace(/\/+$/, '')))];
}

export type RobinhoodFeedReading = { answer: bigint; decimals: number; updatedAt: number } | null;

/** Read each feed once per RPC candidate, tolerating per-feed failure. */
export function createRobinhoodFeedReader(): (feeds: readonly string[]) => Promise<RobinhoodFeedReading[]> {
  return async (feeds) => {
    let last: unknown;
    for (const rpcUrl of robinhoodRpcCandidates()) {
      const request = new ethers.FetchRequest(rpcUrl);
      request.timeout = 8000;
      /* batchMaxCount 1: the public dRPC endpoint 500s on batched JSON-RPC
         arrays — issue one call per request. */
      const provider = new ethers.JsonRpcProvider(request, ROBINHOOD, { staticNetwork: true, batchMaxCount: 1 });
      try {
        return await withRpcRetry(async () => {
          return await Promise.all(feeds.map(async (feedAddress) => {
            try {
              const feed = new ethers.Contract(feedAddress, feedAbi, provider);
              const [round, decimals] = await Promise.all([feed.latestRoundData(), feed.decimals()]);
              return { answer: BigInt(round.answer), decimals: Number(decimals), updatedAt: Number(round.updatedAt) };
            } catch { return null; }
          }));
        });
      } catch (error) {
        last = error;
        if (!isTransientRpcError(error)) throw error;
      } finally {
        provider.destroy();
      }
    }
    throw last instanceof Error ? last : new Error('marks_unavailable');
  };
}

/** Live corporate-action multiplier — ERC-8056 `uiMultiplier()`, 18dp fixed
 *  point. Read at quote time; never cached into the catalog. */
export async function readUiMultiplier(contractAddress: string): Promise<bigint | null> {
  let last: unknown;
  for (const rpcUrl of robinhoodRpcCandidates()) {
    const request = new ethers.FetchRequest(rpcUrl);
    request.timeout = 8000;
    const provider = new ethers.JsonRpcProvider(request, ROBINHOOD, { staticNetwork: true, batchMaxCount: 1 });
    try {
      const token = new ethers.Contract(contractAddress, ERC8056_ABI, provider);
      return BigInt(await token.uiMultiplier());
    } catch (error) {
      last = error;
      if (!isTransientRpcError(error)) return null;
    } finally {
      provider.destroy();
    }
  }
  return null;
}
