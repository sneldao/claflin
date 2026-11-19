/**
 * "The desk is open" — presence read from the room itself.
 *
 * The lamp on the front page and the desk-hours line in the foyer both
 * run on this: a poll of /api/hetty/presence, which answers from LiveKit's
 * own participant list. Three states are kept distinct all the way to the
 * render: open (a host is in a room), closed (the list was read), and
 * unknown (the room could not be asked) — only 'open' may light the lamp.
 */

'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/api-client';
import { HETTY_BROADCAST_ENABLED } from './broadcast-flags';
import { isLivekitRoomName } from './room-name';

export type DeskPresence =
  | { state: 'open'; room: string; listening: number }
  | { state: 'closed' }
  | { state: 'unknown' };

const DARK: DeskPresence = { state: 'unknown' };

/**
 * Poll presence while the page is up. Returns 'unknown' until the first
 * answer lands, and stays 'unknown' whenever the deployment cannot ask —
 * a lamp that cannot verify itself does not render.
 */
export function useDeskPresence(pollMs = 45_000): DeskPresence {
  const [presence, setPresence] = useState<DeskPresence>(DARK);
  useEffect(() => {
    if (!HETTY_BROADCAST_ENABLED) return;
    let alive = true;
    const read = async () => {
      const res = await fetchJson<{ state?: string; room?: string; listening?: number }>(
        '/api/hetty/presence',
        { cache: 'no-store' },
      );
      if (!alive) return;
      if (!res.ok) {
        setPresence(DARK);
        return;
      }
      const { state, room, listening } = res.data;
      /* A malformed answer degrades to 'unknown', never to a lit lamp. */
      if (state === 'open' && typeof room === 'string' && isLivekitRoomName(room)) {
        setPresence({
          state: 'open',
          room,
          listening: typeof listening === 'number' && listening >= 0 ? Math.floor(listening) : 0,
        });
      } else if (state === 'closed') {
        setPresence({ state: 'closed' });
      } else {
        setPresence(DARK);
      }
    };
    void read();
    const timer = setInterval(() => void read(), pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollMs]);
  return presence;
}
