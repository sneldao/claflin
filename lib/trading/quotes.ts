import { getDeskInstrument, getQuotePair, type DeskInstrument } from './catalog';
import { formatAmount, LIVE_ASSUMPTIONS, LIVE_EXECUTION_ENABLED, PAPER_ASSUMPTIONS, parseAmount, parseIntent, TradingError, type QuoteEstimate, type ReferenceObservation } from './domain';
import { deskQuoteLimits, type DeskQuoteLimits } from './desk-mandate';
import { OPEN_DESK_ID } from '../house';
import type { VenuePair } from '../tokenized-stocks';

export interface QuoteSnapshot {
  chainId: number;
  blockNumber: number;
  blockTimestamp: number;
  token0: string;
  token1: string;
  factory: string;
  quoterFactory: string;
  resolvedPool: string;
  tickSpacing: number;
  tokenDecimals: number;
  quoteDecimals: number;
  multiplier: bigint;
  liquidity: bigint;
  amountOut: bigint;
  reference: { answer: bigint; decimals: number; updatedAt: number } | null;
}
export interface QuoteReader {
  read(stock: DeskInstrument, pair: Readonly<VenuePair>, side: 'buy' | 'sell', amount: bigint): Promise<QuoteSnapshot>;
}

const FACTORY = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef';
const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function referenceObservation(feed: QuoteSnapshot['reference'], now: number): ReferenceObservation {
  const base = { source: 'chainlink' as const, session: 'unknown' as const, pauseStatus: 'unchecked' as const };
  if (!feed || feed.answer <= 0n || !Number.isInteger(feed.decimals) || feed.decimals < 0 || feed.decimals > 18 || !Number.isSafeInteger(feed.updatedAt) || feed.updatedAt <= 0 || feed.updatedAt * 1000 > now) {
    return { ...base, status: 'unavailable' };
  }
  return { ...base, status: now - feed.updatedAt * 1000 > 86400000 ? 'stale' : 'observed', updatedAt: feed.updatedAt, priceUsdPerToken: formatAmount(feed.answer, feed.decimals) };
}

export function createQuoteService(
  reader: QuoteReader,
  clock = Date.now,
  id = () => crypto.randomUUID(),
  limits: DeskQuoteLimits = deskQuoteLimits(OPEN_DESK_ID),
) {
  return async (input: unknown): Promise<QuoteEstimate> => {
    const intent = parseIntent(input);
    const stock = getDeskInstrument(intent.instrumentId);
    const pair = getQuotePair(stock);
    const decimals = stock.decimals;
    if (decimals === null) throw new TradingError('unverified_units', 'Token units have not been verified.', 422);
    const raw = parseAmount(intent.amount, intent.side === 'buy' ? limits.quoteDecimals : decimals);
    const cap = intent.side === 'buy'
      ? parseAmount(limits.buyMax, limits.quoteDecimals)
      : parseAmount(limits.sellMax, decimals);
    if (raw > cap) throw new TradingError('demo_limit', 'Paper quote limit: 10,000 USDC per buy or 1,000 tokens per sell.');
    const started = clock();
    let snapshot: QuoteSnapshot;
    try {
      snapshot = await reader.read(stock, pair, intent.side, raw);
    } catch {
      throw new TradingError('quote_unavailable', 'The venue could not provide a verified estimate. Please retry.', 503);
    }
    const s = snapshot;
    if (s.chainId !== 8453 || !sameAddress(s.factory, FACTORY) || !sameAddress(s.quoterFactory, FACTORY) || !sameAddress(s.resolvedPool, pair.poolAddress) || s.tickSpacing !== pair.tickSpacing || pair.clFactoryBitmask !== 524288 ||
      !((sameAddress(s.token0, pair.quoteToken) && sameAddress(s.token1, stock.contractAddress)) || (sameAddress(s.token1, pair.quoteToken) && sameAddress(s.token0, stock.contractAddress)))) {
      throw new TradingError('route_mismatch', 'Venue identity verification failed. No estimate is available.', 503);
    }
    const completed = clock();
    if (completed >= started + 30000) throw new TradingError('quote_expired', 'The estimate expired while loading. Request a new one.', 503);
    if (!Number.isSafeInteger(s.blockNumber) || s.blockNumber <= 0 || !Number.isSafeInteger(s.blockTimestamp) || s.blockTimestamp * 1000 > completed + 5000 || completed - s.blockTimestamp * 1000 > 60000) {
      throw new TradingError('stale_block', 'The venue data is not recent enough. Please retry.', 503);
    }
    if (s.tokenDecimals !== decimals || s.quoteDecimals !== 6 || s.multiplier <= 0n || s.multiplier >= 2n ** 256n || s.liquidity <= 0n || s.amountOut <= 0n || s.amountOut >= 2n ** 256n) {
      throw new TradingError('invalid_quote', 'The venue returned invalid units or no output for this size.', 503);
    }
    const stockRaw = intent.side === 'buy' ? s.amountOut : raw;
    return {
      id: id(), kind: 'estimate', mode: 'paper', liveExecutionEnabled: false,
      intent: { ...intent, instrumentId: stock.id }, chainId: 8453, venue: 'aerodrome',
      poolAddress: pair.poolAddress, instrumentAddress: stock.contractAddress, instrumentName: stock.name,
      inputSymbol: intent.side === 'buy' ? 'USDC' : stock.symbol,
      outputSymbol: intent.side === 'buy' ? stock.symbol : 'USDC',
      amountInRaw: raw.toString(), amountOutRaw: s.amountOut.toString(),
      inputAmount: formatAmount(raw, intent.side === 'buy' ? 6 : decimals),
      outputAmount: formatAmount(s.amountOut, intent.side === 'buy' ? decimals : 6),
      tokenDecimals: decimals, multiplierRaw: s.multiplier.toString(),
      shareEquivalent: formatAmount(stockRaw * s.multiplier, decimals + 18),
      reference: referenceObservation(s.reference, completed),
      blockNumber: s.blockNumber, blockTimestamp: s.blockTimestamp, quotedAt: started, expiresAt: started + 30000,
      assumptions: LIVE_EXECUTION_ENABLED ? LIVE_ASSUMPTIONS : PAPER_ASSUMPTIONS,
    };
  };
}
