/**
 * Pure decision layer behind Isabel's ConvAI client tools — same role as
 * lib/jesse/voice-tools.ts. Policy lives here so the call surface cannot
 * forget archive/missing guards or invent catalog aliases.
 *
 * Isabel's desk is paper-only on Robinhood Chain: USDG spends for buys,
 * whole-token units for sells, Lighter-book estimates, three-way evidence
 * (issuer quote, onchain mark, venue book) — labelled, never blended.
 */
import { ROBINHOOD_INSTRUMENTS } from './catalog';
import { brokerBio } from '../desk/broker-voice';
import { formatRecordedTime } from '../trading/desk-documents';
import type { DeskForegroundDocument } from '../desk/contracts';
import type { IsabelDeskState } from './useIsabelDesk';
import type { IsabelPaperRecord } from './paper';
import type { IsabelDraft, RobinhoodInstrument, RobinhoodInstrumentId, RobinhoodPaperEstimate } from './contracts';

export type IsabelExplainTopic = 'reference-difference' | 'market-hours' | 'paper-mode' | 'stock-token' | 'namesake';

const ARCHIVE_READONLY =
  'That filed record is for reading. Return to the instruction to quote or file.';
const RECORD_MISSING = 'That paper record is no longer here.';

/** A decimal short enough to read aloud — same rule Jesse applies. Spoken
 *  text only, never stored. */
export function spokenAmount(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return raw;
  const rounded = n.toPrecision(4);
  if (rounded.includes('e')) return raw;
  return rounded.includes('.') ? rounded.replace(/0+$/, '').replace(/\.$/, '') : rounded;
}

export function isabelForegroundGuard(foreground: DeskForegroundDocument): string | null {
  if (foreground.kind === 'missing') return RECORD_MISSING;
  if (foreground.kind === 'archive') return ARCHIVE_READONLY;
  return null;
}

/** The part before the issuer's bullet — "Apple • Robinhood Token" → "Apple". */
function shortCompany(name: string): string {
  return name.split('•')[0]?.trim() || name;
}

/** Resolve a spoken company or ticker to a catalogued Robinhood token.
 *  Unknown → null; never a guess. */
export function resolveRobinhoodAlias(query: string): RobinhoodInstrument | null {
  const raw = query.trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s._-]+/g, '');
  for (const instrument of ROBINHOOD_INSTRUMENTS) {
    const keys = [
      instrument.symbol.toLowerCase(),
      instrument.underlyingSymbol.toLowerCase(),
      shortCompany(instrument.name).toLowerCase(),
    ];
    if (keys.some(k => k === raw || k.replace(/[\s._-]+/g, '') === compact)) return instrument;
  }
  /* Common spoken forms that are not the raw company string. */
  const spoken: Record<string, string> = {
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'facebook': 'META',
    'microstrategy': 'MSTR',
    'spacex': 'SPCX',
    'space x': 'SPCX',
    'circle': 'CRCL',
    'coreweave': 'CRWV',
    'sandisk': 'SNDK',
    'usa rare earth': 'USAR',
    'rare earth': 'USAR',
    'silver trust': 'SLV',
    'silver': 'SLV',
    'treasury bond': 'SGOV',
    'oil fund': 'USO',
    's&p 500': 'SPY',
    's and p': 'SPY',
    'qqq': 'QQQ',
    'nasdaq': 'QQQ',
  };
  const hit = spoken[raw] ?? spoken[raw.replace(/\s+/g, ' ')];
  if (hit) return ROBINHOOD_INSTRUMENTS.find(i => i.symbol === hit) ?? null;
  return null;
}

export function chooseRobinhoodInstrumentResult(query: string): string {
  const instrument = resolveRobinhoodAlias(query);
  if (!instrument) {
    return `"${query || 'That'}" is not on this desk. The book carries ${ROBINHOOD_INSTRUMENTS.length} Robinhood stock tokens — the majors like Apple, NVIDIA, Tesla, plus funds like SPY and QQQ. Ask for one by company or ticker.`;
  }
  return `${instrument.symbol} (${shortCompany(instrument.name)}) is on the ticket.`;
}

export function isabelSymbol(instrumentId: RobinhoodInstrumentId | null | undefined): string {
  if (!instrumentId) return 'this mark';
  return ROBINHOOD_INSTRUMENTS.find(i => i.id === instrumentId)?.symbol ?? 'this mark';
}

function isabelInstrument(instrumentId: RobinhoodInstrumentId | null | undefined): RobinhoodInstrument | undefined {
  if (!instrumentId) return undefined;
  return ROBINHOOD_INSTRUMENTS.find(i => i.id === instrumentId);
}

