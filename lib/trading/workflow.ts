import { z } from 'zod';
import { getDeskInstrument, resolveDeskAlias } from './catalog';
import { formatAmount, intentSchema, PAPER_ASSUMPTIONS, parseAmount, parseIntent, type QuoteEstimate, type TradeIntent } from './domain';

const positiveRaw = z.string().max(78).regex(/^[1-9]\d*$/);
const decimal = z.string().max(180).regex(/^\d+(\.\d+)?$/);
const estimateSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[\w-]+$/), kind: z.literal('estimate'), mode: z.literal('paper'), liveExecutionEnabled: z.literal(false),
  intent: intentSchema, chainId: z.literal(8453), venue: z.literal('aerodrome'), poolAddress: z.string(), instrumentAddress: z.string(), instrumentName: z.string().max(100),
  inputSymbol: z.string().max(20), outputSymbol: z.string().max(20), amountInRaw: positiveRaw, amountOutRaw: positiveRaw,
  inputAmount: decimal, outputAmount: decimal, tokenDecimals: z.number().int().min(0).max(18), multiplierRaw: positiveRaw, shareEquivalent: decimal,
  reference: z.object({ status: z.enum(['observed', 'stale', 'unavailable']), source: z.literal('chainlink'), priceUsdPerToken: decimal.optional(), updatedAt: z.number().int().positive().optional(), session: z.literal('unknown'), pauseStatus: z.literal('unchecked') }).strict(),
  blockNumber: z.number().int().positive(), blockTimestamp: z.number().int().positive(), quotedAt: z.number().int().positive(), expiresAt: z.number().int().positive(), assumptions: z.literal(PAPER_ASSUMPTIONS),
}).strict();

export function parseEstimate(input: unknown): QuoteEstimate {
  const q = estimateSchema.parse(input);
  const stock = getDeskInstrument(q.intent.instrumentId);
  const decimals = q.intent.side === 'buy' ? 6 : q.tokenDecimals;
  const outputDecimals = q.intent.side === 'buy' ? q.tokenDecimals : 6;
  const raw = parseAmount(q.intent.amount, decimals);
  const tokenRaw = q.intent.side === 'buy' ? BigInt(q.amountOutRaw) : raw;
  if (q.tokenDecimals !== stock.decimals || q.instrumentAddress.toLowerCase() !== stock.contractAddress.toLowerCase() || !stock.venuePairs.some(p => p.poolAddress.toLowerCase() === q.poolAddress.toLowerCase()) ||
    raw.toString() !== q.amountInRaw || formatAmount(raw, decimals) !== q.inputAmount || formatAmount(BigInt(q.amountOutRaw), outputDecimals) !== q.outputAmount ||
    q.inputSymbol !== (q.intent.side === 'buy' ? 'USDC' : stock.symbol) || q.outputSymbol !== (q.intent.side === 'buy' ? stock.symbol : 'USDC') ||
    q.shareEquivalent !== formatAmount(tokenRaw * BigInt(q.multiplierRaw), q.tokenDecimals + 18) || q.expiresAt - q.quotedAt !== 30000) throw new Error('Invalid estimate binding.');
  return q;
}

export function sameIntent(a: TradeIntent, b: TradeIntent): boolean {
  return a.instrumentId === b.instrumentId && a.side === b.side && a.unit === b.unit && a.amount === b.amount;
}

export function estimateUsable(q: QuoteEstimate, now: number): boolean {
  return now >= q.quotedAt && now < q.expiresAt;
}

export interface DeskState {
  draft: TradeIntent;
  stage: 'draft' | 'loading' | 'review' | 'saved' | 'cancelled';
  requestId: string | null;
  quote: QuoteEstimate | null;
  message: string | null;
}
export type DeskAction =
  | { type: 'edit'; draft: TradeIntent }
  | { type: 'request'; requestId: string }
  | { type: 'quoted'; requestId: string; quote: QuoteEstimate }
  | { type: 'failed'; requestId: string; message: string }
  | { type: 'cancel' }
  | { type: 'saved'; quoteId: string; now: number }
  | { type: 'hydrate'; state: DeskState };

export function initialDesk(draft: TradeIntent): DeskState {
  return { draft, stage: 'draft', requestId: null, quote: null, message: null };
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case 'edit': return initialDesk(action.draft);
    case 'request': return { ...state, stage: 'loading', requestId: action.requestId, quote: null, message: null };
    case 'quoted':
      if (state.stage !== 'loading' || state.requestId !== action.requestId || !sameIntent(state.draft, action.quote.intent)) return state;
      return { ...state, stage: 'review', quote: action.quote, requestId: null };
    case 'failed':
      if (state.requestId !== action.requestId) return state;
      return { ...state, stage: 'draft', requestId: null, message: action.message };
    case 'cancel': return { ...state, stage: 'cancelled', quote: null, requestId: null, message: 'You decided not to record this instruction. Nothing was filed.' };
    case 'saved':
      if (state.stage !== 'review' || state.quote?.id !== action.quoteId || !estimateUsable(state.quote, action.now)) return state;
      return { ...state, stage: 'saved', message: 'Filed to your paper ledger.' };
    case 'hydrate': return action.state;
  }
}

export function intentFromSpeech(text: string): TradeIntent {
  const clean = text.trim().replace(/[.!?]$/, '');
  const buy = /^buy ([a-z ]{1,40}) for (\d+(?:\.\d+)?) USDC$/i.exec(clean);
  const sell = /^sell (\d+(?:\.\d+)?) ([a-z ]{1,40}) tokens?$/i.exec(clean);
  const match = buy || sell;
  if (!match) throw new Error('Try “buy NVIDIA for 100 USDC” or “sell 0.5 NVIDIA tokens”.');
  const stock = resolveDeskAlias(buy ? match[1] : match[2]);
  if (!stock?.quoteSupported) throw new Error('That instrument has no verified quote coverage on this desk.');
  return parseIntent({ instrumentId: stock.id, side: buy ? 'buy' : 'sell', amount: buy ? match[2] : match[1], unit: buy ? 'USDC' : 'token' });
}
