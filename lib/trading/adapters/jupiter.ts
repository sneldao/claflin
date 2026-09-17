import { getSolanaInstrument, SOLANA_USDC_DECIMALS, SOLANA_USDC_MINT } from '../../solana/catalog';
import { compareDecimals, displayedToRaw, effectiveDisplayed, rawToDisplayed } from '../../solana/amounts';
import { createJupiterClient, JUPITER_SLIPPAGE_BPS, type JupiterOrder } from '../../solana/jupiter';
import { createMintReader, type ScaledMintObservation } from '../../solana/mint';
import { isJesseIntent, isSolanaInstrumentId, type SolanaInstrument, type SolanaPaperEstimate } from '../../solana/contracts';
import { deskQuoteLimits, type DeskQuoteLimits } from '../desk-mandate';
import { formatAmount, parseAmount, TradingError, type QuoteEstimate } from '../domain';
import type { DeskInstrument } from '../catalog';
import type { QuoteAdapter } from '../adapters';

/**
 * Jupiter Swap V2 quote adapter — Jesse's Solana desk. Metis routes only
 * (lib/solana/jupiter.ts pins the policy); conversions use the mint's own
 * scaled-unit multiplier read at quote time, never a cached value.
 *
 * Environment: JUPITER_API_KEY is optional (Jupiter serves a keyless tier;
 * the header is sent only when configured). SOLANA_RPC_URL selects the
 * mainnet RPC used for multiplier reads, defaulting to a public endpoint.
 */

export const SOLANA_PAPER_ASSUMPTIONS =
  'Simulated fill at the quoted output from Jupiter’s Metis route, including the platform and route fees shown. ' +
  'No network or priority fees and no slippage beyond the quoted tolerance are applied. ' +
  'The scaled-unit multiplier was read from the mint at quote time; a corporate action before execution would change the amounts. ' +
  'No wallet, holdings, eligibility or transaction authorization is verified. This is a local paper record, not a live order or position.';

const REVIEW_WINDOW_MS = 30_000;

type ReadMint = (mint: string) => Promise<ScaledMintObservation>;
type Order = (request: { inputMint: string; outputMint: string; amountRaw: string }) => Promise<JupiterOrder>;

