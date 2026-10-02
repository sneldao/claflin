/**
 * Halley's voice tools as one table of handlers over the live desk — same
 * shape as lib/robinhood/desk-tools.ts. The policy strings live in
 * ./voice-tools; this file only sequences them against useHalleyDesk.
 * Paper only: no handler can sign, submit, or launch — the desk has no
 * execution path.
 */
import type { HalleyDesk } from './useHalleyDesk';
import {
  describeHalleyDesk,
  describeHalleyRecordFor,
  describeLaunchTerms,
  explainHalleyTopic,
  findHalleyRecord,
  halleyExplainTopicChoices,
  halleyForegroundGuard,
  resolveHalleyAnchor,
  resolveHalleyCurve,
  resolveHalleyExplainTopic,
  resolveHalleyQuote,
} from './voice-tools';
import { HALLEY_QUOTE_MINTS } from './catalog';
import { LAUNCH_CURVE_PRESETS } from './contracts';

export type ToolParams = Record<string, unknown>;
export type HalleyToolHandler = (params: ToolParams) => Promise<string>;

export type HalleyToolName =
  | 'name_launch'
  | 'choose_quote'
  | 'choose_anchor'
  | 'choose_curve'
  | 'set_supply'
  | 'set_graduation'
  | 'request_launch_estimate'
  | 'file_paper_launch'
  | 'open_record'
  | 'back_to_instruction'
  | 'delete_record'
  | 'cancel_instruction'
  | 'describe_desk'
  | 'explain_concept';

export interface HalleyToolContext {
  /** The desk as it is right now — read fresh on every call. */
  desk: () => HalleyDesk;
  /** Count of finished caller utterances so far — see Isabel's note. */
  userTurn?: () => number;
}

