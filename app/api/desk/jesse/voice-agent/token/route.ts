/**
 * POST /api/desk/jesse/voice-agent/token
 *
 * Mints a single-use AssemblyAI Voice Agent token for one call with Jesse.
 * The API key stays on the server; the browser opens
 * wss://agents.assemblyai.com/v1/ws?token=… with the result. Sessions are
 * capped at ten minutes, and instance + IP budgets limit quota burn on a
 * public demo URL. Returns unavailable — never a fake token — when the
 * key is missing or AssemblyAI refuses.
 */
import { NextRequest } from 'next/server';
import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';
import { AAI_TOKEN_URL } from '@/lib/jesse/assemblyai-agent';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_SECONDS = 60;
const MAX_SESSION_SECONDS = 600;
const instanceBudget = requestBudget(12); // tokens / minute / instance
const ipBudget = keyedBudget(3); // per client IP / minute

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!instanceBudget() || !ipBudget(clientKeyFromRequest(req))) {
    return busyResponse('Too many call requests. Please wait a moment.');
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'not_connected', message: 'Jesse’s line is not connected on this deployment.' },
      { status: 503, headers },
    );
  }

  const url = new URL(AAI_TOKEN_URL);
  url.searchParams.set('product', 'voice_agent');
  url.searchParams.set('expires_in_seconds', String(TOKEN_TTL_SECONDS));
  url.searchParams.set('max_session_duration_seconds', String(MAX_SESSION_SECONDS));

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!upstream.ok) throw new Error(`assemblyai_${upstream.status}`);
    const body = (await upstream.json()) as { token?: string };
    if (!body.token) throw new Error('no_token');
    return Response.json({ token: body.token, maxSessionSeconds: MAX_SESSION_SECONDS }, { headers });
  } catch {
    return Response.json(
      { error: 'line_unavailable', message: 'Jesse’s line is unavailable right now. Please try again shortly.' },
      { status: 502, headers },
    );
  }
}
