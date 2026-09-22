/**
 * House entry — foyer vs desk, `?desk=` deep links, last-open preference.
 *
 * OPEN_DESK_ID remains Hetty (Base document owner). Entry preference is separate:
 * first visit with no query and no saved preference shows the Claflin foyer.
 * Deep links may carry `?offering=` when the catalog declares the desk eligible.
 */
import { getHouseDesk, isOpenDesk, type HouseDeskId } from './house';
import { offeringCoversDesk, offeringForId } from './desk/offerings';

export const HOUSE_DESK_PREFERENCE_KEY = 'claflin.desk.v1.last';

export type HouseEntry =
  | { kind: 'foyer' }
  | { kind: 'desk'; deskId: HouseDeskId; source: 'query' | 'preference'; offeringId: string | null };

/** Parse `?desk=` — only known house ids; open desks enter, planned visit closed rooms. */
export function parseDeskQuery(raw: string | null | undefined): HouseDeskId | null {
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  return getHouseDesk(id) ? (id as HouseDeskId) : null;
}

/**
 * Parse `?offering=` as catalog context for a desk entry. An offering is only
 * meaningful when the selected desk is one of its declared eligible desks.
 */
export function parseOfferingQuery(raw: string | null | undefined, deskId: HouseDeskId): string | null {
  if (!raw) return null;
  const offering = offeringForId(raw.trim());
  return offering && offeringCoversDesk(offering, deskId) ? offering.offeringId : null;
}

export function loadLastDesk(storage: Pick<Storage, 'getItem'>): HouseDeskId | null {
  try {
    const raw = storage.getItem(HOUSE_DESK_PREFERENCE_KEY);
    if (!raw) return null;
    return getHouseDesk(raw) ? (raw as HouseDeskId) : null;
  } catch {
    return null;
  }
}

export function saveLastDesk(storage: Pick<Storage, 'setItem'>, deskId: HouseDeskId): void {
  try {
    storage.setItem(HOUSE_DESK_PREFERENCE_KEY, deskId);
  } catch {
    /* preference is optional */
  }
}

/**
 * Resolve first paint. Query wins, then last open desk, else foyer.
 * Planned desks from query still enter (closed room); preference only restores open desks
 * so a stale planned visit does not strand a returning client.
 */
export function resolveHouseEntry(
  deskQuery: string | null | undefined,
  storage: Pick<Storage, 'getItem'>,
  offeringQuery?: string | null,
): HouseEntry {
  const fromQuery = parseDeskQuery(deskQuery);
  if (fromQuery) {
    return {
      kind: 'desk',
      deskId: fromQuery,
      source: 'query',
      offeringId: parseOfferingQuery(offeringQuery, fromQuery),
    };
  }

  const last = loadLastDesk(storage);
  if (last && isOpenDesk(last)) {
    return {
      kind: 'desk',
      deskId: last,
      source: 'preference',
      offeringId: null,
    };
  }

  return { kind: 'foyer' };
}

/** Strip desk deep-link params when the client steps back into the foyer. */
export function clearDeskQuery(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('desk');
    url.searchParams.delete('offering');
    url.searchParams.delete('view');
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* URL sync is optional */
  }
}

/** Keep the address bar honest without creating a history entry per switch. */
export function syncDeskQuery(deskId: HouseDeskId, offeringId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('desk', deskId);
    const offering = offeringId ? offeringForId(offeringId) : null;
    if (offering && offeringCoversDesk(offering, deskId)) {
      url.searchParams.set('offering', offering.offeringId);
    } else {
      url.searchParams.delete('offering');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* URL sync is optional */
  }
}
