/**
 * Host broadcast flag. Off by default: enabling it moves the live line from
 * the WebSocket transport to WebRTC, which is the only transport that exposes
 * the agent's audio track. That path has to be heard with a real microphone
 * on the deployment before it becomes the default — a flag, not a guess.
 */
export const HETTY_BROADCAST_ENABLED = process.env.NEXT_PUBLIC_HETTY_BROADCAST === 'true';
