/**
 * Jesse's atomic desk controller (plan §4.5, E1 work item 6).
 *
 * One authoritative owner of Jesse desk state, mounted above every renderer
 * and the voice-session owner (§4.7). Every command passes a
 * desk/revision/session-generation guard; financial and work-state mutations
 * (draft, clarify, cancel, quote acceptance, file-paper, watch) bump the
 * revision by exactly one, while presentation-only commands (focus, explain,
 * describe) never bump — so a view switch or focus change can survive an
 * in-flight quote without invalidating it ("in-flight operations remain the
 * same operation").
 *
 * Async responses (quote, compare) are accepted only when the request id
 * (quotes), the session generation, and the revision captured before the
 * await all still match — a newer command, a cancel, or a session end
 * silently kills a late response, and the newer command's own result
 * already spoke. Newer speech is never made to wait on an in-flight
 * provider call.
 *
 * There is exactly one path that files anything: an explicit `file-paper`
 * command naming the quote currently under review, while it is still fresh.
 * "Yes" — or any other command — files nothing.
 *
 * Client-safe: no server imports, no env access, no React, no market clients.
 * The quote adapter (E1), the comparison reader (E2), and the readback
 * formatter (E3) are injected as ports; tests inject fakes.
 */
import { z } from 'zod';
import {
  isJesseIntent,
  isSolanaInstrumentId,
  normalizeDeskPresentation,
  type CommandResult,
  type DeskPresentation,
  type DeskPresentationState,
  type DeskRevision,
  type JesseCommand,
  type JesseDraft,
  type JesseIntent,
  type MarketComparison,
  type SolanaInstrument,
  type SolanaInstrumentId,
  type SolanaPaperEstimate,
} from './contracts';
import { SOLANA_INSTRUMENTS } from './catalog';
import {
  loadJesseDraft,
  loadJessePaperRecords,
  parseJesseEstimate,
  saveJesseDraft,
  saveJessePaperRecord,
  type JessePaperRecord,
} from './paper';
import {
  applyJesseFocus,
  loadJessePresentation,
  saveJessePresentation,
  switchJessePresentation,
} from './presentation';
import type { PaperStorage } from '../trading/paper-records';

/* ports */

/** What the controller needs said aloud, as typed events. E3 may inject a
 *  formatter; the default is deterministic plain text. */
export type SpokenEvent =
  | { kind: 'draft'; intent: JesseIntent; quoteRequested: boolean }
  | { kind: 'quote-presented'; quote: SolanaPaperEstimate; instrument: SolanaInstrument }
  | { kind: 'quote-failed'; reason: string }
  | { kind: 'clarify'; question: string }
  | { kind: 'compare-presented'; comparison: MarketComparison }
  | { kind: 'compare-unavailable'; instrumentId: SolanaInstrumentId }
  | { kind: 'focus'; target: DeskPresentationState['focus']; objectId: string | null }
  | { kind: 'watch'; instrument: SolanaInstrument; watching: boolean }
  | { kind: 'cancelled'; what: 'quote-request' | 'review' }
  | { kind: 'filed'; record: JessePaperRecord };

export interface JesseControllerPorts {
  /** E1 adapter seam — returns a fresh paper estimate for the exact intent. */
  quote(intent: JesseIntent): Promise<SolanaPaperEstimate>;
  /** E2 reader — null means the evidence is unavailable, never fabricated. */
  compare(instrumentId: SolanaInstrumentId): Promise<MarketComparison | null>;
  /** E3 readback formatter — optional; the default below is deterministic. */
  formatSpoken?(event: SpokenEvent): string;
}

