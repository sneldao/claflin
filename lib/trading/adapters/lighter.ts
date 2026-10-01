import { getRobinhoodInstrument } from '../../robinhood/catalog';
import {
  fetchLighterBook,
  fetchLighterMarkets,
  walkAsks,
  walkBids,
  type LighterBook,
  type LighterMarket,
} from '../../robinhood/lighter';
import { fetchRhjPrices, type RhjPrice } from '../../robinhood/rhj';
import {
  createRobinhoodFeedReader,
  readUiMultiplier,
  type RobinhoodFeedReading,
} from '../../robinhood/chain';
import {
  isIsabelIntent,
  USDG_DECIMALS,
  type IsabelIntent,
  type RobinhoodPaperEstimate,
} from '../../robinhood/contracts';
import { deskQuoteLimits, type DeskQuoteLimits } from '../desk-mandate';
import { formatAmount, parseAmount, TradingError, type QuoteEstimate } from '../domain';
import type { QuoteAdapter } from '../adapters';

/**
 * Lighter orderbook quote adapter — Isabel's Robinhood Chain desk. The
 * estimate walks the visible `<SYM>/USDG` book level-by-level in fixed
 * point: what fills is the output; what the book cannot cover is labelled
 * unfilled, never silently extended. Paper only — order placement is a
 * Lighter account matter (docs/ELIGIBILITY.md §5).
 *
 * Environment: ROBINHOOD_RPC_URL selects the provider endpoint for onchain
 * reads (Chainlink mark + ERC-8056 multiplier); the keyless public dRPC
 * endpoint is the fallback. rhj REST is keyless.
 */

export const ROBINHOOD_PAPER_ASSUMPTIONS =
  'Simulated fill against the visible Lighter order book on Robinhood Chain at the quoted prices, limited to resting depth. ' +
  'No venue fees, gas, or slippage beyond book depth are applied; partial depth is labelled, not extended. ' +
  'The corporate-action multiplier and Chainlink mark were read onchain at quote time; a corporate action before execution would change the share equivalent. ' +
  'No wallet, holdings, eligibility or transaction authorization is verified. This is a local paper record, not a live order or position.';

const REVIEW_WINDOW_MS = 30_000;

type FeedReader = (feeds: readonly string[]) => Promise<RobinhoodFeedReading[]>;
type MultiplierReader = (contractAddress: string) => Promise<bigint | null>;

