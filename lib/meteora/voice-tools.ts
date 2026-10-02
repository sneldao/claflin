/**
 * Pure decision layer behind Halley's ConvAI client tools — same role as
 * lib/robinhood/voice-tools.ts. Policy lives here so the call surface
 * cannot forget archive/missing guards or invent launch parameters.
 *
 * Halley's desk drafts Meteora DBC launches: a new tracker token priced on
 * a bonding curve against a verified quote mint (USDC or a badged xStock),
 * opening anchored to an equity's Pyth mark. Paper only — voice may draft,
 * estimate, and file a paper record; it can never sign, submit, or launch.
 */
import { HALLEY_QUOTE_MINTS } from './catalog';
import { LAUNCH_CURVE_PRESETS, type LaunchCurvePreset } from './contracts';
import { SOLANA_INSTRUMENTS } from '../solana/catalog';
import { formatRecordedTime } from '../trading/desk-documents';
import type { DeskForegroundDocument } from '../desk/contracts';
import type { HalleyDeskState } from './useHalleyDesk';
import type { HalleyPaperRecord } from './paper';
import type { HalleyDraft, HalleyLaunchEstimate } from './contracts';

export type HalleyExplainTopic = 'anchor' | 'graduation' | 'tracker-token' | 'curve-shape' | 'paper-mode';

const ARCHIVE_READONLY =
  'That filed record is for reading. Return to the launch slip to draft or file.';
const RECORD_MISSING = 'That paper record is no longer here.';

/** A decimal short enough to read aloud — same rule the other lines apply.
 *  Spoken text only, never stored. */
export function spokenAmount(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return raw;
  const rounded = n.toPrecision(4);
  if (rounded.includes('e')) return raw;
  return rounded.includes('.') ? rounded.replace(/0+$/, '').replace(/\.$/, '') : rounded;
}

export function halleyForegroundGuard(foreground: DeskForegroundDocument): string | null {
  if (foreground.kind === 'missing') return RECORD_MISSING;
  if (foreground.kind === 'archive') return ARCHIVE_READONLY;
  return null;
}

/** Equities a launch can anchor to — the verified Pyth feed set. */
export const HALLEY_ANCHOR_SYMBOLS: readonly string[] =
  SOLANA_INSTRUMENTS.map(i => i.underlyingSymbol);

/** Resolve a spoken company/ticker to an anchor equity symbol, or null. */
export function resolveHalleyAnchor(query: string): string | null {
  const raw = query.trim().toUpperCase();
  if (!raw) return null;
  const spoken: Record<string, string> = {
    APPLE: 'AAPL', NVIDIA: 'NVDA', TESLA: 'TSLA',
  };
  /* Whole-phrase hit first, then word-by-word for 'the Apple stock token'. */
  const direct = spoken[raw] ?? raw;
  if (HALLEY_ANCHOR_SYMBOLS.includes(direct)) return direct;
  for (const word of raw.split(/[^A-Z0-9]+/).filter(Boolean)) {
    const hit = spoken[word] ?? word;
    if (HALLEY_ANCHOR_SYMBOLS.includes(hit)) return hit;
  }
  return null;
}

/** Resolve a spoken quote asset — 'dollars', 'USDC', 'Apple x', 'AAPLx'. */
export function resolveHalleyQuote(query: string): string | null {
  const raw = query.trim().toUpperCase().replace(/[\s._-]+/g, '');
  if (!raw) return null;
  if (['USDC', 'USD', 'DOLLARS', 'DOLLAR', 'USDCOIN'].includes(raw)) return 'USDC';
  const hit = HALLEY_QUOTE_MINTS.find(q => q.symbol.toUpperCase().replace(/[\s._-]+/g, '') === raw);
  if (hit) return hit.symbol;
  /* Spoken forms: "Apple X", "the Apple stock token". */
  const underlying = resolveHalleyAnchor(query);
  if (underlying) {
    const xStock = HALLEY_QUOTE_MINTS.find(q => q.underlyingSymbol === underlying);
    return xStock?.symbol ?? null;
  }
  return null;
}

export function resolveHalleyCurve(query: string): LaunchCurvePreset | null {
  const raw = query.trim().toLowerCase().replace(/[\s_-]+/g, '-');
  if (!raw) return null;
  if (LAUNCH_CURVE_PRESETS.includes(raw as LaunchCurvePreset)) return raw as LaunchCurvePreset;
  if (/^(equity|pair|anchored|anchor)$/.test(raw)) return 'equity-pair';
  if (/^linear$/.test(raw)) return 'flat';
  if (/^(slow|delayed|patient)$/.test(raw)) return 'long';
  if (/^(steep|fast|hockey)$/.test(raw)) return 'exponential';
  return null;
}