const DELETE_CONFIRM_WINDOW_MS = 60_000;
/** estimate() is fire-and-forget; poll the snapshot until the stage settles. */
const ESTIMATE_WAIT_MS = 9_000;
const ESTIMATE_POLL_MS = 150;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function halleyToolHandlers({ desk, userTurn }: HalleyToolContext): Record<HalleyToolName, HalleyToolHandler> {
  let pendingDelete: { id: string; turn: number; at: number } | null = null;

  const returnToTicket = (d: HalleyDesk) => {
    d.dismissRecord();
    if (d.state.stage === 'saved') d.edit({ ...d.state.draft });
  };

  const guard = () => {
    const d = desk();
    return { d, refusal: halleyForegroundGuard(d.foreground) };
  };

  return {
    async name_launch(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const name = String(p.name ?? '').trim();
      const symbol = String(p.symbol ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!name || name.length < 2 || name.length > 40) {
        return 'The launch needs a name — two to forty characters, like "NVDA Tracker".';
      }
      if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
        return `The symbol needs to be two to ten letters or digits — "${symbol || 'that'}" is not usable.`;
      }
      d.edit({ name, symbol });
      return `${name} (${symbol}) is on the slip.`;
    },

    async choose_quote(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const query = String(p.quote ?? '');
      const quote = resolveHalleyQuote(query);
      if (!quote) {
        return `"${query || 'That'}" is not a launch quote here. The desk carries USDC and the badged xStocks — ${HALLEY_QUOTE_MINTS.filter(q => q.underlyingSymbol).map(q => q.symbol).join(', ')}.`;
      }
      d.edit({ quoteSymbol: quote });
      return quote === 'USDC'
        ? 'Quoted in USDC — the opening will anchor to the equity mark directly.'
        : `Quoted in ${quote} — this becomes an equity pair, anchored to the ratio of the two marks.`;
    },

    async choose_anchor(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const query = String(p.anchor ?? '');
      if (/^(none|no\s+anchor|unanchored|nothing)$/i.test(query.trim())) {
        d.edit({ anchorSymbol: null });
        return 'No anchor — the curve opens at 1.0 and that will be disclosed on the slip.';
      }
      const anchor = resolveHalleyAnchor(query);
      if (!anchor) {
        return `"${query || 'That'}" is not an anchor on this desk. The verified marks are Apple, NVIDIA, and Tesla.`;
      }
      d.edit({ anchorSymbol: anchor });
      return `Anchored to ${anchor} — the opening price moors to its Pyth mark.`;
    },

    async choose_curve(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const query = String(p.curve ?? '');
      const curve = resolveHalleyCurve(query);
      if (!curve) {
        return `"${query || 'That'}" is not a curve here. The choices are ${LAUNCH_CURVE_PRESETS.join(', ')}.`;
      }
      d.edit({ curve });
      return `${curve === 'equity-pair' ? 'Equity pair' : curve} curve — the projected path will show its shape.`;
    },

    async set_supply(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const clean = String(p.supply ?? '').trim().replace(/[,_\s]/g, '');
      if (!/^[1-9]\d*$/.test(clean)) {
        return `"${clean || 'That'}" is not a usable supply — say a whole number of tokens, like a million.`;
      }
      d.edit({ supply: clean });
      return `${clean} tokens is on the slip.`;
    },

    async set_graduation(p) {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const clean = String(p.amount ?? '').trim().replace(/[,_\s]/g, '');
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean) || !/[1-9]/.test(clean)) {
        return `"${clean || 'That'}" is not a usable graduation line — say a positive amount of the quote asset.`;
      }
      d.edit({ graduationQuote: clean });
      return `Graduation at ${clean} ${d.state.draft.quoteSymbol ?? 'quote'} collected — the pool migrates to DAMM v2 there.`;
    },

    async request_launch_estimate() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      const draft = d.state.draft;
      if (!draft.name || !draft.symbol) return 'Name the launch first — a name and a symbol.';
      if (!draft.quoteSymbol) return 'Pick the quote asset — USDC, or an xStock for a pair.';
      if (!draft.supply) return 'Say the supply — a whole number of tokens.';
      if (!draft.graduationQuote) return 'Say the graduation line — how much quote collected migrates the pool.';
      if (d.inFlight || d.state.stage === 'estimating') return 'An estimate is already on its way.';
      d.estimate();
      const deadline = Date.now() + ESTIMATE_WAIT_MS;
      while (Date.now() < deadline) {
        await sleep(ESTIMATE_POLL_MS);
        const current = desk();
        if (current.state.stage === 'review' && current.state.estimate) {
          return `Projected curve on the slip: ${describeLaunchTerms(current.state.estimate)} Ask whether the caller wants to file this paper launch.`;
        }
        if (current.state.stage === 'draft') {
          return current.state.notice
            ? `The estimate did not come through: ${current.state.notice} Say so plainly and offer to adjust or retry.`
            : 'The estimate did not come through. Offer to adjust or retry.';
        }
      }
      return 'The estimate is taking longer than usual — it may still land on the slip. Check before drawing it again.';
    },

    async file_paper_launch() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      if (d.foreground.kind === 'receipt') return 'That launch is already filed.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
      if (d.state.stage !== 'review' || !d.state.estimate) {
        return d.state.stage === 'estimating'
          ? 'An estimate is still on its way — wait for it before filing.'
          : 'There is no estimate under review. Draw one first, then file while it is still fresh.';
      }
      const filed = d.file();
      if (!filed) return desk().state.notice ?? 'The record could not be filed. Review a fresh estimate.';
      const estimate = desk().state.estimate;
      return estimate
        ? `Filed — ${describeLaunchTerms(estimate)} It's in the paper ledger. No mint was created.`
        : 'Filed — it is in the paper ledger. No mint was created.';
    },

    async open_record(p) {
      const { d } = guard();
      if (!d.historyReady) return 'Browser storage is unavailable, so the records cannot be read right now.';
      const entry = findHalleyRecord(d.records, d.foreground.recordId, String(p.query ?? ''));
      if (!entry) return d.records.length === 0 ? 'There are no paper launches on file yet.' : 'No filed record matches that.';
      d.openRecord(entry.id);
      return `Showing the ${describeHalleyRecordFor(entry)}. It is read-only here — say back to the slip to return.`;
    },

    async back_to_instruction() {
      const { d } = guard();
      returnToTicket(d);
      return 'Back on the slip — the launch is as you left it.';
    },

    async delete_record(p) {
      const { d } = guard();
      if (!userTurn) return 'Deleting by voice is not available on this line. The caller can use Delete beside the record on screen.';
      if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be deleted right now.';

      if (p.confirm !== true) {
        const entry = findHalleyRecord(d.records, d.foreground.recordId, String(p.query ?? ''));
        if (!entry) return d.records.length === 0 ? 'There are no paper launches on file.' : 'No filed record matches that. Nothing was deleted.';
        pendingDelete = { id: entry.id, turn: userTurn(), at: Date.now() };
        return `Ask the caller to confirm: delete the ${describeHalleyRecordFor(entry)}? It is removed from this browser and cannot be undone. Wait for an explicit yes, then call delete_record again with confirm true.`;
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
      const described = describeHalleyRecordFor(entry);
      d.removeRecord(entry.id);
      if (onScreen) returnToTicket(desk());
      return `Deleted the ${described}. It is gone from this browser.`;
    },

    async cancel_instruction() {
      const { d, refusal } = guard();
      if (refusal) return refusal;
      d.cancel();
      return 'The slip is clear.';
    },

    async describe_desk() {
      const { d } = guard();
      return describeHalleyDesk(d.state, d.foreground, d.records);
    },

    async explain_concept(p) {
      const { d } = guard();
      if (d.inFlight || d.state.stage === 'estimating') {
        return 'Hold the explanation — an estimate is coming in. Ask again in a moment.';
      }
      const topic = resolveHalleyExplainTopic(String(p.topic ?? ''));
      if (!topic) return `I do not have a reviewed explanation for that. I can explain: ${halleyExplainTopicChoices()}.`;
      return explainHalleyTopic(topic);
    },
  };
}
