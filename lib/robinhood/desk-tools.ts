/**
 * Isabel's voice tools as one table of handlers over the live desk — same
 * shape as lib/jesse/desk-tools.ts. The policy strings live in
 * ./voice-tools; this file only sequences them against useIsabelDesk.
 * Paper only: no handler can sign or submit — the desk has no execution
 * path at all.
 */
import type { IsabelDesk } from './useIsabelDesk';
import type { IsabelDraft } from './contracts';
import {
  chooseRobinhoodInstrumentResult,
  describeEstimateTerms,
  describeIsabelDesk,
  describeIsabelEvidence,
  describeIsabelRecordFor,
  explainIsabelTopic,
  findIsabelRecord,
  isabelExplainTopicChoices,
  isabelForegroundGuard,
  nextIsabelInstructionDraft,
  resolveIsabelExplainTopic,
  resolveRobinhoodAlias,
  setIsabelAmountResult,
  setIsabelInstructionResult,
} from './voice-tools';

export type ToolParams = Record<string, unknown>;
export type IsabelToolHandler = (params: ToolParams) => Promise<string>;

export type IsabelToolName =
  | 'choose_instrument'
  | 'set_instruction'
  | 'set_amount'
  | 'request_estimate'
  | 'compare_markets'
  | 'record_paper'
  | 'open_record'
  | 'back_to_instruction'
  | 'delete_record'
  | 'cancel_instruction'
  | 'describe_desk'
  | 'explain_concept';

export interface IsabelToolContext {
  /** The desk as it is right now — read fresh on every call. */
  desk: () => IsabelDesk;
  /** Count of finished caller utterances so far. A deletion is confirmed
   *  only by a caller turn that came after it was proposed; a line that
   *  cannot count turns cannot delete by voice. */
  userTurn?: () => number;
}

