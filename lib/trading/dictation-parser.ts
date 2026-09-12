import { DESK_INSTRUMENTS } from './catalog';
import type { TradeIntent } from './domain';

export interface DictatedIntentResult {
  intent: Partial<TradeIntent>;
  matchedInstrument?: (typeof DESK_INSTRUMENTS)[number];
  confidence: 'full' | 'partial' | 'none';
  explanation: string;
}

const NUMBER_WORDS: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
  'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  'hundred': 100, 'thousand': 1000, 'grand': 1000,
};

function parseWordNumber(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes('half a grand') || lower.includes('half a thousand')) return 500;
  if (lower.includes('a grand') || lower.includes('a thousand')) return 1000;

  const tokens = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|grand)\b/g);
  if (!tokens || tokens.length === 0) return null;

  let total = 0;
  let current = 0;

  for (const token of tokens) {
    const val = NUMBER_WORDS[token];
    if (val === 1000) {
      current = (current === 0 ? 1 : current) * 1000;
      total += current;
      current = 0;
    } else if (val === 100) {
      current = (current === 0 ? 1 : current) * 100;
    } else {
      current += val;
    }
  }

  return total + current;
}

/**
 * Normalizes speech input and extracts structured trade intent.
 * AssemblyAI Dictation provides clean transcripts with filler words (ums/ahs)
 * already stripped. This parser matches stock symbols, company names,
 * action sides (buy/sell), and numeric / spoken amount quantities.
 */
export function parseDictatedTradeIntent(rawTranscript: string): DictatedIntentResult {
  const text = rawTranscript.trim();
  if (!text) {
    return {
      intent: {},
      confidence: 'none',
      explanation: 'No speech detected.',
    };
  }

  const lower = text.toLowerCase();

  // 1. Detect side
  let side: 'buy' | 'sell' | undefined;
  if (/\b(buy|purchase|acquire|get|grab|pick up|long|bid|invest in)\b/i.test(lower)) {
    side = 'buy';
  } else if (/\b(sell|dump|short|liquidate|dispose|unload|sell off)\b/i.test(lower)) {
    side = 'sell';
  }

  // 2. Detect instrument
  let matchedInstrument = DESK_INSTRUMENTS.find(inst => {
    const symbolClean = inst.symbol.toLowerCase().replace(/c$/, '');
    const symbolRegex = new RegExp(`\\b(${inst.symbol.toLowerCase()}|${symbolClean})\\b`, 'i');
    const nameRegex = new RegExp(`\\b${inst.name.toLowerCase()}\\b`, 'i');
    return symbolRegex.test(lower) || nameRegex.test(lower);
  });

  if (!matchedInstrument) {
    // Check known common aliases
    const aliases: Record<string, string> = {
      nvidia: 'NVDAc',
      apple: 'AAPLc',
      tesla: 'TSLAc',
      google: 'GOOGLc',
      alphabet: 'GOOGLc',
      meta: 'METAc',
      facebook: 'METAc',
      coinbase: 'COINc',
      microsoft: 'MSFTc',
      amazon: 'AMZNc',
      microstrategy: 'MSTRc',
    };

    for (const [alias, targetSymbol] of Object.entries(aliases)) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(lower)) {
        matchedInstrument = DESK_INSTRUMENTS.find(s => s.symbol.toLowerCase() === targetSymbol.toLowerCase());
        if (matchedInstrument) break;
      }
    }
  }

  // 3. Detect amount
  let amount: string | undefined;

  // Spoken number words check (e.g., "twenty five dollars", "one hundred usdc", "half a grand")
  const spokenNum = parseWordNumber(lower);
  if (spokenNum !== null && spokenNum > 0) {
    amount = String(spokenNum);
  }

  // Numeric overrides / checks (e.g. "$100", "2k", "25.5")
  const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1]) * 1000;
    amount = String(num);
  } else {
    const dollarMatch = lower.match(/\$\s*(\d+(?:\.\d+)?)/i);
    const wordsMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:dollars|bucks|usdc|tokens|shares)?/i);
    if (dollarMatch) {
      amount = dollarMatch[1];
    } else if (wordsMatch && wordsMatch[1] && (!amount || wordsMatch[1].length > 0)) {
      amount = wordsMatch[1];
    }
  }

  const unit = side === 'sell' ? 'token' : 'USDC';

  const intent: Partial<TradeIntent> = {};
  if (side) intent.side = side;
  if (matchedInstrument) intent.instrumentId = matchedInstrument.id;
  if (amount) intent.amount = amount;
  if (side) intent.unit = unit;

  const isFull = Boolean(intent.side && intent.instrumentId && intent.amount);
  const isPartial = Boolean(intent.side || intent.instrumentId || intent.amount);

  let explanation = '';
  if (isFull && matchedInstrument) {
    explanation = `${intent.side === 'buy' ? 'Buy' : 'Sell'} ${intent.amount} ${intent.unit} of ${matchedInstrument.symbol}`;
  } else if (isPartial) {
    const parts: string[] = [];
    if (intent.side) parts.push(`action: ${intent.side}`);
    if (matchedInstrument) parts.push(`stock: ${matchedInstrument.symbol}`);
    if (intent.amount) parts.push(`amount: ${intent.amount}`);
    explanation = `Partially recognized (${parts.join(', ')})`;
  } else {
    explanation = 'Could not parse trade instruction.';
  }

  return {
    intent,
    matchedInstrument,
    confidence: isFull ? 'full' : isPartial ? 'partial' : 'none',
    explanation,
  };
}

