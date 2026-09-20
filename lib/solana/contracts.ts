/**
 * Solana desk contracts — the frozen shared shapes from the Stocklana build
 * plan (§4.1, §4.2, §4.4, §4.5, §4.7). Client-safe: no server imports, no
 * env access, no dependencies. Engineers 2–4 build against these types;
 * only the contract owner edits them.
 *
 * Every raw quantity and price is a serialized string — no floats cross this
 * boundary. Base instrument ids and stored raw amounts stay byte-identical;
 * Solana mint ids keep their exact mixed case.
 */

import type { QuoteEstimate } from '../trading/domain';

// §4.1 — instruments, intent, capabilities.

export type SolanaNetwork = 'solana:mainnet';
export type SolanaInstrumentId = `sol:${string}`;
export type JesseIntent =
  | { instrumentId: SolanaInstrumentId; side: 'buy'; unit: 'USDC'; amount: string }
  | { instrumentId: SolanaInstrumentId; side: 'sell'; unit: 'scaled-token'; amount: string };

export interface SolanaInstrument {
  id: SolanaInstrumentId;
  network: SolanaNetwork;
  deskId: 'jesse';
  mint: string;
  symbol: string;
  name: string;
  underlyingSymbol: string;
  decimals: number;
  tokenProgram: 'spl-token-2022';
  issuer: string;
  termsUrl: string;
  identitySourceUrl: string;
  verifiedAt: number;
  quoteSupported: boolean;
}

export interface DeskCapabilities {
  quote: boolean;
  paper: boolean;
  voice: 'elevenlabs-convai' | 'assemblyai-streaming' | null;
  live: boolean;
}

// §4.2 — Jupiter paper estimate.

export interface SolanaPaperEstimate {
  version: 2;
  id: string;
  kind: 'estimate';
  mode: 'paper';
  liveExecutionEnabled: false;
  deskId: 'jesse';
  network: SolanaNetwork;
  venue: 'jupiter';
  intent: JesseIntent;
  instrumentAddress: string;
  instrumentName: string;
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  amountInRaw: string;
  amountOutRaw: string;
  inputAmount: string;
  outputAmount: string;
  requestedScaledAmount: string | null;
  effectiveScaledAmount: string | null;
  scaling: {
    multiplier: string;
    observedSlot: number;
    observedAt: number;
    nextEffectiveAt: number | null;
  };
  router: string;
  priceImpactPercent: string | null;
  feeBps: number | null;
  feeMint: string | null;
  slippageBps: number;
  minOutputRaw: string;
  providerRequestId: string;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
}

// §4.6 — live proposal (Jupiter order → sign → execute).

export interface SolanaLiveProposal {
  version: 1;
  id: string;
  deskId: 'jesse';
  network: SolanaNetwork;
  mode: 'live';
  intent: JesseIntent;
  wallet: string;
  revision: number;
  reviewedEstimate: {
    inputMint: string;
    outputMint: string;
    inputSymbol: string;
    outputSymbol: string;
    inputAmount: string;
    outputAmount: string;
    amountInRaw: string;
    amountOutRaw: string;
    minOutputRaw: string;
    router: string;
    feeBps: number | null;
    slippageBps: number;
    scaling: SolanaPaperEstimate['scaling'];
  };
  transactionBase64: string;
  messageHash: string;
  providerRequestId: string;
  lastValidBlockHeight: string | null;
  expiresAt: number;
  minOutputRaw: string;
  slippageBps: number;
  feeSummary: {
    networkFeeLamports: string | null;
    rentLamports: string | null;
    providerFeeBps: number | null;
  };
}

export type SolanaLiveStatus =
  | 'idle'
  | 'preparing'
  | 'review'
  | 'signing'
  | 'signed'
  | 'submitting'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'rejected'
  | 'expired';

// §4.4 — market evidence.

