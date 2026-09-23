/**
 * The written slip's sentences — pure builders shared by both desks' slips
 * and their superseded lists. Buys read "Buy for your account · 100 USDC · of
 * Apple (AAPLc)"; sells read "Sell for your account · 5 scaled units · of
 * AAPLx". A quoted slip adds the venue's price as a clause, never a promise.
 */

/** The desk's own words — venue name, sell unit, quick amounts, unit codes. */
export interface SlipVocabulary {
  venue: string;
  /** The unit phrase on a sell sentence, e.g. 'scaled units' or 'GOOGLc tokens'. */
  sellUnit: (symbol: string) => string;
  buyChips: readonly string[];
  sellChips: readonly string[];
  /** The unit code written onto the draft when the side flips. */
  unitFor: (side: 'buy' | 'sell') => string;
}

export const JESSE_VOCAB: SlipVocabulary = {
  venue: 'Jupiter',
  sellUnit: () => 'scaled units',
  buyChips: ['25', '100', '250'],
  sellChips: ['1', '5', '10'],
  unitFor: side => (side === 'buy' ? 'USDC' : 'scaled-token'),
};

export const HETTY_VOCAB: SlipVocabulary = {
  venue: 'Aerodrome',
  sellUnit: symbol => `${symbol} tokens`,
  buyChips: ['10', '25', '100'],
  sellChips: ['1', '5', '10'],
  unitFor: side => (side === 'buy' ? 'USDC' : 'token'),
};

/** The slip needs only these fields from any desk's draft. */
export interface SlipDraftLike {
  instrumentId: string | null;
  side: string | null;
  amount: string | null;
  unit?: string | null;
}

export interface SlipInstrumentLike {
  symbol: string;
  name: string;
}

export interface SlipQuoteLike {
  id: string;
  intent: { instrumentId: string; side: 'buy' | 'sell'; amount: string };
  inputSymbol: string;
  outputSymbol: string;
  outputAmount: string;
  expiresAt: number;
  assumptions?: string;
}

/** A draft is complete when all three values are on the slip. */
export function draftComplete(draft: SlipDraftLike): boolean {
  return Boolean(draft.instrumentId && draft.side && draft.amount);
}

export interface SlipSentence {
  /** 'Buy' | 'Sell' — the only word the side field writes. */
  sideWord: 'Buy' | 'Sell' | null;
  amount: string | null;
  /** The amount's unit phrase — 'USDC' on a buy, the vocab's sellUnit on a sell. */
  amountUnit: string | null;
  /** 'Name (SYMBOL)' for buys, 'SYMBOL' for sells. */
  instrumentLabel: string | null;
  /** The quoted-price clause, with the trailing period. */
  priceClause: string | null;
}

export function slipSentence(
  draft: SlipDraftLike,
  instrument: SlipInstrumentLike | null,
  quote: { outputAmount: string; outputSymbol: string } | null,
  vocab: SlipVocabulary,
): SlipSentence {
  const side = draft.side;
  const sideWord = side === 'buy' ? 'Buy' : side === 'sell' ? 'Sell' : null;
  const amountUnit = side === 'buy'
    ? 'USDC'
    : side === 'sell'
      ? vocab.sellUnit(instrument?.symbol ?? 'Stock')
      : null;
  const instrumentLabel = instrument
    ? side === 'sell'
      ? instrument.symbol
      : `${instrument.name} (${instrument.symbol})`
    : null;
  const priceClause = quote
    ? side === 'sell'
      ? `about ${quote.outputAmount} USDC back at ${vocab.venue}’s price just now.`
      : `about ${quote.outputAmount} ${quote.outputSymbol} at ${vocab.venue}’s price just now.`
    : null;
  return { sideWord, amount: draft.amount || null, amountUnit, instrumentLabel, priceClause };
}

/** One-line form for superseded entries and receipts, e.g.
 *  "Buy 100 USDC of AAPLx — about 0.4312 AAPLx". */
export function slipOneLine(quote: SlipQuoteLike, vocab: SlipVocabulary): string {
  const { intent } = quote;
  return intent.side === 'buy'
    ? `Buy ${intent.amount} USDC of ${quote.outputSymbol} — about ${quote.outputAmount} ${quote.outputSymbol}`
    : `Sell ${intent.amount} ${vocab.sellUnit(quote.inputSymbol)} of ${quote.inputSymbol} — about ${quote.outputAmount} ${quote.outputSymbol}`;
}

/** Past-tense receipt copy — filed, never filled. */
export function filedLine(quote: SlipQuoteLike, symbol: string, vocab: SlipVocabulary): string {
  const amount = quote.intent.side === 'buy'
    ? `${quote.intent.amount} USDC`
    : `${quote.intent.amount} ${vocab.sellUnit(symbol)}`;
  return `Filed on paper: ${quote.intent.side} ${amount} of ${symbol} — ${vocab.venue} estimated about ${quote.outputAmount} ${quote.outputSymbol}. Nothing moved.`;
}

/** One validity rule for both desks: open, then a closing freeze in the last
 *  seconds, then lapsed. Filing is only allowed while open. */
export function slipValidity(expiresAt: number, now: number): {
  secondsLeft: number;
  state: 'open' | 'closing' | 'lapsed';
} {
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const state = secondsLeft <= 0 ? 'lapsed' : secondsLeft <= 5 ? 'closing' : 'open';
  return { secondsLeft, state };
}
