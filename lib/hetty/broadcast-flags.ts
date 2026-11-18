/**
 * Host broadcast flag. Off by default: enabling it moves the live line from
 * the WebSocket transport to WebRTC, which is the only transport that exposes
 * the agent's audio track. That path has to be heard with a real microphone
 * on the deployment before it becomes the default — a flag, not a guess.
 */
export const HETTY_BROADCAST_ENABLED = process.env.NEXT_PUBLIC_HETTY_BROADCAST === 'true';

/**
 * The outer bound of one broadcast session. A host who forgets the call is
 * running the room all night — at the cap the desk ends the call the
 * deliberate way, so listeners hear 'closed' rather than a vanished room.
 * Minutes, like the env knob says; six hours covers the marathon window.
 */
const broadcastMaxMinutes = Number(process.env.NEXT_PUBLIC_HETTY_BROADCAST_MAX_MINUTES);
export const HETTY_BROADCAST_MAX_MS =
  (Number.isFinite(broadcastMaxMinutes) && broadcastMaxMinutes > 0 ? broadcastMaxMinutes : 360) * 60_000;
