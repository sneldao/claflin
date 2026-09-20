import { quoteBudget } from '@/lib/trading/http';
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
const sessionBudget = quoteBudget(); // 10 signed URLs per minute per instance
const userBudgets = new Map<string, { count: number; resetAt: number }>();
const USER_SESSION_LIMIT = 5; // per minute, per account

function userBudget(userId: string): boolean {
  const now = Date.now();
  const entry = userBudgets.get(userId);
  if (!entry || entry.resetAt < now) {
    userBudgets.set(userId, { count: 1, resetAt: now + 60_000 });
    if (userBudgets.size > 5000) userBudgets.clear();
    return true;
  }
  if (entry.count >= USER_SESSION_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  let userId: string | null = null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized', message: 'Sign in again to ring Jesse.' }, { status: 401, headers });
  }

  const allowed = userId ? userBudget(userId) : sessionBudget();
  if (!allowed) {
    return Response.json({ error: 'busy', message: 'Too many call requests. Please wait a moment.' }, { status: 429, headers: { ...headers, 'Retry-After': '10' } });
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