const HALLEY_EXPLANATIONS: Record<HalleyExplainTopic, string> = {
  'anchor':
    'Most launches open at zero and let the crowd guess. This desk moors the opening price to a known one — the equity’s Pyth mark for a dollar-quoted launch, or the ratio of two equities for a pair launch. Anchored does not mean pegged: it sets where the curve starts, then the curve does the discovering.',
  'graduation':
    'A launch on this desk lives on a Meteora bonding curve until the graduation line — the amount of quote asset collected that you set on the slip. Crossing it migrates the pool into DAMM v2, a full liquidity venue, with ten percent of the liquidity permanently locked. The estimate’s path shows where that line sits.',
  'tracker-token':
    'The token this desk launches is a tracker — an exposure instrument created fresh on the curve. It is not, and does not claim to be, stock ownership. The xStocks you can quote against are issued by Backed; the house is the venue, never the issuer.',
  'curve-shape':
    'The curve sets how price moves as the token sells. Flat stays near the opening mark. Long holds the early price down for slower discovery. Exponential climbs steeply at the tail. Equity pair is the anchored band — the desk’s differentiator.',
  'paper-mode':
    'Halley’s desk is paper first. An estimate is a projection of the curve you chose — never an order. Filing a paper launch only saves a local record in this browser. Nothing mints, nothing settles, and no wallet is touched. A live launch would always be a separate, signed ceremony.',
};

export function resolveHalleyExplainTopic(query: string): HalleyExplainTopic | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (/anchor|moor|pinned|tied|equity\s*price|fundamental/.test(q)) return 'anchor';
  if (/graduat|migrat|damm|threshold|line/.test(q)) return 'graduation';
  if (/tracker|exposure|ownership|stock|issuer|security/.test(q)) return 'tracker-token';
  if (/curve|shape|flat|long|exponential|band|preset/.test(q)) return 'curve-shape';
  if (/paper|simulation|local\s*record|no\s*wallet|real|live|funds|settle|execut/.test(q)) return 'paper-mode';
  return null;
}

export function halleyExplainTopicChoices(): string {
  return 'anchor, graduation, tracker-token, curve-shape, paper-mode';
}

export function explainHalleyTopic(topic: HalleyExplainTopic): string {
  return HALLEY_EXPLANATIONS[topic];
}

export function describeLaunchTerms(estimate: HalleyLaunchEstimate): string {
  const i = estimate.intent;
  const anchor = estimate.anchor?.status === 'observed'
    ? `anchored to ${estimate.anchor.symbol}`
    : 'unanchored';
  return `${i.symbol} — ${spokenAmount(i.supply)} tokens on a ${i.curve} curve, ${anchor}, opening near ${spokenAmount(estimate.openingPriceQuote)} ${i.quoteSymbol}, graduating at ${spokenAmount(i.graduationQuote)} ${i.quoteSymbol} collected. Paper only.`;
}

/** Context-aware opening — recognition before interrogation. */
export function halleyOpeningLine(state: HalleyDeskState, foreground: DeskForegroundDocument): string {
  if (foreground.kind === 'missing') {
    return 'Claflin, Halley speaking. That record is no longer here. Shall we return to the slip?';
  }
  if (foreground.kind === 'archive' || foreground.kind === 'receipt') {
    return 'Claflin, Halley speaking. You are looking at a filed paper launch. Shall we go through it?';
  }
  if (foreground.kind === 'pending') {
    return 'Claflin, Halley speaking. A curve is being drawn. Shall we wait for it together?';
  }
  if (foreground.kind === 'quotation' && state.estimate) {
    return `Claflin, Halley speaking. The projected curve is on the slip — ${describeLaunchTerms(state.estimate)} What would you like to clarify?`;
  }
  const draft = state.draft;
  if (draft.symbol && draft.quoteSymbol) {
    return `Claflin, Halley speaking. ${draft.symbol} is on the slip, quoted in ${draft.quoteSymbol}. What shall the curve be?`;
  }
  if (draft.symbol) {
    return `Claflin, Halley speaking. ${draft.symbol} is on the slip. Quote it in dollars, or against an xStock?`;
  }
  return 'Claflin, Halley speaking. The launch desk — Meteora curves on Solana, paper first. What shall we launch?';
}

