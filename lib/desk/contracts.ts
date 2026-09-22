/**
 * Rail-neutral desk contracts.
 *
 * This module owns the vocabulary shared by every desk: capabilities,
 * presentation, lifecycle stage, foreground documents, market mandates,
 * storage policy, and live-operation status. Rail adapters may implement or
 * narrow these contracts, but shared code must not import a rail module to
 * find them.
 */

export type DeskId = string;

/** Rail modules register their instruction and estimate branches here. Shared
 *  code consumes the registered union without importing a rail module. */
export interface DeskIntentRegistry {}
export type RegisteredDeskIntent = DeskIntentRegistry[keyof DeskIntentRegistry];
export type DeskIntent = RegisteredDeskIntent;

export interface QuoteEstimateRegistry {}
export type RegisteredQuoteEstimate = QuoteEstimateRegistry[keyof QuoteEstimateRegistry];
export type QuoteEstimate = RegisteredQuoteEstimate;

/** Product-level instruction shape shared by rail refinements. A desk adapter
 *  may narrow instrument id, side, and unit, but it does not change the
 *  instruction lifecycle. */
export interface DeskInstruction {
  instrumentId: string;
  side: 'buy' | 'sell';
  unit: string;
  amount: string;
}

/** Settlement technology — not the desk, market, venue, or broker. */
export type RailKind = 'evm' | 'solana';
export type RailRef =
  | { kind: 'evm'; network: `eip155:${number}`; chainId: number }
  | { kind: 'solana'; network: 'solana:mainnet' };

/** A mandate is the product/access boundary: issuer, instruments, venues,
 *  policy, and the rails those products settle on. */
export type MarketMandateId =
  | 'coinbase-tokenized-stocks'
  | 'backed-xstocks'
  | 'robinhood-stock-tokens'
  | 'arbitrum-pending';

export interface MarketMandate {
  id: MarketMandateId;
  label: string;
  product: string;
  issuer: string | null;
  rails: readonly RailRef[];
  venues: readonly string[];
  quoteAsset: 'USDC' | null;
  status: 'active' | 'planned';
}

export interface DeskCapabilities {
  quote: boolean;
  paper: boolean;
  voice: 'elevenlabs-convai' | 'assemblyai-streaming' | null;
  live: boolean;
}

/** Runtime capabilities are broader than the public product capability table:
 *  they describe which ports and storage/sync behaviors a desk owns. */
export interface DeskRuntimeCapabilities extends DeskCapabilities {
  marks: boolean;
  accountSync: boolean;
  evidence: readonly string[];
}

/** Capabilities and adapters that apply to one mandate covered by a desk. A
 *  desk may add coverages without inheriting another desk's venue or rail. */
export interface DeskCoverageCapabilities {
  quote: boolean;
  paper: boolean;
  live: boolean;
  marks: boolean;
  evidence: readonly string[];
}

export interface DeskAdapterPlan {
  quote: string | null;
  marks: string | null;
  execution: string | null;
  voice: string | null;
}

export interface DeskCoverage {
  mandate: MarketMandate;
  adapters: DeskAdapterPlan;
  capabilities: DeskCoverageCapabilities;
}

/** A sellable product/rail/venue combination. Similar exposures on different
 *  rails remain distinct offerings — the house never treats them as fungible. */
export interface InstrumentOffering {
  offeringId: string;
  productId: string;
  instrumentId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  mandateId: MarketMandateId;
  issuer: string | null;
  rail: RailRef;
  venue: string | null;
  quoteAsset: 'USDC' | null;
  unitPolicy: {
    buy: string;
    sell: string;
  };
  deskIds: readonly DeskId[];
  quoteSupported: boolean;
  status: 'active' | 'planned';
}

/** The engine that owns a desk's working paper. `legacy-reducer` is the v1
 *  Base document pipeline; `controller` is a serialized command session;
 *  `none` means the desk has no document engine yet (planned desks). */
export type DeskDocumentEngine = 'legacy-reducer' | 'controller' | 'none';

export interface DeskStoragePolicy {
  scope: 'browser-local' | 'account-sync';
  /** Which document engine owns this desk's drafts, quotes, and records. */
  engine: DeskDocumentEngine;
  historyLimit: number;
}

export interface DeskRuntime {
  deskId: DeskId;
  coverages: readonly DeskCoverage[];
  capabilities: DeskRuntimeCapabilities;
  storage: DeskStoragePolicy;
  presentationDefault: DeskPresentation;
  /** Presentation implementation, not a settlement rail. */
  surface: 'hetty' | 'jesse' | null;
}

export type DeskPresentation = 'room' | 'compact';

/** Map legacy night/direct tokens onto the canonical room/compact axis. */
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

/** Shared lifecycle vocabulary. `loading` is accepted only as a legacy alias
 *  for `quoting`; controllers should persist the canonical stage. */
export type DeskLifecycleStage = 'draft' | 'quoting' | 'review' | 'saved' | 'cancelled';
export type LegacyDeskLifecycleStage = DeskLifecycleStage | 'loading';

export function normalizeDeskStage(stage: LegacyDeskLifecycleStage): DeskLifecycleStage {
  return stage === 'loading' ? 'quoting' : stage;
}

