/**
 * Jesse's adapter for the shared slip-provenance grammar: turns a Jesse
 * speech parse into said/kept/inferred marks. All other provenance helpers
 * live in lib/desk/slip-provenance.
 */
import type { JesseDraft } from '../solana/contracts';
import type { JesseSpeechParse } from './speech';
import { provenanceFromFields, type SlipProvenance } from '../desk/slip-provenance';

export function provenanceFromParse(parse: JesseSpeechParse, priorDraft: JesseDraft): SlipProvenance {
  const command = parse.command;
  const fields = command?.type === 'draft'
    ? command.intent
    : command?.type === 'clarify'
      ? command.draft
      : null;
  if (!fields) return {};
  return provenanceFromFields({
    phrase: parse.heard,
    values: {
      instrument: fields.instrumentId,
      side: fields.side,
      amount: fields.amount,
    },
    spans: parse.spans,
    prior: {
      instrument: priorDraft.instrumentId,
      side: priorDraft.side,
      amount: priorDraft.amount,
    },
  });
}
