import { DESK_INSTRUMENTS } from './catalog';
import type { TradeIntent } from './domain';

export interface DictatedIntentResult {
  intent: Partial<TradeIntent>;
  matchedInstrument?: (typeof DESK_INSTRUMENTS)[number];
  confidence: 'full' | 'partial' | 'none';
  explanation: string;
  detectedLanguage?: string;
  multiLegs?: Array<{ intent: Partial<TradeIntent>; explanation: string }>;
  triggerPrice?: string;
  isWatch?: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  // English
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
  'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  'hundred': 100, 'thousand': 1000, 'grand': 1000,

  // Spanish
  'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'diez': 10, 'veinte': 20, 'veinticinco': 25, 'cincuenta': 50, 'cien': 100, 'mil': 1000,

  // French
  'un': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5,
  'dix': 10, 'vingt': 20, 'cinquante': 50, 'cent': 100, 'mille': 1000,

  // German
  'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5,
  'zehn': 10, 'zwanzig': 20, 'fünfzig': 50, 'hundert': 100, 'tausend': 1000,
};

function parseWordNumber(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes('half a grand') || lower.includes('half a thousand')) return 500;
  if (lower.includes('a grand') || lower.includes('a thousand')) return 1000;

  // CJK numbers (Japanese / Chinese)
  if (/[一二三四五六七八九十百千万]/.test(text)) {
    const cjkMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    if (text.includes('万') || text.includes('萬')) {
      const match = text.match(/([0-9]+|[一二三四五六七八九])\s*[万萬]/);
      if (match) {
        const n = parseInt(match[1], 10) || cjkMap[match[1]] || 1;
        return n * 10000;
      }
    }
    if (text.includes('千')) {
      const match = text.match(/([0-9]+|[一二三四五六七八九])?\s*千/);
      if (match) {
        const n = match[1] ? (parseInt(match[1], 10) || cjkMap[match[1]] || 1) : 1;
        return n * 1000;
      }
    }
    if (text.includes('百')) {
      const match = text.match(/([0-9]+|[一二三四五六七八九])?\s*百/);
      if (match) {
        const n = match[1] ? (parseInt(match[1], 10) || cjkMap[match[1]] || 1) : 1;
        return n * 100;
      }
    }
    if (text.includes('十')) {
      const match = text.match(/([0-9]+|[一二三四五六七八九])?\s*十/);
      if (match) {
        const n = match[1] ? (parseInt(match[1], 10) || cjkMap[match[1]] || 1) : 1;
        return n * 10;
      }
    }
  }

  const tokens = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|grand|uno|dos|tres|cuatro|cinco|diez|veinte|veinticinco|cincuenta|cien|mil|un|deux|trois|quatre|cinq|dix|vingt|cinquante|cent|mille|eins|zwei|drei|vier|fünf|zehn|zwanzig|fünfzig|hundert|tausend)\b/g);
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
 * AssemblyAI Dictation provides clean transcripts across 18 languages
 * with filler words (ums/ahs) already stripped.
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

  // Detect Language Hints
  let detectedLanguage = 'en';
  if (/[ぁ-んァ-ヶ]/.test(text)) detectedLanguage = 'ja';
  else if (/[\u4e00-\u9fa5]/.test(text)) detectedLanguage = 'zh';
  else if (/\b(comprar|vender|compro|vendo|dólares|acciones)\b/i.test(lower)) detectedLanguage = 'es';
  else if (/\b(acheter|vendre|achète|vends|euros|actions)\b/i.test(lower)) detectedLanguage = 'fr';
  else if (/\b(kaufen|verkaufen|kaufe|verkaufe|aktien)\b/i.test(lower)) detectedLanguage = 'de';

  // Check for multi-leg instructions ("and", "then", "y", "et", "und", "そして", "然后")
  const splitMatch = text.match(/\b(?:and then|and|then|y luego|y|et ensuite|et|und dann|und|そして|然后)\b/i);
  if (splitMatch && splitMatch.index !== undefined) {
    const firstHalf = text.slice(0, splitMatch.index).trim();
    const secondHalf = text.slice(splitMatch.index + splitMatch[0].length).trim();
    if (firstHalf && secondHalf && (/\b(buy|sell|comprar|vender|acheter|vendre|kaufen|verkaufen|買う|売る|买|卖)\b/i.test(secondHalf))) {
      const leg1 = parseDictatedTradeIntent(firstHalf);
      const leg2 = parseDictatedTradeIntent(secondHalf);
      return {
        ...leg1,
        explanation: `${leg1.explanation}; then ${leg2.explanation}`,
        multiLegs: [
          { intent: leg1.intent, explanation: leg1.explanation },
          { intent: leg2.intent, explanation: leg2.explanation },
        ],
      };
    }
  }

  // Check for trigger prices ("if price reaches $160", "at $160", "touching $160", "limit $160")
  let triggerPrice: string | undefined;
  let textForAmount = text;
  const triggerMatch = lower.match(/\b(?:if\s+(?:price\s+)?(?:reaches|touches|hits)|when\s+(?:price\s+)?(?:reaches|touches|hits)|reaches|touches|limit)\s*[\$¥€£]?\s*(\d+(?:\.\d+)?)/i);
  if (triggerMatch && triggerMatch[1] && triggerMatch.index !== undefined) {
    triggerPrice = triggerMatch[1];
    textForAmount = text.slice(0, triggerMatch.index).trim();
  } else {
    const atMatch = lower.match(/\bat\s*[\$¥€£]\s*(\d+(?:\.\d+)?)/i);
    if (atMatch && atMatch[1] && atMatch.index !== undefined) {
      triggerPrice = atMatch[1];
      textForAmount = text.slice(0, atMatch.index).trim();
    }
  }

  // Check for watch/pin instructions ("watch TSLA", "pin apple", "keep an eye on nvda")
  const isWatch = /\b(watch|pin|track|monitor|observar|suivre|beobachten|監視|关注)\b/i.test(lower);

  // 1. Detect side across multiple languages (EN, ES, FR, DE, JA, ZH)
  let side: 'buy' | 'sell' | undefined;
  if (
    /\b(buy|purchase|acquire|get|grab|pick up|long|bid|invest in)\b/i.test(lower) ||
    /\b(comprar|compro|adquirir)\b/i.test(lower) || // Spanish
    /\b(acheter|achète|acquérir)\b/i.test(lower) || // French
    /\b(kaufen|kaufe|erwerben)\b/i.test(lower) ||   // German
    /(買う|買います|購入|買い)/.test(text) ||          // Japanese
    /(买|购买|买入|做多)/.test(text)                 // Chinese
  ) {
    side = 'buy';
  } else if (
    /\b(sell|dump|short|liquidate|dispose|unload|sell off)\b/i.test(lower) ||
    /\b(vender|vendo|liquidar)\b/i.test(lower) ||    // Spanish
    /\b(vendre|vends|liquider)\b/i.test(lower) ||    // French
    /\b(verkaufen|verkaufe|abstoßen)\b/i.test(lower) || // German
    /(売る|売ります|売却|売り)/.test(text) ||          // Japanese
    /(卖|卖出|减持|做空)/.test(text)                 // Chinese
  ) {
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
    // Check known common aliases (including localized names)
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
      // Multilingual company names
      'アップル': 'AAPLc',
      'テスラ': 'TSLAc',
      'エヌビディア': 'NVDAc',
      'グーグル': 'GOOGLc',
      '苹果': 'AAPLc',
      '特斯拉': 'TSLAc',
      '英伟达': 'NVDAc',
      '谷歌': 'GOOGLc',
    };

    for (const [alias, targetSymbol] of Object.entries(aliases)) {
      if (text.toLowerCase().includes(alias.toLowerCase())) {
        matchedInstrument = DESK_INSTRUMENTS.find(s => s.symbol.toLowerCase() === targetSymbol.toLowerCase());
        if (matchedInstrument) break;
      }
    }
  }

  // 3. Detect amount
  let amount: string | undefined;

  // Spoken number words check
  const spokenNum = parseWordNumber(textForAmount);
  if (spokenNum !== null && spokenNum > 0) {
    amount = String(spokenNum);
  }

  // Numeric overrides / checks (e.g. "$100", "2k", "25.5")
  const kMatch = textForAmount.toLowerCase().match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1]) * 1000;
    amount = String(num);
  } else {
    const dollarMatch = textForAmount.match(/[\$¥€£]\s*(\d+(?:\.\d+)?)/i);
    const wordsMatch = textForAmount.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(?:dollars|bucks|usdc|tokens|shares|dólares|euros|acciones|acties|aktien|株|美元)?/i);
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
  if (isWatch && matchedInstrument) {
    explanation = `Watch ${matchedInstrument.symbol}${triggerPrice ? ` at $${triggerPrice}` : ''}`;
  } else if (isFull && matchedInstrument) {
    explanation = `${intent.side === 'buy' ? 'Buy' : 'Sell'} ${intent.amount} ${intent.unit} of ${matchedInstrument.symbol}${triggerPrice ? ` if price touches $${triggerPrice}` : ''}`;
  } else if (isPartial) {
    const parts: string[] = [];
    if (intent.side) parts.push(`action: ${intent.side}`);
    if (matchedInstrument) parts.push(`stock: ${matchedInstrument.symbol}`);
    if (intent.amount) parts.push(`amount: ${intent.amount}`);
    if (triggerPrice) parts.push(`trigger: $${triggerPrice}`);
    explanation = `Partially recognized (${parts.join(', ')})`;
  } else {
    explanation = 'Could not parse trade instruction.';
  }

  return {
    intent,
    matchedInstrument,
    confidence: isFull || (isWatch && Boolean(matchedInstrument)) ? 'full' : isPartial ? 'partial' : 'none',
    explanation,
    detectedLanguage,
    triggerPrice,
    isWatch,
  };
}


