/**
 * Jesse's voice tools as one table of handlers over the live desk — shared by
 * every provider that carries his line (ElevenLabs ConvAI, AssemblyAI Voice
 * Agent). The policy strings live in ./voice-tools; this file only sequences
 * them against useJesseDesk. Paper only: no handler can sign or submit.
 */
import type { JesseDesk } from '../solana/useJesseDesk';
import type { SlipField } from '../desk/slip-provenance';
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

export type ToolParams = Record<string, unknown>;
export type JesseToolHandler = (params: ToolParams) => Promise<string>;

export interface JesseToolContext {
  /** The desk as it is right now — read fresh on every call. */
  desk: () => JesseDesk;
  /** Mark a tool-applied field as "from the call". */
  markLine: (field: SlipField, value: string) => void;
}

function waitFor(desk: () => JesseDesk, predicate: (d: JesseDesk) => boolean, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (predicate(desk())) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, 120);
    };
    tick();
  });
}

export function jesseToolHandlers({ desk, markLine }: JesseToolContext): Record<JesseToolName, JesseToolHandler> {
  const applied = (status: string) => status === 'applied' || status === 'clarify';

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
      const next = nextJesseInstructionDraft(d.state.draft, side);
      const result = await d.edit(next.draft, 'side');
      if (applied(result.status)) markLine('side', side);
      return setJesseInstructionResult(side, next.amountCleared);
    },

    async set_amount(p) {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      const clean = String(p.amount ?? '').trim();
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
        return `"${clean || 'That'}" is not a usable amount — say a plain number, like 100 or 0.5.`;
      }
      const result = await d.edit({ amount: clean }, 'amount');
      if (applied(result.status)) markLine('amount', clean);
      return setJesseAmountResult(d.state.draft.side, clean);
    },

    async request_estimate() {
      const d = desk();
      const refusal = jesseForegroundGuard(d.foreground);
      if (refusal) return refusal;
      if (d.inFlight === 'quote' || d.state.stage === 'quoting') return 'An estimate is already on its way.';
      const before = d.state.quote?.id;
      await d.quote();
      await waitFor(desk, x => x.state.stage === 'review' || (x.state.stage === 'draft' && x.inFlight === null), 8_000);
      const now = desk();
      if (now.state.stage === 'review' && now.state.quote && now.state.quote.id !== before) {
        return now.lastResult?.spokenText
          ?? `Estimate on the slip: spend ${now.state.quote.inputAmount} ${now.state.quote.inputSymbol}, receive ${now.state.quote.outputAmount} ${now.state.quote.outputSymbol}, Jupiter Metis — paper only.`;
      }
      return now.lastResult?.spokenText ?? 'The estimate did not come through. Offer to adjust or retry.';
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
      await d.compare();
      await waitFor(desk, x => x.inFlight === null, 6_000);
      return desk().lastResult?.spokenText
        ?? 'Comparison is unavailable right now. Say so honestly; independent Jupiter quoting may still work.';
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
