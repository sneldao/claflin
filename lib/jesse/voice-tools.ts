/**
 * Pure decision layer behind Jesse's ConvAI client tools.
 * Policy lives here so the call surface cannot forget archive/missing guards
 * or invent Solana catalog aliases.
 */
import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import type { JesseDeskState } from '../solana/controller';
import type { JesseForeground } from '../solana/desk-documents';
import type { JesseDraft, SolanaInstrument, SolanaInstrumentId } from '../solana/contracts';
import type { JessePaperRecord } from '../solana/paper';

export type ExplainTopic = 'reference-difference' | 'market-hours' | 'scaled-units' | 'paper-mode';

const ARCHIVE_READONLY =
  'That filed record is for reading. Return to the instruction to quote or file.';
const RECORD_MISSING = 'That paper record is no longer here.';

export function jesseForegroundGuard(foreground: JesseForeground): string | null {
  if (foreground.kind === 'missing') return RECORD_MISSING;
  if (foreground.kind === 'archive') return ARCHIVE_READONLY;
  return null;
}

/** Resolve a spoken company/ticker to an allowlisted xStock. Unknown → null. */
export function resolveSolanaAlias(query: string): SolanaInstrument | null {
  const raw = query.trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s._-]+/g, '');
  for (const instrument of SOLANA_INSTRUMENTS) {
    const keys = [
      instrument.symbol.toLowerCase(),
      instrument.underlyingSymbol.toLowerCase(),
      instrument.name.toLowerCase(),
      instrument.symbol.toLowerCase().replace(/x$/, ''),
    ];
    if (keys.some(k => k === raw || k.replace(/[\s._-]+/g, '') === compact)) return instrument;
  }
  /* Common spoken forms */
  if (/^apple(xstock)?$/.test(compact) || compact === 'aaplx') {
    return SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx') ?? null;
  }
  if (/^nvidia(xstock)?$/.test(compact) || compact === 'nvdax') {
    return SOLANA_INSTRUMENTS.find(i => i.symbol === 'NVDAx') ?? null;
  }
  if (/^tesla(xstock)?$/.test(compact) || compact === 'tslax') {
    return SOLANA_INSTRUMENTS.find(i => i.symbol === 'TSLAx') ?? null;
  }
  return null;
}

export function chooseSolanaInstrumentResult(query: string): string {
  const instrument = resolveSolanaAlias(query);
  if (!instrument) {
    const supported = SOLANA_INSTRUMENTS.map(s => s.symbol).join(', ');
    return `"${query || 'That'}" is not on this desk. Supported: ${supported} — Backed xStocks on Solana.`;
  }
  return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
}

export function jesseSymbol(instrumentId: SolanaInstrumentId | null | undefined): string {
  if (!instrumentId) return 'this mark';
  return SOLANA_INSTRUMENTS.find(i => i.id === instrumentId)?.symbol ?? 'this mark';
}

export function resolveExplainTopic(query: string): ExplainTopic | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (q === 'reference-difference' || /reference|difference|spread|basis\s*points?|equity|versus|\bvs\b/.test(q)) {
    return 'reference-difference';
  }
  if (q === 'market-hours' || /hours|session|closed|market\s*open|after[\s-]?hours/.test(q)) {
    return 'market-hours';
  }
  if (q === 'scaled-units' || /scaled|multiplier|token-?2022|display\s*unit|raw\s*token/.test(q)) {
    return 'scaled-units';
  }
  if (q === 'paper-mode' || /paper|simulation|local\s*record|no\s*wallet/.test(q)) {
    return 'paper-mode';
  }
  return null;
}

export function explainTopicChoices(): string {
  return 'reference-difference, market-hours, scaled-units, paper-mode';
}

function shortCompany(name: string): string {
  const head = name.split(',')[0]?.trim() ?? name;
  return head.replace(/\s+xStock.*$/i, '').trim() || head;
}

/**
 * Context-aware opening: recognition before interrogation.
 */
export function jesseOpeningLine(state: JesseDeskState, foreground: JesseForeground): string {
  if (foreground.kind === 'missing') {
    return 'Claflin, Jesse speaking. That record is no longer here. Shall we return to the instruction?';
  }
  if (foreground.kind === 'archive' || foreground.kind === 'receipt') {
    return 'Claflin, Jesse speaking. You are looking at a filed paper record. Shall we go through it?';
  }
  if (foreground.kind === 'pending') {
    return 'Claflin, Jesse speaking. An estimate is on its way. Shall we wait for it together?';
  }
  if (foreground.kind === 'quotation') {
    return 'Claflin, Jesse speaking. Your quotation is on the slip — Jupiter, Metis, paper only. What would you like to clarify?';
  }
  const draft = state.draft;
  const instrument = draft.instrumentId
    ? SOLANA_INSTRUMENTS.find(i => i.id === draft.instrumentId)
    : undefined;
  const company = instrument ? shortCompany(instrument.name) : null;
  if (company && draft.side && draft.amount) {
    const unit = draft.side === 'buy' ? 'USDC' : 'scaled units';
    return `Claflin, Jesse speaking. You have a ${company} ${draft.side} for ${draft.amount} ${unit}. Shall we check the estimate?`;
  }
  if (company && draft.side) {
    return `Claflin, Jesse speaking. You have a ${company} ${draft.side} started — add the amount when ready.`;
  }
  if (company) {
    return `Claflin, Jesse speaking. ${company} is on the ticket. Buy with USDC, or sell scaled units?`;
  }
  return 'Claflin, Jesse speaking. Solana desk — paper only. What shall we put on the ticket?';
}

