const TRADE_ATTEMPT_RE = /\b(sell off|pick up|invest in|buy|sell|purchase|acquire|get|grab|bid|dump|liquidate|dispose|unload|invest|order|trade|leverage|margin|comprar|compro|adquirir|vender|vendo|liquidar|acheter|achète|acquérir|vendre|vends|liquider|kaufen|kaufe|erwerben|verkaufen|verkaufe|abstoßen)\b|\b(?:go|to|be)\s+(?:short|long)\b|^(?:short|long)\b|買う|買います|購入|買い|売る|売ります|売却|売り|买|购买|买入|做多|卖|卖出|减持|做空/i;
const SIDE_RE = /\b(sell off|pick up|invest in|buy|sell|purchase|acquire|get|grab|bid|dump|liquidate|dispose|unload|comprar|compro|adquirir|vender|vendo|liquidar|acheter|achète|acquérir|vendre|vends|liquider|kaufen|kaufe|erwerben|verkaufen|verkaufe|abstoßen)\b|買う|買います|購入|買い|売る|売ります|売却|売り|买|购买|买入|做多|卖|卖出|减持|做空/gi;
const CONNECTOR_RE = /\b(and then|and|then|plus|also|y luego|y|et ensuite|et|und dann|und|そして|然后)\b/gi;
const CONDITIONAL_RE = /\b(if|when|once|whenever|until|unless)\b|\breaches?\s*[\$¥€£]?\s*\d|\btouches?\s*[\$¥€£]?\s*\d|\bhits?\s*[\$¥€£]?\s*\d|\bdips?\s+(?:to|below|under)\s*[\$¥€£]?\s*\d|\bat\s*[\$¥€£]\s*\d|\blimit\s*[\$¥€£]?\s*\d/i;
const ORDER_TYPE_RE = /\b(limit(?:\s+order)?|stop[-\s]?loss|stop(?:\s+order|\s+limit)?|trailing\s+stop|market\s+if\s+touched|take[-\s]?profit|fill[-\s]?or[-\s]?kill|good[-\s]?til)\b/i;
const LEVERAGE_RE = /\b(leverage|leveraged|on\s+margin|margin|[2-9]\d*x|short|long)\b/i;
const NEGATIVE_AMOUNT_RE = /(?<![\d.,])[-−]\s*[\$¥€£]?\s*\d|(?<![\d.])0+(?:\.0+)?(?![\d.])|\bnegative\b/i;
const NUMBER_RE = /[\$¥€£]?\s*\d+(?:\.\d+)?\s*(?:dollars?|bucks|usdc|tokens?|shares|units)?/gi;
const DIGITS_RE = /[\$¥€£]?\s*\d+(?:\.\d+)?/g;
const CORRECTION_PHRASE_RE = /\b(?:make that|make it|change (?:it|that) to|actually|i meant)\b\s*[,—–:]?\s*/gi;
const NEGATION_PREFIX_RE = /\bnot\s+[\$¥€£]?\s*(\d+(?:\.\d+)?)\s*[,—–\-:]\s*(?:make\s+(?:that|it)\s+|actually\s+|i\s+meant\s+)?/i;
const CORRECTION_PRESENT_RE = /\b(?:make that|make it|change (?:it|that) to|actually|i meant)\b|\bnot\s+[\$¥€£]?\s*\d/i;

const NON_PRODUCT_WORDS = new Set([
  'buy', 'sell', 'purchase', 'acquire', 'get', 'grab', 'bid', 'invest', 'order', 'trade',
  'short', 'long', 'dump', 'liquidate', 'dispose', 'unload',
  'comprar', 'compro', 'adquirir', 'vender', 'vendo', 'liquidar',
  'acheter', 'vendre', 'vends', 'kaufen', 'kaufe', 'verkaufen', 'verkaufe',
  'make', 'that', 'this', 'it', 'change', 'actually', 'meant', 'meant', 'not', 'no',
  'of', 'in', 'into', 'on', 'for', 'the', 'a', 'an', 'to', 'and', 'then', 'plus',
  'also', 'or', 'with', 'my', 'me', 'please', 'some', 'more', 'less', 'worth',
  'each', 'now', 'again', 'all', 'half',
  'usdc', 'usd', 'dollar', 'dollars', 'bucks', 'buck', 'euro', 'euros', 'token',
  'tokens', 'share', 'shares', 'unit', 'units', 'scaled', 'stock', 'stocks',
  'xstock', 'xstocks', 'if', 'when', 'once', 'whenever', 'until', 'unless',
  'price', 'reaches', 'reach', 'touches', 'hits', 'dips', 'dip', 'drops', 'falls',
  'rises', 'goes', 'crosses', 'below', 'above', 'at', 'limit', 'watch', 'pin',
  'track', 'monitor', 'compare', 'explain', 'what', 'whats', 'is', 'are', 'was',
  'desk', 'jesse', 'hetty', 'solana', 'base', 'jupiter', 'paper', 'record',
  'file', 'keep', 'save', 'cancel', 'aside', 'never', 'mind', 'forget',
  'quote', 'estimate', 'want', 'would', 'like', 'just', 'please', 'more', 'us',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'thousand', 'grand',
  'uno', 'dos', 'tres', 'cuatro', 'cinco', 'diez', 'veinte', 'veinticinco',
  'cincuenta', 'cien', 'mil', 'un', 'deux', 'trois', 'quatre', 'cinq', 'dix',
  'vingt', 'cinquante', 'cent', 'mille', 'eins', 'zwei', 'drei', 'vier', 'fünf',
  'zehn', 'zwanzig', 'fünfzig', 'hundert', 'tausend',
]);