export function createLighterQuoteAdapter({
  fetchBook = fetchLighterBook,
  fetchMarkets = fetchLighterMarkets,
  fetchPrices = fetchRhjPrices,
  readFeeds = createRobinhoodFeedReader(),
  readMultiplier = readUiMultiplier,
  now = Date.now,
  id = () => crypto.randomUUID(),
  limits = deskQuoteLimits('isabel'),
}: {
  fetchBook?: typeof fetchLighterBook;
  fetchMarkets?: typeof fetchLighterMarkets;
  fetchPrices?: typeof fetchRhjPrices;
  readFeeds?: FeedReader;
  readMultiplier?: MultiplierReader;
  now?: () => number;
  id?: () => string;
  limits?: DeskQuoteLimits;
} = {}): QuoteAdapter {
  return {
    venue: 'lighter',
    async quote(input: unknown): Promise<QuoteEstimate> {
      if (!isIsabelIntent(input)) {
        throw new TradingError('invalid_intent', 'Use a supported Robinhood instrument, buy with a USDG spend, or sell a token quantity. Enter a positive decimal amount.');
      }
      const instrument = getRobinhoodInstrument(input.instrumentId);
      if (!instrument.quoteSupported) {
        throw new TradingError('coverage_pending', 'Quote coverage for this instrument has not been verified.', 422);
      }
      const started = now();
      const buy = input.side === 'buy';
      const inputRaw = buy
        ? parseAmount(input.amount, USDG_DECIMALS)
        : parseAmount(input.amount, instrument.decimals);
      const cap = buy
        ? parseAmount(limits.buyMax, USDG_DECIMALS)
        : parseAmount(limits.sellMax, instrument.decimals);
      if (inputRaw > cap) {
        throw new TradingError('demo_limit', `Paper quote limit: ${limits.buyMax} USDG per buy or ${limits.sellMax} tokens per sell.`);
      }

      let market: LighterMarket | undefined;
      let book: LighterBook;
      let issuerRow: RhjPrice | undefined;
      let feedReading: RobinhoodFeedReading;
      let multiplier: bigint | null;
      try {
        const [markets, bookResult, prices, feedReadings, mult] = await Promise.all([
          fetchMarkets(),
          fetchBook(instrument.lighterMarketId),
          fetchPrices().catch(() => null),
          readFeeds([instrument.chainlinkFeed]).catch(() => null),
          readMultiplier(instrument.contractAddress).catch(() => null),
        ]);
        market = markets.find(m => m.marketId === instrument.lighterMarketId);
        book = bookResult;
        issuerRow = prices?.get(instrument.symbol);
        feedReading = feedReadings?.[0] ?? null;
        multiplier = mult;
      } catch {
        throw new TradingError('quote_unavailable', 'The venue could not provide a verified estimate. Please retry.', 503);
      }

      if (!market || market.status !== 'active') {
        throw new TradingError('coverage_pending', 'This market is not active on the venue.', 422);
      }
      if (issuerRow?.halted) {
        throw new TradingError('issuer_halted', 'The issuer reports a trading halt for this instrument. No estimate is available.', 409);
      }

      const walk = buy
        ? walkAsks(book, inputRaw, market)
        : walkBids(book, inputRaw, market);
      if (walk.outRaw <= 0n) {
        throw new TradingError('quote_unavailable', 'The venue book held no usable depth for this size. Please retry or reduce the amount.', 503);
      }

      const completed = now();
      if (completed >= started + REVIEW_WINDOW_MS) {
        throw new TradingError('quote_expired', 'The estimate expired while loading. Request a new one.', 503);
      }

      const multiplierRaw = multiplier !== null && multiplier > 0n ? multiplier.toString() : null;
      const tokenRaw = buy ? walk.outRaw : inputRaw;
      const shareEquivalent = multiplier !== null && multiplier > 0n
        ? formatAmount(tokenRaw * multiplier, 36)
        : null;

      const estimate: RobinhoodPaperEstimate = {
        version: 1,
        id: id(),
        kind: 'estimate',
        mode: 'paper',
        liveExecutionEnabled: false,
        deskId: 'isabel',
        mandateId: 'robinhood-stock-tokens',
        instrumentId: instrument.id,
        network: 'eip155:4663',
        chainId: 4663,
        venue: 'lighter',
        intent: { ...input, instrumentId: instrument.id } as IsabelIntent,
        instrumentAddress: instrument.contractAddress,
        instrumentName: instrument.name,
        inputSymbol: buy ? 'USDG' : instrument.symbol,
        outputSymbol: buy ? instrument.symbol : 'USDG',
        amountInRaw: inputRaw.toString(),
        amountOutRaw: walk.outRaw.toString(),
        inputAmount: formatAmount(inputRaw, buy ? USDG_DECIMALS : instrument.decimals),
        outputAmount: formatAmount(walk.outRaw, buy ? instrument.decimals : USDG_DECIMALS),
        book: {
          marketId: instrument.lighterMarketId,
          bestBid: walk.bestBid,
          bestAsk: walk.bestAsk,
          midPrice: walk.midPrice,
          spreadBps: walk.spreadBps,
          levelsConsumed: walk.levelsConsumed,
          filledFully: walk.filledFully,
          unfilledInputRaw: walk.unfilledInputRaw.toString(),
        },
        multiplierRaw,
        shareEquivalent,
        onchainMark: feedReading && feedReading.answer > 0n
          ? {
              answerRaw: feedReading.answer.toString(),
              decimals: feedReading.decimals,
              updatedAt: feedReading.updatedAt,
              status: completed - feedReading.updatedAt * 1000 > 86_400_000 ? 'stale' : 'observed',
            }
          : { answerRaw: '0', decimals: 8, updatedAt: 0, status: 'unavailable' },
        issuerMark: issuerRow
          ? {
              underlyingBid: issuerRow.bid?.toString() ?? '',
              underlyingAsk: issuerRow.ask?.toString() ?? '',
              tokenBid: issuerRow.tokenBid?.toString() ?? '',
              tokenAsk: issuerRow.tokenAsk?.toString() ?? '',
              halted: issuerRow.halted,
              generatedAt: issuerRow.generatedAt,
            }
          : null,
        quotedAt: started,
        expiresAt: started + REVIEW_WINDOW_MS,
        assumptions: ROBINHOOD_PAPER_ASSUMPTIONS,
      };
      return estimate;
    },
  };
}

export const lighterQuoteAdapter: QuoteAdapter = createLighterQuoteAdapter();
