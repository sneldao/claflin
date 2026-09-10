import { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountFromRequest } from '@/lib/auth';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Account-bound paper records. Requires a verified Privy token — anonymous
 * callers keep their browser-local history only. Records are simulations,
 * not positions; syncing does not make them authoritative.
 */

const recordSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[\w-]{1,100}$/),
  mode: z.literal('paper'),
  deskId: z.enum(['hetty', 'jesse', 'isabel', 'arbitrum']).optional(),
  owner: z.union([z.literal('anonymous'), z.string().min(1).max(128)]).optional(),
  createdAt: z.number().int().positive(),
  quote: z.unknown(),
}).strict();

const bodySchema = z.object({ records: z.array(recordSchema).max(100) });
const MAX_RECORDS = 100;

async function requireAccount(req: NextRequest): Promise<{ userId: string } | Response> {
  let userId: string | null;
  try {
    userId = await accountFromRequest(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!userId) return Response.json({ error: 'sign_in_required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return { userId };
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAccount(req);
  if (auth instanceof Response) return auth;
  try {
    const raw = await getRedis().get(`paper:${auth.userId}`);
    const records = z.array(recordSchema).max(MAX_RECORDS).parse(raw ?? []);
    return Response.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Record sync is unavailable on this deployment.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAccount(req);
  if (auth instanceof Response) return auth;
  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    if (JSON.stringify(body).length > 2_000_000) throw new Error('too_large');
    parsed = bodySchema.parse(body);
  } catch {
    return Response.json({ error: 'invalid_records' }, { status: 400 });
  }
  try {
    const existing = z.array(recordSchema).max(MAX_RECORDS).parse(await getRedis().get(`paper:${auth.userId}`) ?? []);
    const merged = new Map(existing.map(r => [r.id, r] as const));
    for (const r of parsed.records) merged.set(r.id, r);
    const list = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_RECORDS);
    await getRedis().set(`paper:${auth.userId}`, list);
    return Response.json({ records: list }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable', message: 'Record sync is unavailable on this deployment.' }, { status: 503 });
  }
}