export interface MarketObservation {
  feedId: number | null;
  symbol: string;
  source: 'pyth-pro';
  unit: 'usd-per-share' | 'usd-per-raw-token' | 'usd-per-scaled-token' | null;
  price: string | null;
  confidence: string | null;
  generatedAt: number | null;
  receivedAt: number;
  session: 'regular' | 'preMarket' | 'postMarket' | 'overNight' | 'closed' | 'unknown';
  status: 'fresh' | 'stale' | 'unavailable';
}

export interface MarketComparison {
  id: string;
  version: 1;
  instrumentId: SolanaInstrumentId;
  observedAt: number;
  token: MarketObservation;
  equity: MarketObservation;
  multiplier: string | null;
  status: 'comparable' | 'last-observation' | 'unavailable';
  referenceDifferenceBps: string | null;
  reasonCodes: string[];
}

// §4.5 — voice/controller.

export interface DeskRevision {
  deskId: 'jesse';
  revision: number;
  sessionGeneration: number;
}
export interface JesseDraft {
  instrumentId: SolanaInstrumentId | null;
  side: 'buy' | 'sell' | null;
  unit: 'USDC' | 'scaled-token' | null;
  amount: string | null;
}
export type JesseCommand =
  | { type: 'draft'; intent: JesseIntent; quote: boolean }
  | { type: 'compare'; instrumentId: SolanaInstrumentId }
  | { type: 'explain'; topic: 'reference-difference' | 'market-hours' | 'scaled-units' | 'paper-mode' }
  | { type: 'describe' }
  | { type: 'focus'; target: 'desk' | 'evidence' | 'instruction' | 'record'; objectId: string | null }
  | { type: 'watch'; instrumentId: SolanaInstrumentId }
  | { type: 'cancel' }
  | { type: 'file-paper'; quoteId: string }
  | { type: 'clarify'; draft: JesseDraft; field: 'instrument' | 'side' | 'amount' | 'units'; question: string };
export type CommandResult = {
  status: 'applied' | 'clarify' | 'rejected' | 'stale';
  revision: number;
  quoteId: string | null;
  evidenceId: string | null;
  spokenText: string;
};

// §4.7 — presentation and continuity boundary.

export type DeskPresentation = 'room' | 'compact';

/** Map legacy night/direct tokens onto the canonical room/compact view axis. */
export function normalizeDeskPresentation(raw: unknown): DeskPresentation | null {
  if (raw === 'room' || raw === 'night') return 'room';
  if (raw === 'compact' || raw === 'direct') return 'compact';
  return null;
}

export interface DeskPresentationState {
  mode: DeskPresentation;
  focus: 'desk' | 'evidence' | 'instruction' | 'record';
  objectId: string | null;
}

/* Type guards and zod-free validators — the desk/mint boundary checks the
   catalog, these guards check only shape. Amount grammar mirrors the legacy
   intent schema: a positive decimal string, never a number. */

const POSITIVE_DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

/** Template-literal check only — `sol:` plus a non-empty suffix. Decoding the
 *  mint to exactly 32 bytes is the catalog's job (lib/solana/catalog.ts). */
export function isSolanaInstrumentId(id: unknown): id is SolanaInstrumentId {
  return typeof id === 'string' && id.startsWith('sol:') && id.length > 4;
}

/** Narrow the shared QuoteEstimate union — `network` exists only on the
 *  Solana branch, so its literal discriminates without touching Base. */
export function isSolanaEstimate(quote: QuoteEstimate): quote is SolanaPaperEstimate {
  return (quote as SolanaPaperEstimate).network === 'solana:mainnet';
}

/** Shape check for a complete Jesse intent — buy spends USDC, sell quantities
 *  are scaled-token units. Unit/side mismatches and non-positive amounts fail. */
export function isJesseIntent(input: unknown): input is JesseIntent {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Record<string, unknown>;
  if (!isSolanaInstrumentId(candidate.instrumentId)) return false;
  if (typeof candidate.amount !== 'string' || !POSITIVE_DECIMAL.test(candidate.amount) || !/[1-9]/.test(candidate.amount)) return false;
  if (candidate.side === 'buy') return candidate.unit === 'USDC';
  if (candidate.side === 'sell') return candidate.unit === 'scaled-token';
  return false;
}
