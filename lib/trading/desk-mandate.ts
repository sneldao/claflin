import { OPEN_DESK_ID, isOpenDesk, type HouseDeskId } from '@/lib/house';
import type { QuoteEstimate, TradeIntent } from './domain';
import { initialDesk, type DeskState } from './workflow';

/**
 * Which desk a quotation belongs to, or null when it belongs to no open desk.
 * Today's venue quotes are Base paper estimates, so they belong only to Hetty;
 * anything else is refused rather than silently reassigned.
 */
export function quoteDeskId(quote: Pick<QuoteEstimate, 'chainId' | 'mode'>): HouseDeskId | null {
  if (quote.chainId === 8453 && quote.mode === 'paper') return OPEN_DESK_ID;
  return null;
}

/**
 * Per-desk paper quote guardrails. The quote service enforces these; the
 * mandate owns them so a new desk never inherits Base's limits by accident.
 * Amounts are decimal strings; buy spends are sized in `quoteDecimals`,
 * sell quantities in the instrument's own decimals.
 */
export interface DeskQuoteLimits {
  /** Max buy spend, e.g. '10000' USDC. */
  buyMax: string;
  /** Max sell quantity, e.g. '1000' tokens. */
  sellMax: string;
  /** Decimals of the desk's quote currency (USDC: 6). */
  quoteDecimals: number;
}

const DESK_QUOTE_LIMITS: Record<HouseDeskId, DeskQuoteLimits> = {
  hetty: { buyMax: '10000', sellMax: '1000', quoteDecimals: 6 },
  jesse: { buyMax: '10000', sellMax: '1000', quoteDecimals: 6 },
  isabel: { buyMax: '10000', sellMax: '1000', quoteDecimals: 6 },
  arbitrum: { buyMax: '10000', sellMax: '1000', quoteDecimals: 6 },
};

export function deskQuoteLimits(deskId: HouseDeskId): DeskQuoteLimits {
  return DESK_QUOTE_LIMITS[deskId];
}

export function canReviewOnDesk(quote: Pick<QuoteEstimate, 'chainId' | 'mode' | 'liveExecutionEnabled'>, deskId: HouseDeskId): boolean {
  return isOpenDesk(deskId) && quoteDeskId(quote) === deskId && quote.liveExecutionEnabled === false;
}

export function canFileOnDesk(state: DeskState, deskId: HouseDeskId): boolean {
  return isOpenDesk(deskId) && Boolean(state.quote) && canReviewOnDesk(state.quote!, deskId);
}

export function emptyDraft(): TradeIntent {
  return { instrumentId: '', side: 'buy', amount: '', unit: 'USDC' };
}

export type ParkedDesk = {
  deskId: HouseDeskId;
  state: DeskState;
  viewedRecordId: string | null;
  error: string | null;
};

export function enterDesk(
  id: HouseDeskId,
  parked: Partial<Record<HouseDeskId, ParkedDesk>>,
  persistedDraft: TradeIntent | null,
): ParkedDesk {
  const cached = parked[id];
  if (cached) return cached;
  if (!isOpenDesk(id)) {
    return { deskId: id, state: initialDesk(emptyDraft()), viewedRecordId: null, error: null };
  }
  return {
    deskId: id,
    state: initialDesk(persistedDraft ?? emptyDraft()),
    viewedRecordId: null,
    error: null,
  };
}

/** Park durable work only. An in-flight estimate is not a resumable network operation. */
export function parkDeskWork(session: ParkedDesk): ParkedDesk {
  if (session.state.stage !== 'loading') return session;
  return {
    ...session,
    viewedRecordId: null,
    error: null,
    state: {
      ...initialDesk(session.state.draft),
      message: 'The last estimate was interrupted. Review a fresh one when you are ready.',
    },
  };
}

/** Park the current desk, then enter another. The destination never receives the parked quotation. */
export function switchDeskSession(
  current: ParkedDesk,
  destination: HouseDeskId,
  parked: Partial<Record<HouseDeskId, ParkedDesk>>,
  persistedDraft: TradeIntent | null,
): { parked: Partial<Record<HouseDeskId, ParkedDesk>>; entered: ParkedDesk } {
  const parkedCurrent = parkDeskWork(current);
  const nextParked = { ...parked, [current.deskId]: parkedCurrent };
  const entered = enterDesk(destination, nextParked, persistedDraft);
  /* Each desk keeps its own quotation; the boundary is that this switch must
     not deliver the departing desk's quotation to the destination. A parked
     desk resuming its own earlier quotation is legitimate recovery. */
  if (current.state.quote && entered.state.quote?.id === current.state.quote.id) {
    throw new Error('A quotation cannot travel with a desk switch.');
  }
  return { parked: nextParked, entered };
}