const DELETE_CONFIRM_WINDOW_MS = 60_000;
/** quote() is fire-and-forget; poll the snapshot until the stage settles. */
const ESTIMATE_WAIT_MS = 9_000;
const ESTIMATE_POLL_MS = 150;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function isabelToolHandlers({ desk, userTurn }: IsabelToolContext): Record<IsabelToolName, IsabelToolHandler> {
  let pendingDelete: { id: string; turn: number; at: number } | null = null;

  /* Leave a record view for the ticket. A filed receipt keeps the desk in
     its saved stage, so re-applying the draft moves it back to drafting. */
  const returnToTicket = (d: IsabelDesk) => {
    d.dismissRecord();
    if (d.state.stage === 'saved') d.edit({ ...d.state.draft });
  };

  const guard = () => {
    const d = desk();
    return { d, refusal: isabelForegroundGuard(d.foreground) };
  };

  return {
    async choose_instrument(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const query = String(p.query ?? '');
      const instrument = resolveRobinhoodAlias(query);
      if (!instrument) return chooseRobinhoodInstrumentResult(query);
      d.edit({ instrumentId: instrument.id });
      return `${instrument.symbol} (${instrument.name.split('•')[0]?.trim() ?? instrument.name}) is on the ticket.`;
    },

    async set_instruction(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const side = String(p.side ?? '');
      if (side !== 'buy' && side !== 'sell') return setIsabelInstructionResult(side);
      const next = nextIsabelInstructionDraft(d.state.draft, side);
      d.edit(next.draft);
      return setIsabelInstructionResult(side, next.amountCleared);
    },

    async set_amount(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const clean = String(p.amount ?? '').trim();
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
        return `"${clean || 'That'}" is not a usable amount — say a plain number, like 100 or 0.5.`;
      }
      const side = d.state.draft.side;
      const partial: Partial<IsabelDraft> = { amount: clean };
      d.edit(partial);
      return setIsabelAmountResult(side, clean);
    },

    async request_estimate() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const draft = d.state.draft;
      if (!draft.instrumentId) return 'Choose an instrument first — say a company or a ticker.';
      if (!draft.side) return 'Say buy or sell so the instruction is clear.';
      if (!draft.amount) return `Say the amount — USDG for a buy, token units for a sell.`;
      if (d.inFlight || d.state.stage === 'quoting') return 'An estimate is already on its way.';
      d.quote();
      const deadline = Date.now() + ESTIMATE_WAIT_MS;
      while (Date.now() < deadline) {
        await sleep(ESTIMATE_POLL_MS);
        const current = desk();
        if (current.state.stage === 'review' && current.state.quote) {
          return `Estimate on the slip: ${describeEstimateTerms(current.state.quote)} Ask whether the caller wants to file this paper record.`;
        }
        if (current.state.stage === 'draft') {
          return current.state.notice
            ? `The estimate did not come through: ${current.state.notice} Say so plainly and offer to adjust or retry.`
            : 'The estimate did not come through. Offer to adjust or retry.';
        }
      }
      return 'The estimate is taking longer than usual — it may still land on the slip. Check before quoting again.';
    },

    async compare_markets() {
      const { d } = guard();
      return describeIsabelEvidence(d.state);
    },

    async record_paper() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      if (d.foreground.kind === 'receipt') return 'That instruction is already filed.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
      if (d.state.stage !== 'review' || !d.state.quote) {
        return d.state.stage === 'quoting'
          ? 'An estimate is still on its way — wait for it before filing.'
          : 'There is no estimate under review. Request one first, then file while it is still fresh.';
      }
      const filed = d.file();
      if (!filed) return desk().state.notice ?? 'The record could not be filed. Review a fresh estimate.';
      const quote = desk().state.quote;
      return quote
        ? `Filed — ${describeEstimateTerms(quote)} It's in the paper ledger. No funds moved.`
        : 'Filed — it is in the paper ledger. No funds moved.';
    },

    async open_record(p) {
      const { d } = guard();
      if (!d.historyReady) return 'Browser storage is unavailable, so the records cannot be read right now.';
      const entry = findIsabelRecord(d.records, d.foreground.recordId, String(p.query ?? ''));
      if (!entry) return d.records.length === 0 ? 'There are no paper records on file yet.' : 'No filed record matches that.';
      d.openRecord(entry.id);
      return `Showing the ${describeIsabelRecordFor(entry)}. It is read-only here — say back to the instruction to return to the ticket.`;
    },

    async back_to_instruction() {
      const { d } = guard();
      returnToTicket(d);
      return 'Back on the ticket — the instruction is as you left it.';
    },

    async delete_record(p) {
      const { d } = guard();
      if (!userTurn) return 'Deleting by voice is not available on this line. The caller can use Delete beside the record on screen.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be deleted right now.';

      if (p.confirm !== true) {
        const entry = findIsabelRecord(d.records, d.foreground.recordId, String(p.query ?? ''));
        if (!entry) return d.records.length === 0 ? 'There are no paper records on file.' : 'No filed record matches that. Nothing was deleted.';
        pendingDelete = { id: entry.id, turn: userTurn(), at: Date.now() };
        return `Ask the caller to confirm: delete the ${describeIsabelRecordFor(entry)}? It is removed from this browser and cannot be undone. Wait for an explicit yes, then call delete_record again with confirm true.`;
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
      const entry = d.records.find(r => r.id === waiting.id);
      if (!entry) return 'That record is already gone. Nothing more to do.';
      const onScreen = d.foreground.recordId === entry.id;
      const described = describeIsabelRecordFor(entry);
      d.removeRecord(entry.id);
      if (onScreen) returnToTicket(desk());
      return `Deleted the ${described}. It is gone from this browser.`;
    },

    async cancel_instruction() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      d.cancel();
      return 'The ticket is clear.';
    },

    async describe_desk() {
      const { d } = guard();
      return describeIsabelDesk(d.state, d.foreground, d.records);
    },

    async explain_concept(p) {
      const { d } = guard();
      if (d.inFlight || d.state.stage === 'quoting') {
        return 'Hold the explanation — an estimate is coming in. Ask again in a moment.';
      }
      const topic = resolveIsabelExplainTopic(String(p.topic ?? ''));
      if (!topic) return `I do not have a reviewed explanation for that. I can explain: ${isabelExplainTopicChoices()}.`;
      return explainIsabelTopic(topic);
    },
  };
}
