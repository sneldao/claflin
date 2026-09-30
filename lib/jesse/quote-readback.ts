'use client';

import { spokenAmount } from '../solana/controller';
import type { QuoteReadback } from '../desk/contracts';

export const QUOTE_READBACK_FALLBACK = 'The estimate is on the slip. Read the written amounts before filing.';
export const QUOTE_READBACK_MAX_WAIT_MS = 10_000;

export type ReadbackOutcome = 'completed' | 'cancelled' | 'stale' | 'expired' | 'unavailable';
export type ReadbackFallbackReason = 'unsupported' | 'invalid';

const DIGIT_WORDS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
};

const SYMBOL_WORDS: Record<string, string> = {
  USDC: 'U S D C',
  AAPLx: 'Apple xStock',
  NVDAx: 'NVIDIA xStock',
  TSLAx: 'Tesla xStock',
};

export function amountToWords(amount: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(amount)) return null;
  return [...amount].map(c => (c === '.' ? 'point' : DIGIT_WORDS[c])).join(' ');
}

export function quoteReadbackUtterance(payload: QuoteReadback): string | null {
  const input = amountToWords(payload.inputAmount);
  const output = amountToWords(spokenAmount(payload.outputAmount));
  const inputSymbol = SYMBOL_WORDS[payload.inputSymbol];
  const outputSymbol = SYMBOL_WORDS[payload.outputSymbol];
  if (!input || !output || !inputSymbol || !outputSymbol) return null;
  return `Spend ${input} ${inputSymbol}, receive approximately ${output} ${outputSymbol}. Jupiter estimate. Paper only.`;
}

export interface SpeechSynthLike {
  speak(utterance: unknown): void;
  cancel(): void;
}

export interface SpeechUtteranceLike {
  text: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function createQuoteReadback(opts: {
  isCurrent: (payload: QuoteReadback) => boolean;
  onStart?: (text: string) => void;
  onFallback?: (reason: ReadbackFallbackReason) => void;
  synth?: SpeechSynthLike;
  utteranceFor?: (text: string) => SpeechUtteranceLike;
  now?: () => number;
  maxWaitMs?: number;
}): {
  speak(payload: QuoteReadback): Promise<ReadbackOutcome>;
  cancel(): void;
  cancelIfStale(): void;
} {
  const now = opts.now ?? (() => Date.now());
  const maxWait = opts.maxWaitMs ?? QUOTE_READBACK_MAX_WAIT_MS;
  let generation = 0;
  let owned = false;
  let activePayload: QuoteReadback | null = null;
  let settle: ((outcome: ReadbackOutcome) => void) | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers = []; };

  const synth = (): SpeechSynthLike | null =>
    opts.synth
    ?? (typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined' ? window.speechSynthesis : null);

  const makeUtterance = (text: string): SpeechUtteranceLike | null => {
    if (opts.utteranceFor) return opts.utteranceFor(text);
    if (typeof SpeechSynthesisUtterance === 'undefined') return null;
    return new SpeechSynthesisUtterance(text) as SpeechUtteranceLike;
  };

  const cancel = () => {
    generation += 1;
    activePayload = null;
    clearTimers();
    const s = settle;
    settle = null;
    if (owned) {
      owned = false;
      synth()?.cancel();
    }
    s?.('cancelled');
  };

  const cancelIfStale = () => {
    if (activePayload && !opts.isCurrent(activePayload)) cancel();
  };

  const speak = (payload: QuoteReadback): Promise<ReadbackOutcome> => {
    cancel();
    const gen = generation;
    const engine = synth();
    if (!engine) { opts.onFallback?.('unsupported'); return Promise.resolve('unavailable'); }
    if (now() >= payload.expiresAt) return Promise.resolve('expired');
    if (!opts.isCurrent(payload)) return Promise.resolve('stale');
    const text = quoteReadbackUtterance(payload);
    const utterance = text ? makeUtterance(text) : null;
    if (!text || !utterance) {
      opts.onFallback?.(text ? 'unsupported' : 'invalid');
      return Promise.resolve('unavailable');
    }
    activePayload = payload;
    return new Promise<ReadbackOutcome>(resolve => {
      const done = (outcome: ReadbackOutcome) => {
        if (gen !== generation || settle === null) return;
        settle = null;
        activePayload = null;
        owned = false;
        clearTimers();
        resolve(outcome);
      };
      settle = resolve;
      owned = true;
      utterance.onstart = () => {
        if (gen !== generation || settle === null) return;
        if (!opts.isCurrent(payload) || now() >= payload.expiresAt) {
          const outcome = now() >= payload.expiresAt ? 'expired' : 'stale';
          done(outcome);
          engine.cancel();
          return;
        }
        opts.onStart?.(text);
      };
      utterance.onend = () => { if (gen === generation) done('completed'); };
      utterance.onerror = () => {
        if (gen !== generation || settle === null) return;
        opts.onFallback?.('unsupported');
        done('unavailable');
      };
      const expiry = Math.max(1, payload.expiresAt - now());
      timers.push(setTimeout(() => {
        if (gen !== generation || settle === null) return;
        done('expired');
        engine.cancel();
      }, expiry));
      timers.push(setTimeout(() => {
        if (gen !== generation || settle === null) return;
        opts.onFallback?.('unsupported');
        done('unavailable');
        engine.cancel();
      }, maxWait));
      try {
        engine.speak(utterance);
      } catch {
        opts.onFallback?.('unsupported');
        done('unavailable');
      }
    });
  };

  return { speak, cancel, cancelIfStale };
}
