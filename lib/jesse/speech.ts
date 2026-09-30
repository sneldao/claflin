/**
 * Deterministic Jesse speech grammar — transcript → JesseCommand.
 * No LLM. Unknown tickers never resolve; missing amounts never inherit.
 */
import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import type { JesseCommand, JesseDraft, JesseIntent, SolanaInstrumentId } from '../solana/contracts';
import { isJesseIntent } from '../solana/contracts';
import { instructionCorrection, instructionIssue } from '../trading/instruction-safety';

export type JesseSpeechParse = {
  command: JesseCommand | null;
  confidence: 'full' | 'partial' | 'none';
  heard: string;
  issue?: string;
  /** Literal matched substrings of `heard` (original casing) that set each
   *  draft field — set only on draft/clarify parses. */
  spans?: { instrument?: string; side?: string; amount?: string };
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

function matchInstrument(text: string): { id: SolanaInstrumentId; matched: string } | null {
  const ordered = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of ordered) {
    const match = text.match(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    if (match) return { id: ALIASES[alias]!, matched: match[0] };
  }
  return null;
}

function resolveInstrument(text: string): SolanaInstrumentId | null {
  return matchInstrument(text)?.id ?? null;
}

function parseAmount(text: string): { value: string; span: string } | null {
  const dollar = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (dollar) return { value: dollar[1], span: dollar[0].trim() };
  const ofAmount = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:usdc|dollars?|bucks)?\b/i);
  if (ofAmount && !/scaled|unit|share|token/i.test(text.slice(Math.max(0, (ofAmount.index ?? 0) - 12), (ofAmount.index ?? 0)))) {
    return { value: ofAmount[1], span: ofAmount[0].trim() };
  }
  const bare = text.match(/\b([1-9]\d*(?:\.\d+)?)\b/);
  return bare ? { value: bare[1], span: bare[0] } : null;
}

function detectSide(text: string): { side: 'buy' | 'sell'; span: string } | null {
  const sell = text.match(/\bsell\b/i);
  if (sell) return { side: 'sell', span: sell[0] };
  const buy = text.match(/\bbuy\b|\bpurchase\b|\bget\b/i);
  if (buy) return { side: 'buy', span: buy[0] };
  return null;
}

const INSTRUMENT_SKIP_WORDS = new Set([
  'usdc', 'usd', 'dollar', 'dollars', 'bucks', 'token', 'tokens', 'scaled', 'unit', 'units',
  'share', 'shares', 'solana', 'jupiter', 'some', 'the', 'a', 'an', 'it', 'that', 'this',
  'more', 'less', 'worth', 'each', 'now', 'please', 'again', 'desk', 'xstock', 'xstocks',
]);

