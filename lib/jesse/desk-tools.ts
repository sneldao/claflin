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