export function halleyClosingLine(
  state: HalleyDeskState,
  foreground: DeskForegroundDocument,
  reason: 'ended' | 'dropped',
): string {
  if (foreground.kind === 'receipt' || state.stage === 'saved') {
    return reason === 'dropped'
      ? 'The line dropped. Your paper launch is still in the ledger — nothing was minted.'
      : "It's in your paper ledger. No mint was created.";
  }
  if (foreground.kind === 'quotation') {
    return reason === 'dropped'
      ? 'The line dropped. The estimate is still on the slip until it expires.'
      : 'The draft is still on your desk. Nothing was filed.';
  }
  if (state.draft.symbol || state.draft.name) {
    return reason === 'dropped'
      ? 'The line dropped. Your draft is still on the slip.'
      : 'The draft is still on your desk.';
  }
  return reason === 'dropped'
    ? 'The line dropped. Nothing was filed.'
    : 'Nothing was filed.';
}

function describeHalleyRecord(record: HalleyPaperRecord): string {
  const i = record.estimate.intent;
  return `launch of ${i.symbol}, quoted in ${i.quoteSymbol} on a ${i.curve} curve, filed at ${formatRecordedTime(record.createdAt)}`;
}

/** Match a spoken description to a filed launch record — newest first,
 *  narrowed by the launch symbol or quote asset. No description means the
 *  record on screen, else the latest. Nothing matching is null. */
export function findHalleyRecord(
  records: HalleyPaperRecord[],
  onScreenId: string | null,
  query: string,
): HalleyPaperRecord | null {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) return null;
  const words = query.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const symbol = words.find(w => sorted.some(r => r.estimate.intent.symbol === w)) ?? null;
  const quote = words.map(resolveHalleyQuote).find(Boolean) ?? null;
  if (!symbol && !quote) {
    const onScreen = onScreenId ? sorted.find(r => r.id === onScreenId) : null;
    return onScreen ?? sorted[0];
  }
  return sorted.find(r =>
    (!symbol || r.estimate.intent.symbol === symbol)
    && (!quote || r.estimate.intent.quoteSymbol === quote)) ?? null;
}

export function describeHalleyRecordFor(record: HalleyPaperRecord): string {
  return describeHalleyRecord(record);
}

export function describeHalleyDesk(
  state: HalleyDeskState,
  foreground: DeskForegroundDocument,
  records: HalleyPaperRecord[],
): string {
  const parts: string[] = [];
  if (foreground.kind === 'missing') {
    parts.push(RECORD_MISSING);
  } else if (foreground.kind === 'archive') {
    const record = records.find(r => r.id === foreground.recordId);
    parts.push(record
      ? `The ticket is showing a filed paper launch, read-only: ${describeHalleyRecord(record)}. Return to the slip to draft or file.`
      : RECORD_MISSING);
  } else if (foreground.kind === 'receipt' && state.estimate) {
    parts.push(`The current launch is filed: ${describeLaunchTerms(state.estimate)}`);
  } else {
    const draft = state.draft;
    parts.push(draft.symbol ? `Launching ${draft.symbol} (${draft.name ?? 'unnamed'}).` : 'No launch named yet.');
    if (draft.quoteSymbol) parts.push(`Quoted in ${draft.quoteSymbol}.`);
    if (draft.anchorSymbol) parts.push(`Anchored to ${draft.anchorSymbol}.`);
    if (draft.curve) parts.push(`Curve: ${draft.curve}.`);
    if (draft.graduationQuote) parts.push(`Graduating at ${draft.graduationQuote} ${draft.quoteSymbol ?? 'quote'}.`);
    if (foreground.kind === 'quotation' && state.estimate) {
      parts.push(`Estimate under review: ${describeLaunchTerms(state.estimate)}`);
    }
    if (foreground.kind === 'pending') parts.push('A launch estimate is on its way.');
  }
  if (records.length) parts.push(`${records.length} paper launch${records.length === 1 ? '' : 'es'} in the ledger.`);
  return parts.join(' ');
}

export function appliedHalleyTicketLine(state: HalleyDeskState, foreground: DeskForegroundDocument): string | null {
  if (foreground.kind === 'quotation' && state.estimate) {
    return `On the slip: ${describeLaunchTerms(state.estimate)}`;
  }
  const d = state.draft;
  if (!d.symbol && !d.name) return null;
  const bits = [d.symbol ?? d.name];
  if (d.quoteSymbol) bits.push(`in ${d.quoteSymbol}`);
  if (d.anchorSymbol) bits.push(`anchored to ${d.anchorSymbol}`);
  return `On the slip: ${bits.join(' ')}.`;
}
