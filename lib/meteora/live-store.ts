/**
 * Halley live proposal store — short-lived binding for prepare → sign →
 * broadcast. Same shape as Jesse's: prefers Redis; falls back to process
 * memory when Upstash is unset (local/dev).
 */

import type { HalleyLiveProposal } from './live-contracts';

const KEY_PREFIX = 'claflin.halley.live.v1.';
const DEFAULT_TTL_MS = 90_000;

export type HalleyLiveRecord = {
  proposal: HalleyLiveProposal;
  status: 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'partial' | 'unknown';
  /** Pool transaction signature — the launch's final evidence. */
  signature: string | null;
  /** Config transaction signature — set once tx1 is broadcast. */
  configSignature: string | null;
  idempotencyKey: string | null;
};

const memory = new Map<string, { expiresAt: number; value: HalleyLiveRecord }>();

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

async function redisGet(id: string): Promise<HalleyLiveRecord | null> {
  try {
    const { getRedis } = await import('../redis');
    const redis = getRedis();
    const raw = await redis.get<HalleyLiveRecord>(keyFor(id));
    return raw ?? null;
  } catch {
    return null;
  }
}

async function redisSet(id: string, value: HalleyLiveRecord, ttlMs: number): Promise<boolean> {
  try {
    const { getRedis } = await import('../redis');
    const redis = getRedis();
    await redis.set(keyFor(id), value, { px: ttlMs });
    return true;
  } catch {
    return false;
  }
}

function memoryGet(id: string): HalleyLiveRecord | null {
  const row = memory.get(id);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    memory.delete(id);
    return null;
  }
  return row.value;
}

function memorySet(id: string, value: HalleyLiveRecord, ttlMs: number): void {
  if (memory.size > 200) {
    const now = Date.now();
    for (const [k, v] of memory) {
      if (now >= v.expiresAt) memory.delete(k);
    }
  }
  memory.set(id, { expiresAt: Date.now() + ttlMs, value });
}

export async function saveHalleyLiveProposal(proposal: HalleyLiveProposal, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  const value: HalleyLiveRecord = {
    proposal,
    status: 'prepared',
    signature: null,
    configSignature: null,
    idempotencyKey: null,
  };
  const ok = await redisSet(proposal.id, value, ttlMs);
  if (!ok) memorySet(proposal.id, value, ttlMs);
}

export async function loadHalleyLiveProposal(id: string): Promise<HalleyLiveRecord | null> {
  const fromRedis = await redisGet(id);
  if (fromRedis) return fromRedis;
  return memoryGet(id);
}

export async function markHalleyLiveProposal(
  id: string,
  patch: Partial<Pick<HalleyLiveRecord, 'status' | 'signature' | 'configSignature' | 'idempotencyKey'>>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<HalleyLiveRecord | null> {
  const current = await loadHalleyLiveProposal(id);
  if (!current) return null;
  const next: HalleyLiveRecord = { ...current, ...patch };
  const ok = await redisSet(id, next, ttlMs);
  if (!ok) memorySet(id, next, ttlMs);
  return next;
}

/** Test helper. */
export function clearHalleyLiveMemory(): void {
  memory.clear();
}
