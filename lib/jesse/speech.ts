/**
 * Deterministic Jesse speech grammar — transcript → JesseCommand.
 * No LLM. Unknown tickers never resolve; missing amounts never inherit.
 */
import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import type { JesseCommand, JesseDraft, JesseIntent, SolanaInstrumentId } from '../solana/contracts';
import { isJesseIntent } from '../solana/contracts';

export type JesseSpeechParse = {
  command: JesseCommand | null;
  confidence: 'full' | 'partial' | 'none';
  heard: string;
};

const ALIASES: Record<string, SolanaInstrumentId> = (() => {
  const map: Record<string, SolanaInstrumentId> = {};
  for (const instrument of SOLANA_INSTRUMENTS) {
    map[instrument.symbol.toLowerCase()] = instrument.id;
    map[instrument.underlyingSymbol.toLowerCase()] = instrument.id;
    map[instrument.name.toLowerCase()] = instrument.id;
  }
  map.apple = map.aapl;
  map.aaplx = map.aapl;
  map['apple xstock'] = map.aapl;
  map.nvidia = map.nvda;
  map.nvdax = map.nvda;
  map.tesla = map.tsla;
  map.tslax = map.tsla;
  return map;
})();

function resolveInstrument(text: string): SolanaInstrumentId | null {
  const lower = text.toLowerCase();
  const ordered = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of ordered) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      return ALIASES[alias] ?? null;
    }
  }
  return null;
}

function parseAmount(text: string): string | null {
  const dollar = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (dollar) return dollar[1];
  const ofAmount = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:usdc|dollars?|bucks)?\b/i);
  if (ofAmount && !/scaled|unit|share|token/i.test(text.slice(Math.max(0, (ofAmount.index ?? 0) - 12), (ofAmount.index ?? 0)))) {
    return ofAmount[1];
  }
  const bare = text.match(/\b([1-9]\d*(?:\.\d+)?)\b/);
  return bare?.[1] ?? null;
}

function detectSide(text: string): 'buy' | 'sell' | null {
  if (/\bsell\b/i.test(text)) return 'sell';
  if (/\bbuy\b|\bpurchase\b|\bget\b/i.test(text)) return 'buy';
  return null;
}

/**
 * Parse a finalized transcript into a Jesse command.
 * Pass `currentDraft` so corrections can reuse the active instrument only
 * when the phrase clearly refers to it.
 */
export function parseJesseSpeech(transcript: string, currentDraft: JesseDraft | null = null): JesseSpeechParse {
  const heard = transcript.trim().replace(/\s+/g, ' ');
  if (!heard) return { command: null, confidence: 'none', heard };

  const lower = heard.toLowerCase();

  if (/\b(file|keep|save)\b.*\b(paper|record|this)\b|\bfile this paper record\b/.test(lower)) {
    return {
      command: { type: 'file-paper', quoteId: '' }, // caller must bind quoteId
      confidence: 'full',
      heard,
    };
  }
  if (/\bcancel\b|\bset aside\b|\bnever ?mind\b|\bforget it\b/.test(lower)) {
    return { command: { type: 'cancel' }, confidence: 'full', heard };
  }
  if (/\bwhat'?s on the desk\b|\bdescribe\b.*\bdesk\b|\bwhere are we\b/.test(lower)) {
    return { command: { type: 'describe' }, confidence: 'full', heard };
  }
  if (/\bexplain\b.*\b(reference|difference|bps)\b/.test(lower)) {
    return { command: { type: 'explain', topic: 'reference-difference' }, confidence: 'full', heard };
  }
  if (/\bexplain\b.*\b(hour|session|market)\b/.test(lower)) {
    return { command: { type: 'explain', topic: 'market-hours' }, confidence: 'full', heard };
  }
  if (/\bexplain\b.*\b(scal|unit|multiplier)\b/.test(lower)) {
    return { command: { type: 'explain', topic: 'scaled-units' }, confidence: 'full', heard };
  }
  if (/\bexplain\b.*\bpaper\b/.test(lower)) {
    return { command: { type: 'explain', topic: 'paper-mode' }, confidence: 'full', heard };
  }

  const instrumentId = resolveInstrument(heard);
  if (/\bcompare\b|\bwhat'?s the (tape|difference|spread)\b/.test(lower)) {
    if (!instrumentId) {
      return {
        command: {
          type: 'clarify',
          draft: currentDraft ?? { instrumentId: null, side: null, unit: null, amount: null },
          field: 'instrument',
          question: 'Which xStock should I compare?',
        },
        confidence: 'partial',
        heard,
      };
    }
    return { command: { type: 'compare', instrumentId }, confidence: 'full', heard };
  }

  if (/\bwatch\b|\bpin\b/.test(lower) && instrumentId) {
    return { command: { type: 'watch', instrumentId }, confidence: 'full', heard };
  }

  const amount = parseAmount(heard);
  const side = detectSide(heard)
    ?? (/\b(make that|change (it|that) to|actually)\b/i.test(heard) && amount ? 'buy' : null);
  const reuseInstrument = instrumentId
    ?? (/\b(that|it|this|make that|change (it|that) to)\b/i.test(heard) ? currentDraft?.instrumentId ?? null : null);

  if (side && amount && reuseInstrument) {
    const intent: JesseIntent = side === 'buy'
      ? { instrumentId: reuseInstrument, side: 'buy', unit: 'USDC', amount }
      : { instrumentId: reuseInstrument, side: 'sell', unit: 'scaled-token', amount };
    if (!isJesseIntent(intent)) {
      return { command: null, confidence: 'none', heard };
    }
    return {
      command: { type: 'draft', intent, quote: true },
      confidence: 'full',
      heard,
    };
  }

  if (instrumentId || side || amount) {
    const draft: JesseDraft = {
      instrumentId: reuseInstrument,
      side,
      unit: side === 'buy' ? 'USDC' : side === 'sell' ? 'scaled-token' : null,
      amount,
    };
    const field = !reuseInstrument ? 'instrument' : !side ? 'side' : 'amount';
    const question = !reuseInstrument
      ? 'Which xStock did you mean?'
      : !side
        ? 'Buy or sell?'
        : 'How much? Buy spends USDC; sell uses scaled units.';
    return {
      command: { type: 'clarify', draft, field, question },
      confidence: 'partial',
      heard,
    };
  }

  return { command: null, confidence: 'none', heard };
}

/**
 * Transcript → bound command: parse the phrase, then attach file-paper to the
 * quote under review. The one path spoken and typed input share.
 */
export function parseJesseUtterance(
  transcript: string,
  currentDraft: JesseDraft | null,
  quoteId: string | null,
): JesseSpeechParse {
  return bindFilePaperCommand(parseJesseSpeech(transcript, currentDraft), quoteId);
}

/** Bind a file-paper parse to the quote currently under review. */
export function bindFilePaperCommand(
  parse: JesseSpeechParse,
  quoteId: string | null,
): JesseSpeechParse {
  if (parse.command?.type !== 'file-paper') return parse;
  if (!quoteId) {
    return {
      ...parse,
      command: {
        type: 'clarify',
        draft: { instrumentId: null, side: null, unit: null, amount: null },
        field: 'amount',
        question: 'There is no estimate under review to file.',
      },
      confidence: 'partial',
    };
  }
  return { ...parse, command: { type: 'file-paper', quoteId } };
}
