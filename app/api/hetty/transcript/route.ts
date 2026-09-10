import { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountFromRequest } from '@/lib/auth';
import { getRedis } from '@/lib/redis';
import { keptTranscriptRevision } from '@/lib/hetty/transcript-revision';
import { sortTranscriptList, toTranscriptListItem } from '@/lib/hetty/transcript-list';

export const dynamic = 'force-dynamic';

const transcriptSchema = z.object({
  conversationId: z.string().regex(/^[\w-]{6,120}$/),
  turns: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string().min(1).max(4000), at: z.number().int().positive() }).strict()).min(1).max(500),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  /** Monotonic checkpoint revision — older writes must not overwrite newer ones. */
  revision: z.number().int().positive().optional(),
}).strict();

/**
 * Account-bound transcript storage for Hetty calls. Signed-in callers only —
 * anonymous sessions store nothing, consistent with the tier model.
 * Retention is 30 days; transcripts are call records, not instructions.
 */

const bodySchema = transcriptSchema;

const TTL_SECONDS = 30 * 24 * 3600;

async function requireUser(req: NextRequest): Promise<{ userId: string } | Response> {
  let userId: string | null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!userId) return Response.json({ error: 'sign_in_required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return { userId };
}

/** GET /api/hetty/transcript — list saved calls (compact).
 *  GET /api/hetty/transcript?conversationId=… — retrieve one.
 *  DELETE /api/hetty/transcript?conversationId=… — remove one. */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const conversationId = req.nextUrl.searchParams.get('conversationId') ?? '';
  try {
    const redis = getRedis();
    if (!conversationId) {
      const ids = await redis.smembers(`transcripts:${auth.userId}`);
      const items = [];
      for (const id of ids.slice(0, 40)) {
        if (!/^[\w-]{6,120}$/.test(id)) continue;
        try {
          const raw = await redis.get(`transcript:${auth.userId}:${id}`);
          if (!raw) continue;
          const parsed = transcriptSchema.parse(raw);
          items.push(toTranscriptListItem(id, parsed));
        } catch { /* skip corrupt rows */ }
      }
      return Response.json({ transcripts: sortTranscriptList(items) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!/^[\w-]{6,120}$/.test(conversationId)) {
      return Response.json({ error: 'invalid_transcript' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const raw = await redis.get(`transcript:${auth.userId}:${conversationId}`);
    if (!raw) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ transcript: transcriptSchema.parse(raw) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript retrieval is unavailable on this deployment.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const conversationId = req.nextUrl.searchParams.get('conversationId') ?? '';
  if (!/^[\w-]{6,120}$/.test(conversationId)) {
    return Response.json({ error: 'invalid_transcript' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const redis = getRedis();
    await redis.del(`transcript:${auth.userId}:${conversationId}`);
    await redis.srem(`transcripts:${auth.userId}`, conversationId);
    return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript deletion is unavailable on this deployment.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const userId = auth.userId;

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
    const revision = parsed.revision ?? parsed.turns.length;
    try {
      const existing = await redis.get(key);
      if (existing && typeof existing === 'object' && existing !== null && 'revision' in existing) {
        const kept = keptTranscriptRevision((existing as { revision?: unknown }).revision, revision);
        if (kept !== null) {
          return Response.json({ stored: true, kept: 'newer', revision: kept }, { headers: { 'Cache-Control': 'no-store' } });
        }
      }
    } catch { /* compare is best-effort; a fresh write still proceeds */ }
    await redis.set(key, { ...parsed, revision }, { ex: TTL_SECONDS });
    await redis.sadd(`transcripts:${userId}`, parsed.conversationId);
    return Response.json({ stored: true, revision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Transcript storage is unavailable on this deployment.' }, { status: 503 });
  }
}
