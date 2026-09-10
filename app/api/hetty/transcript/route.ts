import { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountFromRequest } from '@/lib/auth';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const transcriptSchema = z.object({
  conversationId: z.string().regex(/^[\w-]{6,120}$/),
  turns: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string().min(1).max(4000), at: z.number().int().positive() }).strict()).min(1).max(500),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
}).strict();

/**
 * Account-bound transcript storage for Hetty calls. Signed-in callers only —
 * anonymous sessions store nothing, consistent with the tier model.
 * Retention is 30 days; transcripts are call records, not instructions.
 */

const bodySchema = transcriptSchema;

const TTL_SECONDS = 30 * 24 * 3600;

/** GET /api/hetty/transcript?conversationId=… — retrieve one saved call.
 *  DELETE /api/hetty/transcript?conversationId=… — remove it. Both require
 *  the caller's token and only touch that caller's own rows. */
async function requireOwnership(req: NextRequest): Promise<{ userId: string; conversationId: string } | Response> {
  let userId: string | null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!userId) return Response.json({ error: 'sign_in_required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const conversationId = req.nextUrl.searchParams.get('conversationId') ?? '';
  if (!/^[\w-]{6,120}$/.test(conversationId)) {
    return Response.json({ error: 'invalid_transcript' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return { userId, conversationId };
}

export async function GET(req: NextRequest): Promise<Response> {
  const owned = await requireOwnership(req);
  if (owned instanceof Response) return owned;
  try {
    const raw = await getRedis().get(`transcript:${owned.userId}:${owned.conversationId}`);
    if (!raw) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ transcript: transcriptSchema.parse(raw) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript retrieval is unavailable on this deployment.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const owned = await requireOwnership(req);
  if (owned instanceof Response) return owned;
  try {
    const redis = getRedis();
    await redis.del(`transcript:${owned.userId}:${owned.conversationId}`);
    await redis.srem(`transcripts:${owned.userId}`, owned.conversationId);
    return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript deletion is unavailable on this deployment.' }, { status: 503 });
  }
}

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
