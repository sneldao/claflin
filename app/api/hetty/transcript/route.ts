import { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountFromRequest } from '@/lib/auth';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Account-bound transcript storage for Hetty calls. Signed-in callers only —
 * anonymous sessions store nothing, consistent with the tier model.
 * Retention is 30 days; transcripts are call records, not instructions.
 */

const turnSchema = z.object({
  role: z.enum(['user', 'agent']),
  text: z.string().min(1).max(4000),
  at: z.number().int().positive(),
}).strict();

const bodySchema = z.object({
  conversationId: z.string().regex(/^[\w-]{6,120}$/),
  turns: z.array(turnSchema).min(1).max(500),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
}).strict();

const TTL_SECONDS = 30 * 24 * 3600;

export async function POST(req: NextRequest): Promise<Response> {
  let userId: string | null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!userId) return Response.json({ error: 'sign_in_required' }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    if (JSON.stringify(body).length > 1_000_000) throw new Error('too_large');
    parsed = bodySchema.parse(body);
    if (parsed.endedAt < parsed.startedAt) throw new Error('bad_window');
  } catch {
    return Response.json({ error: 'invalid_transcript' }, { status: 400 });
  }

  try {
    const redis = getRedis();
    const key = `transcript:${userId}:${parsed.conversationId}`;
    await redis.set(key, parsed, { ex: TTL_SECONDS });
    await redis.sadd(`transcripts:${userId}`, parsed.conversationId);
    return Response.json({ stored: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript storage is unavailable on this deployment.' }, { status: 503 });
  }
}