const UNSUPPORTED_MESSAGE =
  'This desk supports one immediate buy or sell instruction. Conditional orders, multiple legs, leveraged or short requests, and instructions it cannot read clearly are refused — rephrase as a single buy or sell.';
const MULTI_AMOUNT_MESSAGE =
  'Several amounts were heard and the desk cannot tell which one stands. Rephrase with a single amount, e.g. “make that 50”.';
const NEGATIVE_MESSAGE =
  'Amounts must be positive numbers. Rephrase with a single positive amount.';

export interface InstructionCorrection {
  whole: string;
  index: number;
  oldAmount: string | null;
  replacement: string;
  replacementIndex: number;
  negative: boolean;
  unitWord: string | null;
}

function amountTokenAt(text: string, from: number): { digits: string; index: number; negative: boolean; unitWord: string | null; end: number } | null {
  const match = /^([-−])?\s*[\$¥€£]?\s*(\d+(?:\.\d+)?)\s*(dollars?|bucks|usdc|tokens?|shares?|units?|scaled)?\b/i.exec(text.slice(from));
  if (!match) return null;
  return {
    negative: Boolean(match[1]),
    digits: match[2],
    index: from + match[0].indexOf(match[2]),
    unitWord: match[3] ?? null,
    end: from + match[0].trimEnd().length,
  };
}

export function instructionCorrection(text: string): InstructionCorrection | null {
  const negation = NEGATION_PREFIX_RE.exec(text);
  if (negation && negation.index !== undefined) {
    const amount = amountTokenAt(text, negation.index + negation[0].length);
    if (amount) {
      return {
        whole: text.slice(negation.index, amount.end),
        index: negation.index,
        oldAmount: negation[1],
        replacement: amount.digits,
        replacementIndex: amount.index,
        negative: amount.negative,
        unitWord: amount.unitWord,
      };
    }
  }
  CORRECTION_PHRASE_RE.lastIndex = 0;
  for (const match of text.matchAll(CORRECTION_PHRASE_RE)) {
    const amount = amountTokenAt(text, match.index + match[0].length);
    if (amount) {
      return {
        whole: text.slice(match.index, amount.end),
        index: match.index,
        oldAmount: null,
        replacement: amount.digits,
        replacementIndex: amount.index,
        negative: amount.negative,
        unitWord: amount.unitWord,
      };
    }
  }
  return null;
}

function productWords(text: string): string[] {
  return (text.match(/[a-zA-Z]{2,12}/g) ?? []).filter(word => !NON_PRODUCT_WORDS.has(word.toLowerCase()));
}

function hasSideVerb(text: string): boolean {
  SIDE_RE.lastIndex = 0;
  return SIDE_RE.test(text);
}

function correctionAmountMalformed(t: string): boolean {
  NEGATION_PREFIX_RE.lastIndex = 0;
  const neg = NEGATION_PREFIX_RE.exec(t);
  if (neg && neg.index !== undefined) {
    const tok = amountTokenAt(t, neg.index + neg[0].length);
    if (!tok || /[.,a-zA-Z]/.test(t[tok.end] ?? '') || /[.,]/.test(t[tok.index - 1] ?? '')) return true;
  }
  CORRECTION_PHRASE_RE.lastIndex = 0;
  for (const m of t.matchAll(CORRECTION_PHRASE_RE)) {
    const tail = t.slice(m.index + m[0].length);
    const tok = amountTokenAt(tail, 0);
    if (!tok) {
      if (/^\s*(?:[-−]\s*)?[\$¥€£]?\s*(?:\.\d|\d+\s*[a-zA-Z]|\d+[.,]\d)/.test(tail)) return true;
      continue;
    }
    const absStart = m.index + m[0].length + tok.index;
    const absEnd = m.index + m[0].length + tok.end;
    if (/[.,]/.test(t[absStart - 1] ?? '') || /[.,a-zA-Z]/.test(t[absEnd] ?? '')) return true;
  }
  return false;
}

export function instructionIssue(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const correction = instructionCorrection(t);
  if (correctionAmountMalformed(t)) return MULTI_AMOUNT_MESSAGE;
  const attempt = TRADE_ATTEMPT_RE.test(t) || correction !== null;
  if (!attempt) return null;

  if (correction?.negative || parseFloat(correction?.replacement ?? '1') <= 0) return NEGATIVE_MESSAGE;
  if (!correction && NEGATIVE_AMOUNT_RE.test(t)) return NEGATIVE_MESSAGE;

  const sides = t.match(SIDE_RE) ?? [];
  if (sides.length > 1) return UNSUPPORTED_MESSAGE;

  const parts = t.split(CONNECTOR_RE);
  if (parts.length > 1) {
    const firstHasProduct = productWords(parts[0]).length > 0;
    for (const part of parts.slice(1)) {
      if (hasSideVerb(part)) return UNSUPPORTED_MESSAGE;
      if (firstHasProduct && productWords(part).length > 0) return UNSUPPORTED_MESSAGE;
    }
  }

  if (LEVERAGE_RE.test(t)) return UNSUPPORTED_MESSAGE;
  if (CONDITIONAL_RE.test(t) || ORDER_TYPE_RE.test(t)) return UNSUPPORTED_MESSAGE;

  if (correction) {
    const numbers = t.match(DIGITS_RE) ?? [];
    if (numbers.length > (correction.oldAmount ? 2 : 1)) return MULTI_AMOUNT_MESSAGE;
    return null;
  }

  const amounts = t.match(NUMBER_RE) ?? [];
  const distinct = new Set(amounts.map(a => a.trim().replace(/[\$¥€£\s]/g, '').replace(/(dollars?|bucks|usdc|tokens?|shares|units)$/i, '')));
  if (distinct.size > 1 && !CORRECTION_PRESENT_RE.test(t)) return MULTI_AMOUNT_MESSAGE;
  return null;
}
