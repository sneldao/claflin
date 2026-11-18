/**
 * Broadcast room names — one pattern, shared by the token route that mints
 * and validates them and the audience client that refuses to join anything
 * else. Keeping it in one place means a name the server would reject can
 * never be attempted in a browser, and a name the browser rejects can never
 * be minted.
 *
 * The name is the only thing an observer needs: it is unguessable, and the
 * signature (not the name) decides who may publish.
 */

const ROOM_PATTERN = /^hetty-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The identity prefix the token route writes into every host grant. Both
 * sides read it: the admin surface uses it to tell the broadcaster from
 * the crowd, and an observer's room uses it to know the show is over when
 * the host leaves — even while listeners remain.
 */
export const HOST_IDENTITY_PREFIX = 'hetty-host-';

/** A fresh room per ring — a broadcast link is never reused. */
export function livekitRoomName(): string {
  return `hetty-${crypto.randomUUID()}`;
}

export function isLivekitRoomName(value: string): boolean {
  return ROOM_PATTERN.test(value);
}

/**
 * The audience link — the only thing an observer receives. The desk URL
 * plus one room name: no key, no host token, nothing that could be
 * replayed into a microphone. `?desk=hetty` enters the desk itself —
 * a bare `?room=` would land in the foyer, where the door is not mounted.
 * Built here so the client and the share strip cannot drift.
 */
export function audienceLinkFor(room: string, origin: string): string {
  return `${origin}/?desk=hetty&room=${encodeURIComponent(room)}`;
}
