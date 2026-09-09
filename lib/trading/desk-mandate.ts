import { OPEN_DESK_ID, isOpenDesk, type HouseDeskId } from '@/lib/house';
import type { QuoteEstimate, TradeIntent } from './domain';
import { initialDesk, type DeskState } from './workflow';

/** Today's venue quotes are Base paper estimates. They belong only to Hetty's desk. */
export function quoteDeskId(quote: Pick<QuoteEstimate, 'chainId' | 'mode'>): HouseDeskId {
  if (quote.chainId === 8453 && quote.mode === 'paper') return OPEN_DESK_ID;
  return OPEN_DESK_ID;
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
  if (current.state.quote && entered.deskId !== current.deskId && entered.state.quote) {
    throw new Error('A quotation cannot travel with a desk switch.');
  }
  return { parked: nextParked, entered };
}