export function createJupiterQuoteAdapter({
  readMint,
  order,
  now = Date.now,
  id = () => crypto.randomUUID(),
  limits = deskQuoteLimits('jesse'),
}: {
  readMint: ReadMint;
  order: Order;
  now?: () => number;
  id?: () => string;
  limits?: DeskQuoteLimits;
}): QuoteAdapter {
  return {
    venue: 'jupiter',
    canQuote(instrument: DeskInstrument | SolanaInstrument): boolean {
      return isSolanaInstrumentId(instrument.id)
        && 'tokenProgram' in instrument
        && instrument.tokenProgram === 'spl-token-2022'
        && instrument.quoteSupported;
    },
    async quote(input: unknown): Promise<QuoteEstimate> {
      if (!isJesseIntent(input)) {
        throw new TradingError('invalid_intent', 'Use a supported Solana instrument, buy with a USDC spend, or sell a scaled token quantity. Enter a positive decimal amount.');
      }
      const instrument = getSolanaInstrument(input.instrumentId);
      if (!instrument.quoteSupported) {
        throw new TradingError('coverage_pending', 'Quote coverage for this instrument has not been verified.', 422);
      }
      const started = now();
      const mint = await readMint(instrument.mint);
      if (mint.decimals !== instrument.decimals) {
        /* The allowlist said 8; the mint says otherwise. Identity has changed
           since verification — fail closed, never convert with mixed units. */
        throw new TradingError('unverified_units', 'Token units have changed since verification. No estimate is available.', 422);
      }
      const scaling = {
        multiplier: mint.multiplier,
        observedSlot: mint.observedSlot,
        observedAt: mint.observedAt,
        nextEffectiveAt: mint.nextEffectiveAt,
      };
      const buy = input.side === 'buy';
      let amountInRaw: string;
      if (buy) {
        const spend = parseAmount(input.amount, SOLANA_USDC_DECIMALS);
        if (spend > parseAmount(limits.buyMax, SOLANA_USDC_DECIMALS)) {
          throw new TradingError('demo_limit', `Paper quote limit: ${limits.buyMax} USDC per buy or ${limits.sellMax} tokens per sell.`);
        }
        amountInRaw = spend.toString();
      } else {
        if (compareDecimals(input.amount, limits.sellMax) > 0) {
          throw new TradingError('demo_limit', `Paper quote limit: ${limits.buyMax} USDC per buy or ${limits.sellMax} tokens per sell.`);
        }
        try {
          amountInRaw = displayedToRaw(input.amount, instrument.decimals, mint.multiplier).toString();
        } catch (error) {
          throw new TradingError('invalid_amount', error instanceof Error ? error.message : 'Enter a positive decimal amount.');
        }
      }
      const orderResult = await order({
        inputMint: buy ? SOLANA_USDC_MINT : instrument.mint,
        outputMint: buy ? instrument.mint : SOLANA_USDC_MINT,
        amountRaw: amountInRaw,
      });
      const completed = now();
      const expiresAt = mint.nextEffectiveAt !== null
        ? Math.min(started + REVIEW_WINDOW_MS, mint.nextEffectiveAt)
        : started + REVIEW_WINDOW_MS;
      if (completed >= expiresAt) {
        throw new TradingError('quote_expired', 'The estimate expired while loading. Request a new one.', 503);
      }
      const stockRaw = BigInt(buy ? orderResult.outAmount : amountInRaw);
      const estimate: SolanaPaperEstimate = {
        version: 2,
        id: id(),
        kind: 'estimate',
        mode: 'paper',
        liveExecutionEnabled: false,
        deskId: 'jesse',
        network: 'solana:mainnet',
        venue: 'jupiter',
        intent: { ...input, instrumentId: instrument.id },
        instrumentAddress: instrument.mint,
        instrumentName: instrument.name,
        inputMint: buy ? SOLANA_USDC_MINT : instrument.mint,
        outputMint: buy ? instrument.mint : SOLANA_USDC_MINT,
        inputSymbol: buy ? 'USDC' : instrument.symbol,
        outputSymbol: buy ? instrument.symbol : 'USDC',
        amountInRaw,
        amountOutRaw: orderResult.outAmount,
        inputAmount: buy ? formatAmount(BigInt(amountInRaw), SOLANA_USDC_DECIMALS) : effectiveDisplayed(stockRaw, instrument.decimals, mint.multiplier),
        outputAmount: buy
          ? rawToDisplayed(BigInt(orderResult.outAmount), instrument.decimals, mint.multiplier)
          : formatAmount(BigInt(orderResult.outAmount), SOLANA_USDC_DECIMALS),
        requestedScaledAmount: buy ? null : input.amount,
        effectiveScaledAmount: rawToDisplayed(stockRaw, instrument.decimals, mint.multiplier),
        scaling,
        router: orderResult.router,
        priceImpactPercent: orderResult.priceImpact === null ? null : String(orderResult.priceImpact),
        feeBps: orderResult.feeBps,
        feeMint: orderResult.feeMint,
        slippageBps: orderResult.slippageBps ?? JUPITER_SLIPPAGE_BPS,
        minOutputRaw: orderResult.minOutputRaw,
        providerRequestId: orderResult.providerRequestId,
        quotedAt: started,
        expiresAt,
        assumptions: SOLANA_PAPER_ASSUMPTIONS,
      };
      return estimate;
    },
  };
}

/** The wired adapter: environment in, registry entry out. RPC and provider
 *  failures surface as honest 503s from the reader/client, never defaults. */
export const jupiterQuoteAdapter: QuoteAdapter = createJupiterQuoteAdapter({
  readMint: createMintReader({ rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com' }),
  order: createJupiterClient(),
});