export function jesseClosingLine(
  state: JesseDeskState,
  foreground: JesseForeground,
  reason: 'ended' | 'dropped',
): string {
  if (foreground.kind === 'receipt' || state.stage === 'saved') {
    return reason === 'dropped'
      ? 'The line dropped. Your paper record is still in the ledger — nothing moved onchain.'
      : "It's in your paper ledger. No funds moved.";
  }
  if (foreground.kind === 'quotation') {
    return reason === 'dropped'
      ? 'The line dropped. The estimate is still on the slip until it expires.'
      : 'The draft is still on your desk. Nothing was filed.';
  }
  if (state.draft.instrumentId || state.draft.amount || state.draft.side) {
    return reason === 'dropped'
      ? 'The line dropped. Your draft is still on the ticket.'
      : 'The draft is still on your desk.';
  }
  return reason === 'dropped'
    ? 'The line dropped. Nothing was filed.'
    : 'Nothing was filed.';
}

export function describeJesseDesk(
  state: JesseDeskState,
  foreground: JesseForeground,
  records: JessePaperRecord[],
): string {
  const parts: string[] = [];
  if (foreground.kind === 'missing') {
    parts.push(RECORD_MISSING);
  } else if (foreground.kind === 'archive') {
    const record = records.find(r => r.id === foreground.recordId);
    if (record) {
      const q = record.quote;
      parts.push(
        `The ticket is showing a filed paper record, read-only: ${q.intent.side} ${q.inputAmount} ${q.inputSymbol} for ${q.outputAmount} ${q.outputSymbol}. Return to the instruction to quote or file.`,
      );
    } else {
      parts.push(RECORD_MISSING);
    }
  } else if (foreground.kind === 'receipt' && state.quote) {
    const q = state.quote;
    parts.push(`The current instruction is filed: ${q.intent.side} ${q.inputAmount} ${q.inputSymbol} for ${q.outputAmount} ${q.outputSymbol}.`);
  } else {
    const draft = state.draft;
    parts.push(draft.instrumentId ? `Instrument: ${jesseSymbol(draft.instrumentId)}.` : 'No instrument chosen.');
    if (draft.side && draft.amount) {
      parts.push(`${draft.side} ${draft.amount} ${draft.side === 'buy' ? 'USDC' : 'scaled units'}.`);
    } else if (draft.side) {
      parts.push(`${draft.side} set — no amount yet.`);
    } else {
      parts.push('No amount set.');
    }
    if (foreground.kind === 'quotation' && state.quote) {
      const q = state.quote;
      parts.push(`Estimate under review: spend ${q.inputAmount} ${q.inputSymbol}, receive ${q.outputAmount} ${q.outputSymbol}, Jupiter Metis.`);
    }
    if (foreground.kind === 'pending') parts.push('A Jupiter estimate is on its way.');
    if (state.comparison) {
      parts.push(`Last comparison status: ${state.comparison.status}.`);
    }
  }
  if (records.length) parts.push(`${records.length} paper record${records.length === 1 ? '' : 's'} in the ledger.`);
  if (state.watches.length) parts.push(`${state.watches.length} watched mark${state.watches.length === 1 ? '' : 's'}.`);
  return parts.join(' ');
}

export function appliedJesseTicketLine(state: JesseDeskState, foreground: JesseForeground): string | null {
  if (foreground.kind === 'quotation' && state.quote) {
    const q = state.quote;
    return `On the ticket: spend ${q.inputAmount} ${q.inputSymbol}, receive ${q.outputAmount} ${q.outputSymbol} (Jupiter · Metis · paper).`;
  }
  const d = state.draft;
  if (!d.instrumentId && !d.side && !d.amount) return null;
  const symbol = jesseSymbol(d.instrumentId);
  if (d.side && d.amount) return `On the ticket: ${d.side} ${d.amount} ${d.side === 'buy' ? 'USDC' : 'scaled units'} of ${symbol}.`;
  if (d.instrumentId) return `On the ticket: ${symbol}${d.side ? ` · ${d.side}` : ''}.`;
  return null;
}

/** Side flip clears amount — 100 USDC is never 100 scaled units. */
export function nextJesseInstructionDraft(
  draft: JesseDraft,
  side: 'buy' | 'sell',
): { draft: JesseDraft; amountCleared: boolean } {
  const unit = side === 'buy' ? 'USDC' : 'scaled-token';
  if (draft.side === side) {
    return { draft: { ...draft, side, unit }, amountCleared: false };
  }
  const hadAmount = Boolean(draft.amount);
  return {
    draft: { ...draft, side, unit, amount: null },
    amountCleared: hadAmount,
  };
}

export function setJesseInstructionResult(side: string, amountCleared = false): string {
  if (side === 'buy') {
    return amountCleared
      ? 'Buy set — the old scaled quantity was cleared. Ask for a USDC spend before quoting.'
      : 'Buy set — the amount is a USDC spend.';
  }
  if (side === 'sell') {
    return amountCleared
      ? 'Sell set — the old USDC spend was cleared. Ask for scaled units before quoting.'
      : 'Sell set — the amount is scaled token units.';
  }
  return 'The instruction must be buy or sell.';
}

export function setJesseAmountResult(side: 'buy' | 'sell' | null, amount: string): string {
  if (side === 'sell') return `${amount} scaled units is on the ticket.`;
  if (side === 'buy') return `${amount} USDC is on the ticket.`;
  return `${amount} is on the ticket — say buy or sell so the units are clear.`;
}
