import { DESK_INSTRUMENTS, resolveDeskAlias } from './catalog';
import { ARCHIVE_READONLY, RECORD_UNAVAILABLE } from './desk-documents';
import { estimateUsable } from './workflow';
import { deskNoteOfTheDay } from '../desk-notes';
import type { HouseDeskId } from '../house';
import type { DeskState } from './workflow';
import type { PaperRecord } from './paper-records';
import type { ForegroundDocument } from './desk-documents';
import type { useTradingDesk } from './useTradingDesk';

/**
 * Pure decision layer behind Hetty's client tools. Every voice tool resolves
 * the same foreground document before it acts; these helpers hold that policy
 * in one tested place so a future tool cannot forget the guard.
 */

export type Desk = ReturnType<typeof useTradingDesk>;

export { RECORD_UNAVAILABLE as RECORD_UNAVAILABLE_MESSAGE } from './desk-documents';

/** Reason a voice tool must refuse, or null when the foreground document permits action. */
export function foregroundGuard(foreground: ForegroundDocument): string | null {
  if (foreground.kind === 'missing') return RECORD_UNAVAILABLE;
  if (foreground.kind === 'archive') return ARCHIVE_READONLY;
  return null;
}

export function chooseInstrumentResult(query: string): string {
  const instrument = resolveDeskAlias(query);
  if (!instrument) {
    const supported = DESK_INSTRUMENTS.filter(stock => stock.quoteSupported).map(stock => stock.symbol).join(', ');
    return `"${query || 'That'}" is not on this desk. Supported: ${supported} — Coinbase-issued tokens on Base.`;
  }
  return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
}

export function setInstructionResult(side: string): string {
  if (side === 'buy') return 'Buy set — the amount is a USDC spend.';
  if (side === 'sell') return 'Sell set — the amount is a token quantity.';
  return 'The instruction must be buy or sell.';
}

export function setAmountResult(side: 'buy' | 'sell', amount: string): string {
  return `${amount} ${side === 'sell' ? 'tokens' : 'USDC'} is on the ticket.`;
}

/** Spoken confirmation after a successful estimate, with the live review window. */
export function estimateSpokenResult(quote: { inputAmount: string; inputSymbol: string; outputAmount: string; outputSymbol: string; expiresAt: number }, now: number): string {
  const window_ = Math.max(0, Math.ceil((quote.expiresAt - now) / 1000));
  return `Estimate on the slip: the caller would spend ${quote.inputAmount} ${quote.inputSymbol} and receive ${quote.outputAmount} ${quote.outputSymbol}, via Aerodrome on Base. ${window_} seconds to review before it expires. It is a paper estimate — not an offer.`;
}

/** Voice recording policy for the current foreground. Returns the refusal line, or null when `save` may run. */
export function recordPaperGuard(state: DeskState, foreground: ForegroundDocument, historyReady: boolean, now: number): string | null {
  const foregroundRefusal = foregroundGuard(foreground);
  if (foregroundRefusal) return foregroundRefusal;
  if (foreground.kind === 'receipt') return 'That instruction is already filed.';
  if (!canFile(state, foreground) || !state.quote) return 'There is no estimate under review. Request one first.';
  if (!estimateUsable(state.quote, now)) return 'That estimate has expired — request a fresh one before recording.';
  if (!historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
  return null;
}

function canFile(state: DeskState, foreground: ForegroundDocument): boolean {
  return foreground.kind === 'quotation' && foreground.quoteId === state.quote?.id && state.stage === 'review';
}

/** Watch resolution: an explicit query wins; otherwise the foreground instrument. */
export function watchTarget(foreground: ForegroundDocument, query: string): string | null {
  const instrument = query
    ? resolveDeskAlias(query)
    : DESK_INSTRUMENTS.find(s => s.id === foreground.instrumentId);
  return instrument?.id ?? null;
}

export function deskSymbol(instrumentId: string | null): string {
  return DESK_INSTRUMENTS.find(item => item.id === instrumentId)?.symbol ?? 'this mark';
}

/** One spoken description of the desk for the voice channel. */
export function describeDesk(state: DeskState, foreground: ForegroundDocument, records: PaperRecord[], watched: string[]): string {
  const parts = [speakForegroundLine(state, foreground, records)];
  if (records.length) parts.push(`${records.length} paper record${records.length === 1 ? '' : 's'} in the ledger.`);
  if (watched.length) parts.push(`${watched.length} watched mark${watched.length === 1 ? '' : 's'} in the tray.`);
  return parts.join(' ');
}

export const DESK_NOTE_ALREADY_SHARED = 'The desk note is already on the line this call.';

/**
 * The note of the day, as Hetty speaks it. The note is furniture, not
 * document state — it may be spoken on any foreground, including a
 * read-only filed record. It never becomes advice and is never invented:
 * the line is exactly the desk note plus its attribution.
 */
export function deskNoteSpokenLine(deskId: HouseDeskId, date = new Date()): string {
  const note = deskNoteOfTheDay(deskId, date);
  const source = note.attribution ? ` — ${note.attribution}` : '';
  return `The desk's note for today: ${note.text}${source}. An observation from the house, not advice.`;
}

function speakForegroundLine(state: DeskState, foreground: ForegroundDocument, records: PaperRecord[]): string {
  if (foreground.kind === 'missing') return RECORD_UNAVAILABLE;
  if (foreground.kind === 'archive') {
    const record = records.find(item => item.id === foreground.recordId);
    if (!record) return RECORD_UNAVAILABLE;
    const quote = record.quote;
    return `The ticket is showing a filed paper record, read-only: ${quote.intent.side} ${quote.inputAmount} ${quote.inputSymbol} for ${quote.outputAmount} ${quote.outputSymbol}. It is not the live instruction. Return to the instruction to quote or record.`;
  }
  return speakDeskDocument(state, foreground);
}

function speakDeskDocument(state: DeskState, foreground: ForegroundDocument): string {
  if (foreground.kind === 'receipt' && state.quote) {
    const quote = state.quote;
    return `The current instruction is filed: ${quote.intent.side} ${quote.inputAmount} ${quote.inputSymbol} for ${quote.outputAmount} ${quote.outputSymbol}.`;
  }
  const draft = state.draft;
  const parts: string[] = [];
  parts.push(draft.instrumentId ? `Instrument: ${DESK_INSTRUMENTS.find(item => item.id === draft.instrumentId)?.symbol ?? 'set'}.` : 'No instrument chosen.');
  parts.push(draft.amount ? `${draft.side} ${draft.amount} ${draft.unit}.` : 'No amount set.');
  if (foreground.kind === 'quotation' && state.quote) {
    const quote = state.quote;
    parts.push(`Estimate under review: spend ${quote.inputAmount} ${quote.inputSymbol}, receive ${quote.outputAmount} ${quote.outputSymbol}.`);
  }
  if (state.stage === 'cancelled') parts.push('The client decided not to record. Nothing was filed.');
  if (foreground.kind === 'pending') parts.push('A venue estimate is on its way.');
  return parts.join(' ');
}
