import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';
import { accountFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hetty/session
 *
 * Mints a signed ElevenLabs ConvAI URL for a live voice session with
 * Hetty. The API key and agent id stay server-side; the browser only
 * ever sees a short-lived signed URL. Hetty's desk tools are client
 * tools — she can draft, quote and record paper trades, never execute.
 *
 * `?transport=webrtc` mints a conversation token instead of a signed URL.
 * WebRTC is the only transport that exposes the agent's audio track, so it
 * is what the host broadcast needs; the WebSocket path stays the default
 * and is unchanged.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const instanceBudget = requestBudget(12);
const anonIpBudget = keyedBudget(3);
const userBudget = keyedBudget(5);

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  let userId: string | null = null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized', message: 'Sign in again to ring Hetty.' }, { status: 401, headers });
  }

  if (!instanceBudget()) {
    return busyResponse('Too many call requests. Please wait a moment.');
  }
  const allowed = userId
    ? userBudget(`user:${userId}`)
    : anonIpBudget(clientKeyFromRequest(req));
  if (!allowed) {
    return busyResponse('Too many call requests. Please wait a moment.');
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_HETTY;
  if (!apiKey || !agentId) {
    return Response.json({ error: 'not_connected', message: 'Hetty’s line is not connected on this deployment.' }, { status: 503, headers });
  }

  try {
    if (req.nextUrl.searchParams.get('transport') === 'webrtc') {
      /* WebRTC sessions take a conversation token, not a signed URL; the
         SDK refuses signedUrl with connectionType "webrtc". */
      const response = await fetch(`${ELEVENLABS_API_URL}/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (!response.ok) throw new Error(`elevenlabs_${response.status}`);
      const body = (await response.json()) as { token?: string };
      if (!body.token) throw new Error('no_conversation_token');
      return Response.json({ conversationToken: body.token, account: userId ? 'bound' : 'anonymous' }, { headers });
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) throw new Error(`elevenlabs_${response.status}`);
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) throw new Error('no_signed_url');
    return Response.json({ signedUrl: body.signed_url, account: userId ? 'bound' : 'anonymous' }, { headers });
  } catch {
    return Response.json({ error: 'line_unavailable', message: 'Hetty’s line is unavailable right now. Please try again shortly.' }, { status: 502, headers });
  }
}
