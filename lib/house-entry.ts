/**
 * House entry — foyer vs desk, `?desk=` deep links, last-open preference.
 *
 * OPEN_DESK_ID remains Hetty (Base document owner). Entry preference is separate:
 * first visit with no query and no saved preference shows the Claflin foyer;
 * Stocklana / judges use `/?desk=jesse`.
 */
import { getHouseDesk, isOpenDesk, type HouseDeskId } from './house';

export const HOUSE_DESK_PREFERENCE_KEY = 'claflin.desk.v1.last';

export type HouseEntry =
  | { kind: 'foyer' }
  | { kind: 'desk'; deskId: HouseDeskId; source: 'query' | 'preference' };

/** Parse `?desk=` — only known house ids; open desks enter, planned visit closed rooms. */
export function parseDeskQuery(raw: string | null | undefined): HouseDeskId | null {
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  return getHouseDesk(id) ? (id as HouseDeskId) : null;
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
): HouseEntry {
  const fromQuery = parseDeskQuery(deskQuery);
  if (fromQuery) return { kind: 'desk', deskId: fromQuery, source: 'query' };

  const last = loadLastDesk(storage);
  if (last && isOpenDesk(last)) return { kind: 'desk', deskId: last, source: 'preference' };

  return { kind: 'foyer' };
}

/** Keep the address bar honest without creating a history entry per switch. */
export function syncDeskQuery(deskId: HouseDeskId): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('desk', deskId);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* URL sync is optional */
  }
}