export function defaultJesseSpoken(event: SpokenEvent): string {
  switch (event.kind) {
    case 'draft': {
      const { intent } = event;
      const what = intent.side === 'buy'
        ? `buy with ${intent.amount} USDC`
        : `sell ${intent.amount} scaled tokens`;
      return event.quoteRequested
        ? `Working on it: ${what}. Getting a paper estimate.`
        : `Noted: ${what}.`;
    }
    case 'quote-presented': {
      const q = event.quote;
      return `Paper estimate for ${event.instrument.symbol}: spend ${q.inputAmount} ${q.inputSymbol}, receive about ${q.outputAmount} ${q.outputSymbol}. Review it, then say "file this paper record" to keep it.`;
    }
    case 'quote-failed':
      return `I couldn't get that estimate — ${event.reason}. Nothing was changed.`;
    case 'clarify':
      return event.question;
    case 'compare-presented': {
      const c = event.comparison;
      if (c.status === 'comparable' && c.referenceDifferenceBps !== null) {
        return `The token and equity references are comparable. Reference difference: ${c.referenceDifferenceBps} basis points — a reference reading, not profit.`;
      }
      if (c.status === 'last-observation') {
        return 'The equity market is not in regular session, so this is a labelled last observation, not a live comparison.';
      }
      return 'A market comparison is not available right now.';
    }
    case 'compare-unavailable':
      return 'Market evidence for that instrument is unavailable right now. Nothing was changed.';
    case 'focus':
      return event.target === 'desk' ? 'Back to the desk.' : `Bringing that ${event.target} forward.`;
    case 'watch':
      return event.watching ? `Watching ${event.instrument.symbol}.` : `Stopped watching ${event.instrument.symbol}.`;
    case 'cancelled':
      return event.what === 'quote-request'
        ? 'Estimate request cancelled.'
        : 'The estimate was set aside. Nothing was filed.';
    case 'filed':
      return `Filed paper record ${event.record.id}. It is kept locally in this browser.`;
  }
}

/* watches */

export const JESSE_WATCHES_KEY = 'claflin.watched.v2.jesse';
/** Watches are bounded; a return-visit suggestion is a convenience, never
 *  a permission signal. */
export const JESSE_MAX_WATCHES = 50;

const watchIdSchema = z.string().max(60).refine(isSolanaInstrumentId, 'Invalid instrument id');
const watchesSchema = z.array(watchIdSchema).max(JESSE_MAX_WATCHES);

/** Read the explicit watch list. Missing or malformed rows read back empty. */
export function loadJesseWatches(storage: Pick<PaperStorage, 'getItem'>): SolanaInstrumentId[] {
  const raw = storage.getItem(JESSE_WATCHES_KEY);
  if (!raw) return [];
  try {
    return [...new Set(watchesSchema.parse(JSON.parse(raw)))];
  } catch {
    return [];
  }
}

function saveJesseWatches(
  storage: PaperStorage,
  watches: readonly SolanaInstrumentId[],
): void {
  const parsed = watchesSchema.parse([...new Set(watches)]);
  const serialized = JSON.stringify(parsed);
  storage.setItem(JESSE_WATCHES_KEY, serialized);
  if (storage.getItem(JESSE_WATCHES_KEY) !== serialized) {
    throw new Error('Watch list could not be verified after saving.');
  }
}

/* state */

export type JesseDeskStage = 'draft' | 'quoting' | 'review' | 'saved' | 'cancelled';

export interface JesseDeskState {
  readonly revision: number;
  readonly sessionGeneration: number;
  readonly draft: JesseDraft;
  readonly stage: JesseDeskStage;
  readonly quote: SolanaPaperEstimate | null;
  /** The catalog snapshot captured when the quote was accepted — never
   *  re-resolved later, so a filed record freezes what was presented. */
  readonly presentedInstrument: SolanaInstrument | null;
  /** The last evidence presented for the quoted/selected instrument. */
  readonly comparison: MarketComparison | null;
  readonly presentation: DeskPresentationState;
  readonly watches: readonly SolanaInstrumentId[];
}

export interface JesseController {
  getState(): Readonly<JesseDeskState>;
  applyJesseCommand(command: JesseCommand, expected: DeskRevision): Promise<CommandResult>;
  /** Presentation-only mode switch (§4.7) — never bumps revision or quotes. */
  setPresentationMode(mode: DeskPresentation | 'night' | 'direct'): { ok: boolean; spokenText: string };
  /** Start a new session generation: pending quote responses die, and an
   *  in-flight quoting stage returns to draft. Revision is untouched. */
  endSession(): void;
  /** Load the persisted draft checkpoint, watches, and presentation
   *  preference into the (fresh) controller. */
  restore(): void;
}