const ISABEL_EXPLANATIONS: Record<IsabelExplainTopic, string> = {
  'reference-difference':
    'This desk reads three tapes for the same token: the issuer’s quote, the onchain Chainlink mark, and the venue book on Lighter. They are shown side by side, labelled, never blended into one number. When they cannot be aligned on timing or units, the desk says so instead of showing a difference.',
  'market-hours':
    'The underlying equities trade during US market hours, but the venue and the chain read around the clock. Outside equity hours the issuer quote may be stale or absent — the desk labels what it is actually reading rather than presenting a live mark it does not have.',
  'paper-mode':
    'Isabel is a paper desk. An estimate is a read of the visible Lighter book, and filing a paper record only saves a local record in this browser. No wallet is touched, no order is routed, and nothing settles on any network.',
  'stock-token':
    'These are stock tokens issued by Robinhood Assets Jersey — tokens that track listed US equities and funds on Robinhood Chain. They are not exchange orders, and they carry the issuer’s own eligibility terms. On this desk they are for paper records only.',
  /* The namesake story — the same reviewed text the nameplate shows. */
  'namesake': brokerBio('isabel') ?? '',
};

export function resolveIsabelExplainTopic(query: string): IsabelExplainTopic | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (/reference|difference|spread|basis\s*points?|three[\s-]?way|duplex|triplex|evidence/.test(q)) {
    return 'reference-difference';
  }
  if (/hours|session|closed|market\s*open|after[\s-]?hours|weekend|overnight/.test(q)) {
    return 'market-hours';
  }
  if (/paper|simulation|local\s*record|no\s*wallet|real|live|funds|settle|execut/.test(q)) {
    return 'paper-mode';
  }
  if (/namesake|name(d)?\s+(for|after)|who\s+(are|r)\s+you|who is isabel|benham|railroad\s*lady/.test(q)) {
    return 'namesake';
  }
  if (/stock\s*token|robinhood|issu\w+|jersey|eligib|usdg|token/.test(q)) {
    return 'stock-token';
  }
  return null;
}

export function isabelExplainTopicChoices(): string {
  return 'reference-difference, market-hours, paper-mode, stock-token, namesake';
}

export function explainIsabelTopic(topic: IsabelExplainTopic): string {
  return ISABEL_EXPLANATIONS[topic];
}

/** Side flip clears amount — 100 USDG is never 100 tokens. */
export function nextIsabelInstructionDraft(
  draft: IsabelDraft,
  side: 'buy' | 'sell',
): { draft: IsabelDraft; amountCleared: boolean } {
  if (draft.side === side) {
    return { draft: { ...draft, side }, amountCleared: false };
  }
  const hadAmount = Boolean(draft.amount);
  return {
    draft: { ...draft, side, amount: null },
    amountCleared: hadAmount,
  };
}

export function setIsabelInstructionResult(side: string, amountCleared = false): string {
  if (side === 'buy') {
    return amountCleared
      ? 'Buy set — the old token quantity was cleared. Ask for a USDG spend before quoting.'
      : 'Buy set — the amount is a USDG spend.';
  }
  if (side === 'sell') {
    return amountCleared
      ? 'Sell set — the old USDG spend was cleared. Ask for token units before quoting.'
      : 'Sell set — the amount is token units.';
  }
  return 'The instruction must be buy or sell.';
}

export function setIsabelAmountResult(side: 'buy' | 'sell' | null, amount: string): string {
  if (side === 'sell') return `${amount} token units is on the ticket.`;
  if (side === 'buy') return `${amount} USDG is on the ticket.`;
  return `${amount} is on the ticket — say buy or sell so the units are clear.`;
}

export function describeEstimateTerms(quote: RobinhoodPaperEstimate): string {
  return `${quote.intent.side} — spend ${spokenAmount(quote.inputAmount)} ${quote.inputSymbol}, receive about ${spokenAmount(quote.outputAmount)} ${quote.outputSymbol}, on the Lighter book, paper only.`;
}

/**
 * Context-aware opening: recognition before interrogation — same rule as
 * the other lines.
 */
export function isabelOpeningLine(state: IsabelDeskState, foreground: DeskForegroundDocument): string {
  if (foreground.kind === 'missing') {
    return 'Claflin, Isabel speaking. That record is no longer here. Shall we return to the instruction?';
  }
  if (foreground.kind === 'archive' || foreground.kind === 'receipt') {
    return 'Claflin, Isabel speaking. You are looking at a filed paper record. Shall we go through it?';
  }
  if (foreground.kind === 'pending') {
    return 'Claflin, Isabel speaking. An estimate is on its way. Shall we wait for it together?';
  }
  if (foreground.kind === 'quotation') {
    return 'Claflin, Isabel speaking. Your quotation is on the slip — the Lighter book, paper only. What would you like to clarify?';
  }
  const draft = state.draft;
  const instrument = isabelInstrument(draft.instrumentId);
  const company = instrument ? shortCompany(instrument.name) : null;
  if (company && draft.side && draft.amount) {
    const unit = draft.side === 'buy' ? 'USDG' : 'token units';
    return `Claflin, Isabel speaking. You have a ${company} ${draft.side} for ${draft.amount} ${unit}. Shall we check the estimate?`;
  }
  if (company && draft.side) {
    return `Claflin, Isabel speaking. You have a ${company} ${draft.side} started — add the amount when ready.`;
  }
  if (company) {
    return `Claflin, Isabel speaking. ${company} is on the ticket. Buy with USDG, or sell token units?`;
  }
  return 'Claflin, Isabel speaking. Robinhood Chain desk — paper only. What shall we put on the ticket?';
}

