import { z } from 'zod';

export class TradingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'TradingError';
  }
}

const amount = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/).refine(s => /[1-9]/.test(s));
const base = { instrumentId: z.string().min(1).max(80), amount };
export const intentSchema = z.discriminatedUnion('side', [
  z.object({ ...base, side: z.literal('buy'), unit: z.literal('USDC') }).strict(),
  z.object({ ...base, side: z.literal('sell'), unit: z.literal('token') }).strict(),
]);
export type TradeIntent = z.infer<typeof intentSchema>;

export function parseIntent(input: unknown): TradeIntent {
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) throw new TradingError('invalid_intent', 'Use a supported instrument, buy with a USDC spend, or sell a token quantity. Enter a positive decimal amount.');
  return parsed.data;
}

export function parseAmount(value: string, decimals: number): bigint {
  if (!amount.safeParse(value).success || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new TradingError('invalid_amount', 'Enter a positive decimal amount.');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new TradingError('amount_precision', `Use at most ${decimals} decimal places.`);
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (result <= 0n || result >= 2n ** 256n) throw new TradingError('invalid_amount', 'Amount is outside the supported range.');
  return result;
}

export function formatAmount(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${raw / scale}${fraction ? `.${fraction}` : ''}`;
}

export type ReferenceObservation = {
  status: 'observed' | 'stale' | 'unavailable';
  /** Reference source — 'chainlink' today; 'pyth', 'robinhood', … per desk later. */
  source: string;
  priceUsdPerToken?: string;
  updatedAt?: number;
  session: 'unknown';
  pauseStatus: 'unchecked';
};

export interface QuoteEstimate {
  id: string;
  kind: 'estimate';
  mode: 'paper';
  liveExecutionEnabled: false;
  intent: TradeIntent;
  /** Settlement chain id — 8453 today; per-venue later. */
  chainId: number;
  /** Venue id — 'aerodrome' today; registry keys later. */
  venue: string;
  poolAddress: string;
  instrumentAddress: string;
  instrumentName: string;
  inputSymbol: string;
  outputSymbol: string;
  amountInRaw: string;
  amountOutRaw: string;
  inputAmount: string;
  outputAmount: string;
  tokenDecimals: number;
  multiplierRaw: string;
  shareEquivalent: string;
  reference: ReferenceObservation;
  blockNumber: number;
  blockTimestamp: number;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
}

export const PAPER_ASSUMPTIONS = 'Simulated fill at the quoted output, including pool swap fees. No additional slippage, gas, platform or call charges are applied. No wallet, holdings, eligibility or transaction authorization is verified. This is a local paper record, not a live order or position.';

export const LIVE_ASSUMPTIONS = 'Live execution on Base using the connected wallet. Pool swap fees are included in the quoted output; actual received tokens may differ due to slippage and gas. The wallet must hold sufficient input tokens and ETH for gas. This is a real onchain swap, not a guarantee of fill price or settlement.';

export const LIVE_EXECUTION_ENABLED = process.env.NEXT_PUBLIC_LIVE_EXECUTION_ENABLED === 'true';
