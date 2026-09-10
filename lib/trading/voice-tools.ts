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
export function estimateSpokenResult(quote: { inputAmount: string; inputSymbol: string; outputAmount: string; outputSymbol: string; expiresAt: number }, now: number, live = false): string {
  const window_ = Math.max(0, Math.ceil((quote.expiresAt - now) / 1000));
  const terms = live
    ? 'This desk is live: the caller may execute it on Base from the slip, or record it as a paper trade. An estimate, not an offer.'
    : 'It is a paper estimate — not an offer.';
  return `Estimate on the slip: the caller would spend ${quote.inputAmount} ${quote.inputSymbol} and receive ${quote.outputAmount} ${quote.outputSymbol}, via Aerodrome on Base. ${window_} seconds to review before it expires. ${terms}`;
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
  if (note.term) return `The desk's word for today: ${note.text} A term of the trade from the house, not advice.`;
  return `The desk's note for today: ${note.text}${source}. An observation from the house, not advice.`;
}

function speakForegroundLine(state: DeskState, foreground: ForegroundDocument, records: PaperRecord[]): string {  if (foreground.kind === 'missing') return RECORD_UNAVAILABLE;
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

/**
 * Context-aware opening: recognition before interrogation. The line arrives
 * already aware of the foreground document — never a generic "what do you
 * want to trade" when a draft, quotation or filed record is on the desk.
 * No invented familiarity; only what the desk actually holds.
 */
function shortCompany(name: string): string {
  const head = name.split(',')[0].trim();
  return head.replace(/\s+(Inc\.?|Corporation|Incorporated|Company|Global|Group|Internet).*$/i, '').trim() || head;
}

export function hettyOpeningLine(state: DeskState, foreground: ForegroundDocument): string {
  if (foreground.kind === 'missing') {
    return 'Claflin, Hetty speaking. That record is no longer here. Shall we return to the instruction?';
  }
  if (foreground.kind === 'archive' || foreground.kind === 'receipt') {
    return 'Claflin, Hetty speaking. You are looking at a filed paper record. Shall we go through it?';
  }
  if (foreground.kind === 'pending') {
    return 'Claflin, Hetty speaking. An estimate is on its way. Shall we wait for it together?';
  }
  if (foreground.kind === 'quotation') {
    return 'Claflin, Hetty speaking. Your quotation is on the slip. What would you like to clarify?';
  }
  const draft = state.draft;
  const instrument = draft.instrumentId
    ? DESK_INSTRUMENTS.find(item => item.id === draft.instrumentId)
    : undefined;
  const company = instrument ? shortCompany(instrument.name) : null;
  const article = company && /^[aeiou]/i.test(company) ? 'an' : 'a';
  if (instrument && draft.amount) {
    return `Claflin, Hetty speaking. You have ${article} ${company} instruction here — ${draft.side} ${draft.amount} ${draft.unit}. Shall we check the estimate?`;
  }
  if (instrument) {
    return `Claflin, Hetty speaking. You have ${company} on the ticket. What amount shall we put down?`;
  }
  if (draft.amount) {
    return `Claflin, Hetty speaking. You have ${draft.side} ${draft.amount} ${draft.unit} on the ticket. Which mark shall we put it on?`;
  }
  return 'Claflin, Hetty speaking. Paper desk — nothing moves onchain. What would you like to put on the ticket?';
}

/** One written line for what the voice just applied to the ticket. Distinct
 *  from what was heard and what was said: a recognised utterance is not proof
 *  an instruction was resolved. */
export function appliedTicketLine(state: DeskState, foreground: ForegroundDocument): string | null {
  if (foreground.kind === 'archive' || foreground.kind === 'missing') return null;
  if (foreground.kind === 'quotation' && state.quote) {
    const quote = state.quote;
    return `On the ticket: ${quote.intent.side} ${quote.inputAmount} ${quote.inputSymbol} → ${quote.outputAmount} ${quote.outputSymbol} under review.`;
  }
  const draft = state.draft;
  if (!draft.instrumentId && !draft.amount) return null;
  const symbol = DESK_INSTRUMENTS.find(item => item.id === draft.instrumentId)?.symbol ?? '—';
  const detail = draft.amount ? `${draft.side} ${draft.amount} ${draft.unit}` : `${draft.side} — amount missing`;
  return `On the ticket: ${symbol} · ${detail}.`;
}

/**
 * How the call finished, according to the work — not the connection.
 * Filed, unfinished, declined, or dropped with the document state kept clear.
 */
export function hettyClosingLine(
  state: DeskState,
  foreground: ForegroundDocument,
  reason: 'ended' | 'dropped',
): string {
  if (reason === 'dropped') {
    if (foreground.kind === 'quotation') {
      return 'The line dropped. Your quotation is still on the slip — nothing was filed.';
    }
    if (state.stage === 'saved' || foreground.kind === 'receipt') {
      return 'The line dropped. Your trade is filed in the paper ledger — no funds moved.';
    }
    if (foreground.kind === 'archive') {
      return 'The line dropped. The filed record is unchanged.';
    }
    if (state.draft.instrumentId || state.draft.amount) {
      return 'The line dropped. Your draft is still on the desk.';
    }
    return 'The line dropped. Nothing was changed on the desk.';
  }
  if (state.stage === 'saved' || foreground.kind === 'receipt') {
    return 'It is in your paper ledger. No funds moved.';
  }
  if (foreground.kind === 'archive') {
    return 'The filed record is unchanged. Nothing was filed today.';
  }
  if (state.stage === 'cancelled') {
    return 'Nothing was filed.';
  }
  if (state.draft.instrumentId || state.draft.amount || foreground.kind === 'quotation' || foreground.kind === 'pending') {
    return 'The draft is still on your desk.';
  }
  return 'Nothing was filed. The desk is as you left it.';
}
