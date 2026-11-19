import { busyResponse, requestBudget } from '@/lib/trading/http';
import { liveBroadcasts } from '@/lib/hetty/livekit-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hetty/presence
 *
 * "The desk is open" — the lamp on the front page and the desk-hours line
 * in the foyer both read this. It answers from LiveKit's own admin
 * surface, never from a cached guess: a room is a broadcast only when a
 * `hetty-host-*` participant is actually in it, so a stale link someone
 * still has open can never light the lamp.
 *
 * Three states, and they are not interchangeable:
 *   open    — a host is in a room; carries the room name and listener count
 *   closed  — the room list was read and no broadcast was found
 *   unknown — LiveKit could not be asked; the lamp must not render at all
 *
 * Public on purpose: the audience door is the room name, and observer
 * tokens are already minted for anonymous callers. Presence reveals
 * nothing the share link would not.
 *
 * The answer is cached for a few seconds so a crowded front page cannot
 * hammer the admin API one listing per visitor.
 */

type PresenceBody =
  | { state: 'open'; room: string; listening: number }
  | { state: 'closed' }
  | { state: 'unknown' };

const instanceBudget = requestBudget(240);
const CACHE_MS = 15_000;
let cached: { at: number; body: PresenceBody } | null = null;

export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  if (!instanceBudget()) {
    return busyResponse('Too many presence checks. Please wait a moment.');
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return Response.json({ state: 'unknown' } satisfies PresenceBody, { headers });
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return Response.json(cached.body, { headers });
  }

  const live = await liveBroadcasts({ url, apiKey, apiSecret });
  const body: PresenceBody = live === null
    ? { state: 'unknown' }
    : live.length === 0
      ? { state: 'closed' }
      : { state: 'open', ...(live.reduce((a, b) => (b.listening > a.listening ? b : a))) };
  cached = { at: now, body };
  return Response.json(body, { headers });
}
