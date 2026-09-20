import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';
import { accountFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/jesse/session
 *
 * Mints a signed ElevenLabs ConvAI URL for a live voice session with
 * Jesse. The API key and agent id stay server-side; the browser only
 * ever sees a short-lived signed URL. Jesse's desk tools are client
 * tools — he can draft, quote, compare, and file paper, never execute.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const instanceBudget = requestBudget(12); // signed URLs / minute / instance
const anonIpBudget = keyedBudget(3); // anonymous IP / minute
const userBudget = keyedBudget(5); // signed-in account / minute

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  let userId: string | null = null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized', message: 'Sign in again to ring Jesse.' }, { status: 401, headers });
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
  const agentId = process.env.ELEVENLABS_AGENT_JESSE;
  if (!apiKey || !agentId) {
    return Response.json({ error: 'not_connected', message: 'Jesse’s line is not connected on this deployment.' }, { status: 503, headers });
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) throw new Error(`elevenlabs_${response.status}`);
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) throw new Error('no_signed_url');
    return Response.json({ signedUrl: body.signed_url, account: userId ? 'bound' : 'anonymous' }, { headers });
  } catch {
    return Response.json({ error: 'line_unavailable', message: 'Jesse’s line is unavailable right now. Please try again shortly.' }, { status: 502, headers });
  }
}