function unknownInstrumentMention(text: string): string | null {
  const patterns = [
    /\b(?:of|in|into|on)\s+([a-zA-Z][a-zA-Z0-9]{1,11})\b/g,
    /\b(?:buy|sell|purchase|get)\s+(?:\$?\s*\d+(?:\.\d+)?\s*(?:usdc|dollars?|bucks|scaled|units?|tokens?)?\s*(?:of|in|into|on)?\s+)?([a-zA-Z][a-zA-Z0-9]{1,11})\b/gi,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const word = match[1];
      if (INSTRUMENT_SKIP_WORDS.has(word.toLowerCase())) continue;
      if (ALIASES[word.toLowerCase()]) continue;
      return word;
    }
  }
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

  const instrumentMatch = matchInstrument(heard);
  const instrumentId = instrumentMatch?.id ?? null;
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

  const safetyIssue = instructionIssue(heard);
  if (safetyIssue) {
    return { command: null, confidence: 'none', heard, issue: safetyIssue };
  }

  const correction = instructionCorrection(heard);
  if (correction) {
    const replacement = correction.replacement;
    const amountSpan = heard.slice(correction.replacementIndex, correction.replacementIndex + replacement.length);
    const sideMatch = detectSide(heard);
    const side = sideMatch?.side ?? currentDraft?.side ?? null;
    let unknownMention = unknownInstrumentMention(heard);
    if (!unknownMention) {
      const tail = heard.slice(correction.replacementIndex + replacement.length)
        .replace(/^\s*(?:usdc|usd|dollars?|bucks?|tokens?|shares?|units?|scaled)\b/i, '');
      const tailWord = /^\s*(?:of\s+|in\s+|into\s+|on\s+)?([a-zA-Z][a-zA-Z0-9]{1,11})\b/.exec(tail)?.[1];
      if (tailWord && !INSTRUMENT_SKIP_WORDS.has(tailWord.toLowerCase()) && !ALIASES[tailWord.toLowerCase()] && !matchInstrument(tailWord)) {
        unknownMention = tailWord;
      }
    }
    const reuseInstrument = instrumentId ?? (unknownMention ? null : currentDraft?.instrumentId ?? null);
    const draft: JesseDraft = {
      instrumentId: reuseInstrument,
      side,
      unit: side === 'buy' ? 'USDC' : side === 'sell' ? 'scaled-token' : null,
      amount: replacement,
    };
    const unitWord = correction.unitWord?.toLowerCase() ?? null;
    const wantsUsdc = Boolean(unitWord && /^(usdc|dollars?|bucks)$/.test(unitWord));
    const wantsToken = Boolean(unitWord && /^(scaled|units?|tokens?|shares?)$/.test(unitWord));
    if ((side === 'sell' && wantsUsdc) || (side === 'buy' && wantsToken)) {
      return {
        command: null,
        confidence: 'none',
        heard,
        issue: 'USDC buys and scaled-unit sells are different instructions — say which you meant.',
        spans: { amount: amountSpan },
      };
    }
    if (!side) {
      return {
        command: { type: 'clarify', draft, field: 'side', question: 'Buy or sell?' },
        confidence: 'partial',
        heard,
        spans: { amount: amountSpan },
      };
    }
    if (!reuseInstrument) {
      return {
        command: {
          type: 'clarify',
          draft,
          field: 'instrument',
          question: unknownMention
            ? `${unknownMention} is outside Jesse’s verified catalog — the desk covers ${SOLANA_INSTRUMENTS.filter(s => s.quoteSupported).map(s => s.symbol).join(', ')}.`
            : 'Which xStock did you mean?',
        },
        confidence: 'partial',
        heard,
        spans: { amount: amountSpan },
      };
    }
    const intent: JesseIntent = side === 'buy'
      ? { instrumentId: reuseInstrument, side: 'buy', unit: 'USDC', amount: replacement }
      : { instrumentId: reuseInstrument, side: 'sell', unit: 'scaled-token', amount: replacement };
    if (!isJesseIntent(intent)) {
      return { command: null, confidence: 'none', heard };
    }
    return {
      command: { type: 'draft', intent, quote: true },
      confidence: 'full',
      heard,
      spans: { ...(instrumentMatch ? { instrument: instrumentMatch.matched } : {}), ...(sideMatch ? { side: sideMatch.span } : {}), amount: amountSpan },
    };
  }

  const amountMatch = parseAmount(heard);
  const amount = amountMatch?.value ?? null;
  const sideMatch = detectSide(heard);
  const side = sideMatch?.side ?? null;
  const unknownMention = unknownInstrumentMention(heard);
  const reuseInstrument = instrumentId
    ?? (unknownMention ? null
      : /\b(that|it|this|make that|make it|change (it|that) to|actually|i meant)\b/i.test(heard) ? currentDraft?.instrumentId ?? null : null);

  /* Provenance spans: only the literal words that set each field, in the
     speaker's casing. Reused/assumed values get no span so the slip can
     label them kept or inferred instead of pretending they were said. */
  const spans = {
    ...(instrumentMatch ? { instrument: instrumentMatch.matched } : {}),
    ...(sideMatch ? { side: sideMatch.span } : {}),
    ...(amountMatch ? { amount: amountMatch.span } : {}),
  };

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
      spans,
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
      ? unknownMention
        ? `${unknownMention} is outside Jesse’s verified catalog — the desk covers ${SOLANA_INSTRUMENTS.filter(s => s.quoteSupported).map(s => s.symbol).join(', ')}.`
        : 'Which xStock did you mean?'
      : !side
        ? 'Buy or sell?'
        : 'How much? Buy spends USDC; sell uses scaled units.';
    return {
      command: { type: 'clarify', draft, field, question },
      confidence: 'partial',
      heard,
      spans,
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
