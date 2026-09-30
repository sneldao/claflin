/**
 * Jesse's voice tools as one table of handlers over the live desk — shared by
 * every provider that carries his line (ElevenLabs ConvAI, AssemblyAI Voice
 * Agent). The policy strings live in ./voice-tools; this file only sequences
 * them against useJesseDesk. Paper only: no handler can sign or submit.
 */
import type { JesseDesk } from '../solana/useJesseDesk';
import type { SlipField } from '../desk/slip-provenance';
import { compactJesseEntry } from '../solana/desk-documents';
import { formatRecordedTime } from '../trading/desk-documents';
import {
  chooseSolanaInstrumentResult,
  describeJesseDesk,
  explainTopicChoices,
  jesseForegroundGuard,
  jesseSymbol,
  nextJesseInstructionDraft,
  resolveExplainTopic,
  resolveSolanaAlias,
  setJesseAmountResult,
  setJesseInstructionResult,
} from './voice-tools';
import type { JesseToolName } from './assemblyai-agent';

import type { QuoteReadback } from '../desk/contracts';
import type { ReadbackOutcome } from './quote-readback';

export type ToolParams = Record<string, unknown>;
export type JesseToolHandler = (params: ToolParams) => Promise<string>;

const READBACK_COMPLETED =
  'The paper estimate is on the slip and its amounts were read aloud. Do not repeat or convert the amounts. Ask whether the caller wants to save this paper record.';
const READBACK_UNAVAILABLE =
  'The browser could not read the estimate aloud. Ask the caller to inspect the written amounts on the slip before deciding whether to save. Do not speak or guess the amounts.';
const READBACK_INTERRUPTED =
  'The readback was interrupted or the instruction changed. Check the current desk; do not ask to file the previous estimate.';
const READBACK_EXPIRED =
  'The estimate expired before its readback completed. Offer a fresh estimate; do not ask to file this one.';

function readbackMessage(outcome: ReadbackOutcome): string {
  switch (outcome) {
    case 'completed': return READBACK_COMPLETED;
    case 'expired': return READBACK_EXPIRED;
    case 'stale':
    case 'cancelled': return READBACK_INTERRUPTED;
    default: return READBACK_UNAVAILABLE;
  }
}

export interface JesseToolContext {
  /** The desk as it is right now — read fresh on every call. */
  desk: () => JesseDesk;
  /** Mark a tool-applied field as "from the call". */
  markLine: (field: SlipField, value: string) => void;
  /** Count of finished caller utterances so far. A deletion is confirmed
   *  only by a caller turn that came after it was proposed; a line that
   *  cannot count turns cannot delete by voice. */
  userTurn?: () => number;
  onQuoteReadback?: (payload: QuoteReadback) => Promise<ReadbackOutcome>;
}

const DELETE_CONFIRM_WINDOW_MS = 60_000;

type Entry = ReturnType<typeof compactJesseEntry>;

function describeEntry(e: Entry): string {
  return `${e.side} of ${e.amount} for ${e.symbol}, filed at ${formatRecordedTime(e.createdAt)}`;
}

/** Match a spoken description to a filed record: newest first, optionally
 *  narrowed by company and by buy/sell. No description means the record on
 *  screen, else the latest. Nothing matching is null, never a guess. */
function findEntry(desk: JesseDesk, query: string): Entry | null {
  const entries = desk.records.map(compactJesseEntry).sort((a, b) => b.createdAt - a.createdAt);
  if (entries.length === 0) return null;
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const instrument = resolveSolanaAlias(query) ?? words.map(w => resolveSolanaAlias(w)).find(Boolean) ?? null;
  const side = words.includes('buy') || words.includes('bought') ? 'buy'
    : words.includes('sell') || words.includes('sold') ? 'sell' : null;
  if (!instrument && !side) {
    const onScreen = desk.foreground.recordId;
    return (onScreen && entries.find(e => e.id === onScreen)) || entries[0];
  }
  return entries.find(e => (!instrument || e.symbol === instrument.symbol) && (!side || e.side.toLowerCase() === side)) ?? null;
}

