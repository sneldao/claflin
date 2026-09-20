/**
 * POST /api/desk/jesse/voice/token
 *
 * Mints a short-lived AssemblyAI streaming token for Jesse. Returns
 * unavailable (never a fake token) when credentials are missing.
 * Instance + IP budgets limit quota burn on a public demo URL.
 */
import { NextRequest } from 'next/server';
import { busyResponse, clientKeyFromRequest, keyedBudget, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const instanceBudget = requestBudget(20); // AssemblyAI mints / minute / instance
const ipBudget = keyedBudget(5); // per client IP / minute

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!instanceBudget() || !ipBudget(clientKeyFromRequest(req))) {
    return busyResponse('Too many voice-token requests. Please wait a moment.');
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return Response.json({
      error: 'unavailable',
      message: 'Jesse’s conversational line is not configured on this deployment. Use the typed bar or fill the ticket.',
    }, { status: 503, headers });
  }

  try {
    const upstream = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
      method: 'GET',
      headers: { Authorization: apiKey },
    });
    if (!upstream.ok) {
      return Response.json({
        error: 'unavailable',
        message: 'The voice service could not mint a session. Try again shortly, or use the typed bar.',
      }, { status: 503, headers });
    }
    const data = await upstream.json() as { token?: string };
    if (!data.token) {
      return Response.json({
        error: 'unavailable',
        message: 'The voice service returned an empty session. Use the typed bar.',
      }, { status: 503, headers });
    }
    return Response.json({ token: data.token, maxSessionSeconds: 600 }, { headers });
  } catch {
    return Response.json({
      error: 'unavailable',
      message: 'The voice service could not be reached. Use the typed bar or the ticket.',
    }, { status: 503, headers });
  }
}