const EMPTY_DRAFT: JesseDraft = { instrumentId: null, side: null, unit: null, amount: null };

const EXPLANATIONS: Record<Extract<JesseCommand, { type: 'explain' }>['topic'], string> = {
  'reference-difference':
    'The reference difference compares the xStock token price with the underlying equity price in the same units, expressed in basis points. It is a reference reading — not profit, and not an executable arbitrage. When the two observations cannot be aligned on units, timing, or session, Jesse says so instead of showing a number.',
  'market-hours':
    'The underlying equities trade during regular US market hours. Outside those hours the equity observation may be stale, and Jesse labels the comparison a last observation with its timestamps, rather than presenting it as a live reading.',
  'scaled-units':
    'xStock tokens use a scaled display amount: one displayed unit can correspond to a different number of raw tokens, set by the issuer’s multiplier. Jesse always speaks in the units shown on the ticket and reads the multiplier live at quote time — it is never stored from an earlier session.',
  'paper-mode':
    'Jesse is in paper mode. Estimates are simulated fills from the venue’s quote, and filing a paper record only saves a local record in this browser. No wallet is touched, no order is routed, and nothing settles on any network.',
};

function defaultRandomId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createJesseController(opts: {
  storage: PaperStorage & { removeItem(key: string): void };
  ports: JesseControllerPorts;
  now?: () => number;
  /** Deterministic id source for tests. Reserved for controller-minted
   *  identities; quotes and records carry provider ids today. */
  randomId?: () => string;
}): JesseController {
  const storage = opts.storage;
  const ports = opts.ports;
  const now = opts.now ?? (() => Date.now());
  // Reserved seam — tests inject determinism. Kept referenced so the option
  // is a real, documented part of the port surface.
  void (opts.randomId ?? defaultRandomId);

  const state: {
    revision: number;
    sessionGeneration: number;
    draft: JesseDraft;
    stage: JesseDeskStage;
    quote: SolanaPaperEstimate | null;
    presentedInstrument: SolanaInstrument | null;
    comparison: MarketComparison | null;
    quoteRequestId: number;
    requestRevision: number | null;
    presentation: DeskPresentationState;
    watches: SolanaInstrumentId[];
  } = {
    revision: 0,
    sessionGeneration: 1,
    draft: { ...EMPTY_DRAFT },
    stage: 'draft',
    quote: null,
    presentedInstrument: null,
    comparison: null,
    quoteRequestId: 0,
    requestRevision: null,
    presentation: { mode: 'room', focus: 'desk', objectId: null },
    watches: [],
  };

  const speak = (event: SpokenEvent): string =>
    ports.formatSpoken ? ports.formatSpoken(event) : defaultJesseSpoken(event);

  const result = (
    status: CommandResult['status'],
    spokenText: string,
    ids: { quoteId?: string | null; evidenceId?: string | null } = {},
  ): CommandResult => ({
    status,
    revision: state.revision,
    quoteId: ids.quoteId ?? null,
    evidenceId: ids.evidenceId ?? null,
    spokenText,
  });

  /** Every command proves it was issued against the current desk state. */
  const guard = (expected: DeskRevision): CommandResult | null => {
    if (
      expected.deskId !== 'jesse'
      || expected.revision !== state.revision
      || expected.sessionGeneration !== state.sessionGeneration
    ) {
      return result(
        'stale',
        'That instruction is out of date — the desk already moved on, so nothing was changed.',
      );
    }
    return null;
  };

  const catalogInstrument = (id: SolanaInstrumentId): SolanaInstrument | null =>
    SOLANA_INSTRUMENTS.find(candidate => candidate.id === id) ?? null;

  const symbolOf = (id: SolanaInstrumentId): string =>
    catalogInstrument(id)?.symbol ?? 'that instrument';

  /** Drop quote authority. Evidence survives only while it describes the
   *  instrument still on the ticket. */
  const clearQuoteAuthority = (): void => {
    state.quote = null;
    state.presentedInstrument = null;
    if (state.comparison && state.comparison.instrumentId !== state.draft.instrumentId) {
      state.comparison = null;
    }
  };

  /** Partial-draft rules, mirroring paper.ts: nullable fields, buy↔USDC,
   *  sell↔scaled-token, side null ↔ unit null — a missing side is never
   *  coerced to buy. */
  const isValidPartialDraft = (d: JesseDraft): boolean => {
    if (d.instrumentId !== null && (!isSolanaInstrumentId(d.instrumentId) || d.instrumentId.length > 60)) return false;
    if (d.side !== null && d.side !== 'buy' && d.side !== 'sell') return false;
    if (d.unit !== null && d.unit !== 'USDC' && d.unit !== 'scaled-token') return false;
    if (d.amount !== null && (typeof d.amount !== 'string' || d.amount.length > 40 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(d.amount))) return false;
    if ((d.side === null) !== (d.unit === null)) return false;
    if (d.side === 'buy' && d.unit !== 'USDC') return false;
    if (d.side === 'sell' && d.unit !== 'scaled-token') return false;
    return true;
  };

  const clarifyAsk = (question: string): CommandResult =>
    result('clarify', speak({ kind: 'clarify', question }));

  /* command handlers */

  const onDraft = async (command: Extract<JesseCommand, { type: 'draft' }>): Promise<CommandResult> => {
    if (!isJesseIntent(command.intent)) {
      return result('rejected', 'That instruction is incomplete or malformed — nothing was changed.');
    }
    const intent = command.intent;
    const instrument = catalogInstrument(intent.instrumentId);
    if (!instrument) {
      return result('rejected', 'That product is outside Jesse’s verified catalog. Nothing was changed.');
    }
    const keepQuote = !command.quote
      && state.quote !== null
      && JSON.stringify(state.quote.intent) === JSON.stringify(intent);

    state.draft = { instrumentId: intent.instrumentId, side: intent.side, unit: intent.unit, amount: intent.amount };
    if (!keepQuote) {
      clearQuoteAuthority();
      if (state.stage === 'review' || state.stage === 'quoting') {
        state.stage = 'draft';
        state.requestRevision = null;
      }
    }
    try {
      saveJesseDraft(storage, state.draft);
    } catch {
      return result('rejected', 'The draft could not be saved in this browser.');
    }
    state.revision += 1;

    if (!command.quote) {
      return result('applied', speak({ kind: 'draft', intent, quoteRequested: false }));
    }

    const requestId = ++state.quoteRequestId;
    state.stage = 'quoting';
    const requestRevision = state.revision; // captured after the draft bump above
    state.requestRevision = requestRevision;
    const generation = state.sessionGeneration;

    const dropped = (): CommandResult =>
      result('stale', 'A newer instruction replaced that estimate request before it landed.');

    let quote: SolanaPaperEstimate;
    try {
      quote = await ports.quote(intent);
    } catch (err) {
      if (requestId !== state.quoteRequestId || generation !== state.sessionGeneration || state.revision !== requestRevision) {
        return dropped();
      }
      state.stage = 'draft';
      state.requestRevision = null;
      state.revision += 1; // the failed turn is a state change — spoken honestly
      const reason = err instanceof Error ? err.message : 'the venue did not answer';
      return result('rejected', speak({ kind: 'quote-failed', reason }));
    }

    if (requestId !== state.quoteRequestId || generation !== state.sessionGeneration || state.revision !== requestRevision) {
      return dropped(); // silently dropped — the newer command already spoke
    }

    try {
      const parsed = parseJesseEstimate(quote);
      if (JSON.stringify(parsed.intent) !== JSON.stringify(intent)) {
        throw new Error('the venue answered a different instruction');
      }
      quote = parsed;
    } catch (err) {
      state.stage = 'draft';
      state.requestRevision = null;
      state.revision += 1;
      const reason = err instanceof Error ? err.message : 'the estimate was malformed';
      return result('rejected', speak({ kind: 'quote-failed', reason }));
    }

    state.quote = quote;
    state.presentedInstrument = instrument;
    if (state.comparison && state.comparison.instrumentId !== intent.instrumentId) {
      state.comparison = null;
    }
    state.stage = 'review';
    state.requestRevision = null;
    state.revision += 1;
    return result('applied', speak({ kind: 'quote-presented', quote, instrument }), { quoteId: quote.id });
  };

  const onClarify = (command: Extract<JesseCommand, { type: 'clarify' }>): CommandResult => {
    const draft: JesseDraft = {
      instrumentId: command.draft.instrumentId ?? null,
      side: command.draft.side ?? null,
      unit: command.draft.unit ?? null,
      amount: command.draft.amount ?? null,
    };
    if (!isValidPartialDraft(draft)) {
      return result('rejected', 'That correction does not form a valid partial instruction — nothing was changed.');
    }
    try {
      saveJesseDraft(storage, draft); // checkpoint first: no state change without persistence
    } catch {
      return result('rejected', 'The draft could not be saved in this browser.');
    }
    state.draft = draft;
    clearQuoteAuthority(); // any quote under review is now obsolete
    if (state.stage === 'review' || state.stage === 'quoting') {
      state.stage = 'draft';
      state.requestRevision = null;
    }
    state.revision += 1;
    return { status: 'clarify', revision: state.revision, quoteId: null, evidenceId: null, spokenText: speak({ kind: 'clarify', question: command.question }) };
  };

  const onCompare = async (command: Extract<JesseCommand, { type: 'compare' }>): Promise<CommandResult> => {
    if (!catalogInstrument(command.instrumentId)) {
      return result('rejected', 'That product is outside Jesse’s verified catalog. Nothing was changed.');
    }
    if (state.draft.instrumentId && state.draft.instrumentId !== command.instrumentId) {
      return clarifyAsk(
        `Your ticket is working on ${symbolOf(state.draft.instrumentId)}. Do you want to compare ${symbolOf(command.instrumentId)} instead, or keep ${symbolOf(state.draft.instrumentId)}?`,
      );
    }
    /* Bind acceptance like the quote path: a newer command issued while the
       reader is in flight kills this response, so stale evidence can never
       land on top of a desk that already moved on. */
    const requestRevision = state.revision;
    const generation = state.sessionGeneration;
    let comparison: MarketComparison | null;
    try {
      comparison = await ports.compare(command.instrumentId);
    } catch {
      if (state.revision !== requestRevision || state.sessionGeneration !== generation) {
        return result('stale', 'A newer instruction replaced that comparison request before it landed.');
      }
      return result('rejected', speak({ kind: 'compare-unavailable', instrumentId: command.instrumentId }));
    }
    if (state.revision !== requestRevision || state.sessionGeneration !== generation) {
      return result('stale', 'A newer instruction replaced that comparison request before it landed.');
    }
    if (!comparison || comparison.instrumentId !== command.instrumentId) {
      return result('rejected', speak({ kind: 'compare-unavailable', instrumentId: command.instrumentId }));
    }
    state.comparison = comparison;
    state.revision += 1;
    return result('applied', speak({ kind: 'compare-presented', comparison }), { evidenceId: comparison.id });
  };

  const onExplain = (command: Extract<JesseCommand, { type: 'explain' }>): CommandResult =>
    result('applied', EXPLANATIONS[command.topic], {
      quoteId: state.quote?.id ?? null,
      evidenceId: state.comparison?.id ?? null,
    });

  const onDescribe = (): CommandResult => {
    const parts: string[] = [];
    const d = state.draft;
    if (d.instrumentId) {
      const symbol = symbolOf(d.instrumentId);
      if (d.side && d.unit && d.amount) parts.push(`Working instruction: ${d.side} ${d.amount} ${d.unit} of ${symbol}.`);
      else parts.push(`Working on ${symbol}, with some details still open.`);
    } else {
      parts.push('No instrument chosen yet.');
    }
    if (state.stage === 'quoting') parts.push('An estimate is on its way.');
    if (state.stage === 'review' && state.quote) {
      parts.push(`Under review: spend ${state.quote.inputAmount} ${state.quote.inputSymbol}, receive about ${state.quote.outputAmount} ${state.quote.outputSymbol}. Nothing is filed yet.`);
    }
    if (state.stage === 'saved' && state.quote) parts.push('That instruction was filed as a paper record.');
    if (state.stage === 'cancelled') parts.push('The last estimate was set aside; nothing was filed.');
    if (state.comparison) {
      parts.push(state.comparison.status === 'comparable' && state.comparison.referenceDifferenceBps !== null
        ? `Reference difference on screen: ${state.comparison.referenceDifferenceBps} basis points.`
        : 'The market evidence on screen is not currently comparable.');
    }
    if (state.presentation.focus !== 'desk') parts.push(`Focus is on the ${state.presentation.focus}.`);
    return result('applied', parts.join(' '), {
      quoteId: state.quote?.id ?? null,
      evidenceId: state.comparison?.id ?? null,
    });
  };

  const onFocus = (command: Extract<JesseCommand, { type: 'focus' }>): CommandResult => {
    const { target, objectId } = command;
    /* Focus may select only a known object on the active desk; it never
       mutates, quotes, files, grants access, or submits (§4.5). */
    if (target === 'desk') {
      if (objectId !== null) return clarifyAsk('Do you want the desk, or a specific object on it?');
    } else if (target === 'instruction') {
      if (objectId !== null && objectId !== state.quote?.id) {
        return clarifyAsk('There is no estimate on the desk by that name — did you mean the current instruction?');
      }
      if (objectId === null && !state.quote && state.stage !== 'quoting') {
        return clarifyAsk('There is no estimate on the desk right now — did you mean the working draft?');
      }
    } else if (target === 'evidence') {
      if (!state.comparison || objectId !== state.comparison.id) {
        return clarifyAsk('There is no market evidence on the desk by that name — which evidence did you mean?');
      }
    } else if (target === 'record') {
      if (!objectId) return clarifyAsk('Which filed record did you mean?');
      let known = state.stage === 'saved' && state.quote?.id === objectId;
      if (!known) {
        let records: JessePaperRecord[];
        try {
          records = loadJessePaperRecords(storage);
        } catch {
          return result('rejected', 'Paper records could not be read just now.');
        }
        known = records.some(record => record.id === objectId);
      }
      if (!known) return clarifyAsk('I don’t have a filed record by that name on this desk — which record did you mean?');
    } else {
      return clarifyAsk('What would you like brought forward?');
    }
    state.presentation = applyJesseFocus(state.presentation, target, objectId);
    try {
      saveJessePresentation(storage, state.presentation);
    } catch {
      return result('rejected', 'The presentation preference could not be saved in this browser.');
    }
    // Presentation-only: no revision bump (§4.7).
    return result('applied', speak({ kind: 'focus', target, objectId }), {
      quoteId: state.quote?.id ?? null,
      evidenceId: state.comparison?.id ?? null,
    });
  };

  const onWatch = (command: Extract<JesseCommand, { type: 'watch' }>): CommandResult => {
    const instrument = catalogInstrument(command.instrumentId);
    if (!instrument) {
      return result('rejected', 'That product is outside Jesse’s verified catalog. Nothing was changed.');
    }
    const previous = state.watches;
    const watching = !previous.includes(command.instrumentId);
    const next = watching
      ? [...previous, command.instrumentId]
      : previous.filter(id => id !== command.instrumentId);
    try {
      saveJesseWatches(storage, next);
    } catch {
      return result('rejected', 'The watch list could not be saved in this browser.');
    }
    state.watches = next;
    state.revision += 1;
    return result('applied', speak({ kind: 'watch', instrument, watching }));
  };

  const onCancel = (): CommandResult => {
    if (state.stage === 'quoting') {
      state.stage = 'draft';
      state.requestRevision = null;
      state.revision += 1; // invalidates the pending request: revision !== requestRevision
      return result('applied', speak({ kind: 'cancelled', what: 'quote-request' }));
    }
    if (state.stage === 'review') {
      clearQuoteAuthority();
      state.stage = 'cancelled'; // the draft is kept
      state.revision += 1;
      return result('applied', speak({ kind: 'cancelled', what: 'review' }));
    }
    state.revision += 1;
    return result('rejected', 'Nothing to cancel.');
  };

  const onFilePaper = (command: Extract<JesseCommand, { type: 'file-paper' }>): CommandResult => {
    const quote = state.quote;
    const isReviewOf = state.stage === 'review' && quote !== null && quote.id === command.quoteId;
    const isRepeatOfSaved = state.stage === 'saved' && quote !== null && quote.id === command.quoteId;
    if (!isReviewOf && !isRepeatOfSaved) {
      if (quote && quote.id !== command.quoteId) {
        return result('rejected', 'That is not the estimate under review. Nothing was filed.');
      }
      return result('rejected', 'There is no reviewed estimate to file. Ask for an estimate first.');
    }
    if (!state.presentedInstrument || !quote) {
      return result('rejected', 'There is no reviewed estimate to file. Ask for an estimate first.');
    }
    if (now() >= quote.expiresAt) {
      return result('rejected', 'That estimate has expired. Ask for a fresh one before filing.');
    }
    const comparison = state.comparison && state.comparison.instrumentId === quote.intent.instrumentId
      ? state.comparison
      : null;
    let record: JessePaperRecord;
    try {
      record = saveJessePaperRecord(
        storage,
        { quote, instrument: state.presentedInstrument, comparison },
        now(),
      );
    } catch (err) {
      return result('rejected', err instanceof Error ? err.message : 'The paper record could not be filed.');
    }
    state.stage = 'saved';
    if (isReviewOf) state.revision += 1; // a repeat filing changes nothing — and bumps nothing
    return result('applied', speak({ kind: 'filed', record }), { quoteId: record.id });
  };

  /* public API */

  return {
    getState(): Readonly<JesseDeskState> {
      return {
        revision: state.revision,
        sessionGeneration: state.sessionGeneration,
        draft: state.draft,
        stage: state.stage,
        quote: state.quote,
        presentedInstrument: state.presentedInstrument,
        comparison: state.comparison,
        presentation: state.presentation,
        watches: state.watches,
      };
    },

    async applyJesseCommand(command: JesseCommand, expected: DeskRevision): Promise<CommandResult> {
      const stale = guard(expected);
      if (stale) return stale;
      switch (command.type) {
        case 'draft': return onDraft(command);
        case 'clarify': return onClarify(command);
        case 'compare': return onCompare(command);
        case 'explain': return onExplain(command);
        case 'describe': return onDescribe();
        case 'focus': return onFocus(command);
        case 'watch': return onWatch(command);
        case 'cancel': return onCancel();
        case 'file-paper': return onFilePaper(command);
        default:
          return result('rejected', 'That is not something Jesse’s desk can do. Nothing was changed.');
      }
    },

    setPresentationMode(mode: DeskPresentation | 'night' | 'direct'): { ok: boolean; spokenText: string } {
      const view = normalizeDeskPresentation(mode);
      if (!view) {
        return { ok: false, spokenText: 'View must be room or compact.' };
      }
      state.presentation = switchJessePresentation(state.presentation, view);
      try {
        saveJessePresentation(storage, state.presentation);
      } catch {
        return { ok: false, spokenText: 'The presentation preference could not be saved in this browser.' };
      }
      return {
        ok: true,
        spokenText: view === 'room'
          ? 'Room view — the instruction is unchanged.'
          : 'Compact view — the instruction is unchanged.',
      };
    },

    endSession(): void {
      state.sessionGeneration += 1;
      if (state.stage === 'quoting') {
        state.stage = 'draft';
        state.requestRevision = null;
      }
    },

    restore(): void {
      state.draft = loadJesseDraft(storage);
      state.watches = loadJesseWatches(storage);
      state.presentation = loadJessePresentation(storage);
    },
  };
}