export function jesseToolHandlers({ desk, markLine, userTurn, onQuoteReadback }: JesseToolContext): Record<JesseToolName, JesseToolHandler> {
  const applied = (status: string) => status === 'applied' || status === 'clarify';
  let pendingDelete: { id: string; turn: number; at: number } | null = null;

  /* Leave a record view for the ticket. A filed receipt keeps the desk in
     its saved stage, so re-applying the draft moves it back to drafting. */
  const returnToTicket = async (d: JesseDesk) => {
    d.dismissRecord();
    if (d.state.stage === 'saved') await d.edit(current => current, 'amount');
  };

  return {
    async choose_instrument(p) {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const query = String(p.query ?? '');
      const instrument = resolveSolanaAlias(query);
      if (!instrument) return chooseSolanaInstrumentResult(query);
      const result = await d.edit({ instrumentId: instrument.id }, 'instrument');
      if (applied(result.status)) markLine('instrument', instrument.id);
      return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
    },

    async set_instruction(p) {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const side = String(p.side ?? '');
      if (side !== 'buy' && side !== 'sell') return setJesseInstructionResult(side);
      let amountCleared = false;
      const result = await d.edit(current => {
        const next = nextJesseInstructionDraft(current, side);
        amountCleared = next.amountCleared;
        return next.draft;
      }, 'side');
      if (applied(result.status)) markLine('side', side);
      return setJesseInstructionResult(side, amountCleared);
    },

    async set_amount(p) {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const clean = String(p.amount ?? '').trim();
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
        return `"${clean || 'That'}" is not a usable amount — say a plain number, like 100 or 0.5.`;
      }
      let side: 'buy' | 'sell' | null = null;
      const result = await d.edit(current => {
        side = current.side;
        return { amount: clean };
      }, 'amount');
      if (applied(result.status)) markLine('amount', clean);
      return setJesseAmountResult(side, clean);
    },

    async request_estimate() {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      if (d.inFlight === 'quote' || d.state.stage === 'quoting') return 'An estimate is already on its way.';
      /* The quote result comes straight from the controller. The desk
         snapshot lags a render behind it, so polling it would misreport a
         quote that has already landed. */
      const result = await d.quote();
      if (result.status === 'applied' && result.quoteId) {
        if (result.quoteReadback && onQuoteReadback) {
          return readbackMessage(await onQuoteReadback(result.quoteReadback));
        }
        return result.spokenText || 'Estimate on the slip — paper only.';
      }
      return result.spokenText || 'The estimate did not come through. Offer to adjust or retry.';
    },

    async compare_markets(p) {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const query = String(p.query ?? '').trim();
      if (query) {
        const instrument = resolveSolanaAlias(query);
        if (!instrument) return chooseSolanaInstrumentResult(query);
        const result = await d.edit({ instrumentId: instrument.id }, 'instrument');
        if (applied(result.status)) markLine('instrument', instrument.id);
      }
      if (!desk().state.draft.instrumentId) return 'Which xStock should I compare — Apple, NVIDIA, or Tesla?';
      const compared = await d.compare();
      return compared.spokenText
        || 'Comparison is unavailable right now. Say so honestly; independent Jupiter quoting may still work.';
    },

    async record_paper() {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      if (d.foreground.kind === 'receipt') return 'That instruction is already filed.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
      const result = await d.file();
      return result.spokenText;
    },

    async open_record(p) {
      const d = desk();
      if (!d.historyReady) return 'Browser storage is unavailable, so the records cannot be read right now.';
      const entry = findEntry(d, String(p.query ?? ''));
      if (!entry) return d.records.length === 0 ? 'There are no paper records on file yet.' : 'No filed record matches that.';
      d.openRecord(entry.id);
      return `Showing the ${describeEntry(entry)}. It is read-only here — say back to the instruction to return to the ticket.`;
    },

    async back_to_instruction() {
      const d = desk();
      await returnToTicket(d);
      return 'Back on the ticket — the instruction is as you left it.';
    },

    async delete_record(p) {
      const d = desk();
      if (!userTurn) return 'Deleting by voice is not available on this line. The caller can use Delete beside the record on screen.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be deleted right now.';

      if (p.confirm !== true) {
        const entry = findEntry(d, String(p.query ?? ''));
        if (!entry) return d.records.length === 0 ? 'There are no paper records on file.' : 'No filed record matches that. Nothing was deleted.';
        pendingDelete = { id: entry.id, turn: userTurn(), at: Date.now() };
        return `Ask the caller to confirm: delete the ${describeEntry(entry)}? It is removed from this browser and cannot be undone. Wait for an explicit yes, then call delete_record again with confirm true.`;
      }

      const waiting = pendingDelete;
      if (!waiting || Date.now() - waiting.at > DELETE_CONFIRM_WINDOW_MS) {
        pendingDelete = null;
        return 'Nothing is waiting for confirmation. Ask which record, and confirm it with the caller first.';
      }
      if (userTurn() <= waiting.turn) {
        return 'The caller has not answered yet. Ask them to confirm, and wait for their yes.';
      }
      pendingDelete = null;
      const entry = d.records.map(compactJesseEntry).find(e => e.id === waiting.id);
      if (!entry) return 'That record is already gone. Nothing more to do.';
      const onScreen = d.foreground.recordId === entry.id || d.state.quote?.id === entry.id;
      d.removeRecord(entry.id);
      if (onScreen) await returnToTicket(d);
      return `Deleted the ${describeEntry(entry)}. It is gone from this browser.`;
    },

    async watch_mark(p) {
      const d = desk();
      if (d.foreground.kind === 'missing') return 'That paper record is no longer here.';
      const query = String(p.query ?? '').trim();
      const instrument = query
        ? resolveSolanaAlias(query)
        : (d.state.draft.instrumentId ? resolveSolanaAlias(jesseSymbol(d.state.draft.instrumentId)) : null);
      const id = instrument?.id ?? d.state.draft.instrumentId;
      if (!id) return 'No instrument to watch — name one, or put an xStock on the ticket first.';
      const result = await d.watch(id);
      return result.spokenText || `${jesseSymbol(id)} is watched on this desk.`;
    },

    async cancel_instruction() {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const result = await d.cancel();
      return result.spokenText || 'The ticket is clear.';
    },

    async describe_desk() {
      const d = desk();
      if (d.foreground.kind === 'quotation' && d.state.quote && onQuoteReadback) {
        const q = d.state.quote;
        return readbackMessage(await onQuoteReadback({
          quoteId: q.id,
          revision: d.state.revision,
          expiresAt: q.expiresAt,
          inputAmount: q.inputAmount,
          inputSymbol: q.inputSymbol,
          outputAmount: q.outputAmount,
          outputSymbol: q.outputSymbol,
        }));
      }
      return describeJesseDesk(d.state, d.foreground, d.records);
    },

    async explain_concept(p) {
      const d = desk();
      if (d.inFlight === 'quote' || d.state.stage === 'quoting') {
        return 'Hold the explanation — an estimate is coming in. Ask again in a moment.';
      }
      const topic = resolveExplainTopic(String(p.topic ?? ''));
      if (!topic) return `I do not have a reviewed explanation for that. I can explain: ${explainTopicChoices()}.`;
      const result = await d.run({ type: 'explain', topic });
      return result.spokenText;
    },
  };
}
