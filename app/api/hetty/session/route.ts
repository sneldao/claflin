import { quoteBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hetty/session
 *
 * Mints a signed ElevenLabs ConvAI URL for a live voice session with
 * Hetty. The API key and agent id stay server-side; the browser only
 * ever sees a short-lived signed URL. Hetty's desk tools are client
 * tools — she can draft, quote and record paper trades, never execute.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const sessionBudget = quoteBudget(); // 10 signed URLs per minute per instance

export async function POST(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!sessionBudget()) {
    return Response.json({ error: 'busy', message: 'Too many call requests. Please wait a moment.' }, { status: 429, headers: { ...headers, 'Retry-After': '10' } });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_HETTY;
  if (!apiKey || !agentId) {
    return Response.json({ error: 'not_connected', message: 'Hetty’s line is not connected on this deployment.' }, { status: 503, headers });
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) throw new Error(`elevenlabs_${response.status}`);
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) throw new Error('no_signed_url');
    return Response.json({ signedUrl: body.signed_url }, { headers });
  } catch {
    return Response.json({ error: 'line_unavailable', message: 'Hetty’s line is unavailable right now. Please try again shortly.' }, { status: 502, headers });
  }
}
