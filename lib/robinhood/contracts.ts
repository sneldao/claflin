/**
 * Robinhood Chain contracts — Isabel's desk implementation for the
 * 'robinhood-stock-tokens' mandate on eip155:4663. Shared desk vocabulary
 * lives in lib/desk/contracts.ts and is re-exported here for compatibility.
 * Client-safe: no server imports, no env access, no dependencies.
 *
 * Every raw quantity and price is a serialized string — no floats cross this
 * boundary. Instrument ids are `rh:<lowercased contract>`; the catalog owns
 * the verified allowlist (lib/robinhood/catalog.ts).
 */

import type { DeskRevision as SharedDeskRevision } from '../desk/contracts';

export type {
  CommandResult,
  DeskCapabilities,
  DeskLifecycleStage,
  DeskPresentation,
  DeskPresentationState,
} from '../desk/contracts';
export { normalizeDeskPresentation } from '../desk/contracts';

export type RobinhoodNetwork = 'eip155:4663';
export const ROBINHOOD_CHAIN_ID = 4663;
export type RobinhoodInstrumentId = `rh:${string}`;

/** USDG is Isabel's quote asset — Robinhood Chain's settlement stablecoin. */
export const ROBINHOOD_USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const USDG_DECIMALS = 6;

export type IsabelIntent =
  | { instrumentId: RobinhoodInstrumentId; side: 'buy'; unit: 'USDG'; amount: string }
  | { instrumentId: RobinhoodInstrumentId; side: 'sell'; unit: 'token'; amount: string };

/** An incomplete instruction in progress — every field independently
 *  nullable. The unit is implied by the side (USDG spend for buys, token
 *  quantity for sells), so the draft never stores one. */
export interface IsabelDraft {
  instrumentId: RobinhoodInstrumentId | null;
  side: 'buy' | 'sell' | null;
  amount: string | null;
}

/**
 * A verified Robinhood stock token. `contractAddress` keeps issuer checksum
 * case; `id` is the canonical lowercase `rh:` form. The corporate-action
 * multiplier is never stored here — it is read live (onchain `uiMultiplier()`
 * or the issuer's `currentMultiplier`) at quote time.
 */
export interface RobinhoodInstrument {
  id: RobinhoodInstrumentId;
  network: RobinhoodNetwork;
  deskId: 'isabel';
  contractAddress: string;
  symbol: string;
  name: string;
  underlyingSymbol: string;
  decimals: 18;
  issuer: string;
  /** Chainlink AggregatorV3 proxy on 4663 — token price incl. multiplier. */
  chainlinkFeed: string;
  /** Spot market id on the Robinhood Chain Lighter domain (SYM/USDG). */
  lighterMarketId: number;
  identitySourceUrl: string;
  verifiedAt: number;
  quoteSupported: boolean;
}

/** What the visible Lighter book did with the requested size. */
export interface LighterBookEvidence {
  marketId: number;
  bestBid: string | null;
  bestAsk: string | null;
  midPrice: string | null;
  spreadBps: string | null;
  levelsConsumed: number;
  /** False when the visible book could not fill the whole request — the
   *  estimate then covers only the consumed portion and labels it. */
  filledFully: boolean;
  unfilledInputRaw: string;
}

/** Paper estimate for Isabel — Lighter orderbook walk, paper only. */
export interface RobinhoodPaperEstimate {
  version: 1;
  id: string;
  kind: 'estimate';
  mode: 'paper';
  liveExecutionEnabled: false;
  deskId: 'isabel';
  mandateId?: 'robinhood-stock-tokens';
  offeringId?: string;
  instrumentId?: RobinhoodInstrumentId;
  network: RobinhoodNetwork;
  chainId: 4663;
  venue: 'lighter';
  intent: IsabelIntent;
  instrumentAddress: string;
  instrumentName: string;
  inputSymbol: string;
  outputSymbol: string;
  amountInRaw: string;
  amountOutRaw: string;
  inputAmount: string;
  outputAmount: string;
  book: LighterBookEvidence;
  /** ERC-8056 uiMultiplier read onchain at quote time (18dp fixed point).
   *  Null when every read path failed — the estimate still carries the venue
   *  answer, but never a fabricated share count. */
  multiplierRaw: string | null;
  /** Underlying-share equivalent of the token output; null without multiplier. */
  shareEquivalent: string | null;
  /** Onchain Chainlink mark — multiplier-adjusted token price. */
  onchainMark: {
    answerRaw: string;
    decimals: number;
    updatedAt: number;
    status: 'observed' | 'stale' | 'unavailable';
  };
  /** Issuer REST reference — rhj token prices are multiplier-adjusted
   *  server-side. null when the issuer endpoint could not answer. */
  issuerMark: {
    underlyingBid: string;
    underlyingAsk: string;
    tokenBid: string;
    tokenAsk: string;
    halted: boolean;
    generatedAt: string | null;
  } | null;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
}

export type DeskRevision = SharedDeskRevision<'isabel'>;

const POSITIVE_DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

/** `rh:` plus a 40-hex address, lowercase canonical form. */
export function isRobinhoodInstrumentId(id: unknown): id is RobinhoodInstrumentId {
  return typeof id === 'string' && /^rh:0x[0-9a-f]{40}$/.test(id);
}

export function isIsabelIntent(input: unknown): input is IsabelIntent {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Record<string, unknown>;
  if (!isRobinhoodInstrumentId(candidate.instrumentId)) return false;
  if (typeof candidate.amount !== 'string' || !POSITIVE_DECIMAL.test(candidate.amount) || !/[1-9]/.test(candidate.amount)) return false;
  if (candidate.side === 'buy') return candidate.unit === 'USDG';
  if (candidate.side === 'sell') return candidate.unit === 'token';
  return false;
}

declare module '../desk/contracts' {
  interface DeskIntentRegistry {
    robinhood: IsabelIntent;
  }
  interface QuoteEstimateRegistry {
    robinhood: RobinhoodPaperEstimate;
  }
}