export interface DeskRevision<TDeskId extends string = string> {
  deskId: TDeskId;
  revision: number;
  sessionGeneration: number;
}

export type CommandResult = {
  status: 'applied' | 'clarify' | 'rejected' | 'stale';
  revision: number;
  quoteId: string | null;
  evidenceId: string | null;
  spokenText: string;
};

export type DeskForegroundKind = 'draft' | 'pending' | 'quotation' | 'receipt' | 'archive' | 'missing';

/** The object currently under shared attention, independent of rail schema. */
export type DeskForeground =
  | { kind: 'draft' }
  | { kind: 'pending' }
  | { kind: 'quotation'; quoteId: string }
  | { kind: 'receipt'; recordId: string }
  | { kind: 'archive'; recordId: string }
  | { kind: 'missing'; recordId: string };

export interface DeskForegroundDocument {
  kind: DeskForegroundKind;
  quoteId: string | null;
  recordId: string | null;
  instrumentId: string | null;
  actionable: boolean;
  readonly: boolean;
}

/** The document-session contract every open desk honors. Shared furniture —
 *  record URLs, entry context, ledger opening — reads only this surface;
 *  the engine underneath (legacy reducer, command controller) stays free to
 *  differ. Record payloads remain desk-specific and never enter the contract. */
export interface DeskDocumentSession {
  /** The one document under shared attention on the ticket. */
  readonly foreground: DeskForegroundDocument;
  readonly historyReady: boolean;
  readonly storageError: string | null;
  readonly viewedRecordId: string | null;
  openRecord(id: string): void;
  dismissRecord(): void;
  removeRecord(id: string): void;
}

/** Shared estimate envelope. `evidence` remains a discriminated rail payload —
 *  Base keeps pool/block/multiplier evidence; Solana keeps mint/router/scaling
 *  evidence. The envelope never fabricates foreign-rail fields. */
export interface DeskEstimateEnvelope<
  TInstruction extends DeskInstruction = DeskInstruction,
  TEvidence = unknown,
> {
  id: string;
  kind: 'estimate';
  mode: 'paper';
  deskId: DeskId;
  mandateId: MarketMandateId;
  offeringId: string;
  instrumentId: string;
  rail: RailRef;
  venue: string;
  intent: TInstruction;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
  evidence: TEvidence;
}

/** A filed paper record is a shared envelope. The estimate, instrument, and
 *  evidence payloads remain desk/mandate-specific and must stay frozen. */
export interface DeskPaperRecord<
  TEstimate = unknown,
  TInstrument = unknown,
  TEvidence = unknown,
> {
  version: number;
  id: string;
  mode: 'paper';
  deskId: DeskId;
  owner: string;
  createdAt: number;
  quote: TEstimate;
  instrumentSnapshot?: TInstrument;
  evidenceSnapshot?: TEvidence | null;
}

export type LiveOperationStatus =
  | 'idle'
  | 'preparing'
  | 'review'
  | 'authorizing'
  | 'submitting'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'expired';

/** Wallet/account identity is shared; address syntax and signing mechanics stay
 *  inside the rail adapter and wallet port. */
export interface DeskAccountRef {
  rail: RailRef;
  address: string;
}

/** A submitted operation is identified by an opaque rail reference — a Base
 *  transaction hash or a Solana signature — never by a rail-specific field in
 *  shared code. */
export interface DeskOperationHandle {
  rail: RailRef;
  operationId: string;
  submittedAt?: number;
}

export interface DeskSettlementEvidence {
  rail: RailRef;
  operationId: string;
  confirmedAt: number | null;
  blockRef: string | null;
  explorerUrl: string | null;
}

export interface DeskOperationOutcome {
  status: Extract<LiveOperationStatus, 'submitted' | 'confirmed' | 'failed' | 'unknown' | 'expired'>;
  handle: DeskOperationHandle | null;
  settlement: DeskSettlementEvidence | null;
  error: string | null;
}

/** The reviewable authorization package. Rail payloads stay opaque to shared
 *  code: EVM may carry calldata/approvals; Solana may carry a serialized
 *  versioned transaction and message binding. */
export interface DeskLiveProposal<TTerms = unknown, TRailPayload = unknown> {
  id: string;
  deskId: DeskId;
  mode: 'live';
  rail: RailRef;
  account: DeskAccountRef;
  revision: number;
  reviewedTerms: TTerms;
  railPayload: TRailPayload;
  expiresAt: number;
}

export interface DeskAuthorizationPlan {
  kind: string;
  steps: readonly string[];
}

/** Shared execution lifecycle. Implementations may prepare/sign/submit very
 *  differently, but they must reconcile the same operation and must never
 *  auto-submit a replacement after an unknown outcome. */
export interface DeskExecutionPort<
  TProposal extends DeskLiveProposal = DeskLiveProposal,
  TAuthorization = unknown,
  THandle extends DeskOperationHandle = DeskOperationHandle,
> {
  prepare(input: unknown): Promise<TProposal>;
  authorizationPlan(proposal: TProposal): DeskAuthorizationPlan;
  submit(authorization: TAuthorization): Promise<THandle>;
  status(handle: THandle): Promise<DeskOperationOutcome>;
  reconcile(handle: THandle): Promise<DeskOperationOutcome>;
  explorerUrl?(handle: THandle): string | null;
}