export function isabelClosingLine(
  state: IsabelDeskState,
  foreground: DeskForegroundDocument,
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

function describeIsabelRecord(record: IsabelPaperRecord): string {
  const q = record.quote;
  const sym = record.instrumentSnapshot.symbol;
  return q.intent.side === 'buy'
    ? `buy of ${spokenAmount(q.inputAmount)} USDG for ${sym}, filed at ${formatRecordedTime(record.createdAt)}`
    : `sell of ${spokenAmount(q.inputAmount)} ${sym} for USDG, filed at ${formatRecordedTime(record.createdAt)}`;
}

/** Match a spoken description to a filed record — newest first, narrowed by
 *  company and buy/sell. No description means the record on screen, else the
 *  latest. Nothing matching is null, never a guess. */
export function findIsabelRecord(
  records: IsabelPaperRecord[],
  onScreenId: string | null,
  query: string,
): IsabelPaperRecord | null {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) return null;
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const instrument = resolveRobinhoodAlias(query) ?? words.map(w => resolveRobinhoodAlias(w)).find(Boolean) ?? null;
  const side = words.includes('buy') || words.includes('bought') ? 'buy'
    : words.includes('sell') || words.includes('sold') ? 'sell' : null;
  if (!instrument && !side) {
    const onScreen = onScreenId ? sorted.find(r => r.id === onScreenId) : null;
    return onScreen ?? sorted[0];
  }
  return sorted.find(r =>
    (!instrument || r.instrumentSnapshot.symbol === instrument.symbol)
    && (!side || r.quote.intent.side === side)) ?? null;
}

export function describeIsabelRecordFor(record: IsabelPaperRecord): string {
  return describeIsabelRecord(record);
}

export function describeIsabelDesk(
  state: IsabelDeskState,
  foreground: DeskForegroundDocument,
  records: IsabelPaperRecord[],
): string {
  const parts: string[] = [];
  if (foreground.kind === 'missing') {
    parts.push(RECORD_MISSING);
  } else if (foreground.kind === 'archive') {
    const record = records.find(r => r.id === foreground.recordId);
    parts.push(record
      ? `The ticket is showing a filed paper record, read-only: ${describeIsabelRecord(record)}. Return to the instruction to quote or file.`
      : RECORD_MISSING);
  } else if (foreground.kind === 'receipt' && state.quote) {
    parts.push(`The current instruction is filed: ${describeEstimateTerms(state.quote)}`);
  } else {
    const draft = state.draft;
    parts.push(draft.instrumentId ? `Instrument: ${isabelSymbol(draft.instrumentId)}.` : 'No instrument chosen.');
    if (draft.side && draft.amount) {
      parts.push(`${draft.side} ${draft.amount} ${draft.side === 'buy' ? 'USDG' : 'token units'}.`);
    } else if (draft.side) {
      parts.push(`${draft.side} set — no amount yet.`);
    } else {
      parts.push('No amount set.');
    }
    if (foreground.kind === 'quotation' && state.quote) {
      parts.push(`Estimate under review: ${describeEstimateTerms(state.quote)}`);
    }
    if (foreground.kind === 'pending') parts.push('A Lighter-book estimate is on its way.');
  }
  if (records.length) parts.push(`${records.length} paper record${records.length === 1 ? '' : 's'} in the ledger.`);
  return parts.join(' ');
}

export function appliedIsabelTicketLine(state: IsabelDeskState, foreground: DeskForegroundDocument): string | null {
  if (foreground.kind === 'quotation' && state.quote) {
    return `On the ticket: ${describeEstimateTerms(state.quote)}`;
  }
  const d = state.draft;
  if (!d.instrumentId && !d.side && !d.amount) return null;
  const symbol = isabelSymbol(d.instrumentId);
  if (d.side && d.amount) return `On the ticket: ${d.side} ${d.amount} ${d.side === 'buy' ? 'USDG' : 'token units'} of ${symbol}.`;
  if (d.instrumentId) return `On the ticket: ${symbol}${d.side ? ` · ${d.side}` : ''}.`;
  return null;
}

/** One line describing the evidence tape's posture for the line to say. */
export function describeIsabelEvidence(state: IsabelDeskState): string {
  const evidence = state.evidence;
  if (!evidence) {
    return 'The evidence tape arrives beside the estimate — issuer quote, onchain mark, and venue book, side by side. Ask for the estimate first.';
  }
  if (evidence.status !== 'comparable') {
    return 'The evidence could not be compared this time — the desk labels what it could and could not read. The estimate on the slip still stands on the venue book alone.';
  }
  const legs: string[] = [];
  if (evidence.issuer) legs.push('issuer quote');
  if (evidence.onchain) legs.push(`onchain mark at about ${spokenAmount(evidence.onchain.priceUsd)} dollars`);
  if (evidence.venue) legs.push('venue book');
  return `The three-way tape is on the slip: ${legs.join(', ')} — labelled, never blended.`;
}
