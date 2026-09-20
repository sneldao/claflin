/**
 * Jesse live proposal store — short-lived binding for prepare → sign → execute.
 * Prefers Redis; falls back to process memory when Upstash is unset (local/dev).
 */

import type { SolanaLiveProposal } from './contracts';

const KEY_PREFIX = 'claflin.jesse.live.v1.';
const DEFAULT_TTL_MS = 90_000;

export type LiveProposalRecord = {
  proposal: SolanaLiveProposal;
  status: 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'unknown';
  signature: string | null;
  idempotencyKey: string | null;
};

const memory = new Map<string, { expiresAt: number; value: LiveProposalRecord }>();

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

async function redisGet(id: string): Promise<LiveProposalRecord | null> {
  try {
    const { getRedis } = await import('../redis');
    const redis = getRedis();
    const raw = await redis.get<LiveProposalRecord>(keyFor(id));
    return raw ?? null;
  } catch {
    return null;
  }
}

async function redisSet(id: string, value: LiveProposalRecord, ttlMs: number): Promise<boolean> {
  try {
    const { getRedis } = await import('../redis');
    const redis = getRedis();
    await redis.set(keyFor(id), value, { px: ttlMs });
    return true;
  } catch {
    return false;
  }
}

function memoryGet(id: string): LiveProposalRecord | null {
  const row = memory.get(id);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    memory.delete(id);
    return null;
  }
  return row.value;
}

function memorySet(id: string, value: LiveProposalRecord, ttlMs: number): void {
  if (memory.size > 200) {
    const now = Date.now();
    for (const [k, v] of memory) {
      if (now >= v.expiresAt) memory.delete(k);
    }
  }
  memory.set(id, { expiresAt: Date.now() + ttlMs, value });
}

export async function saveLiveProposal(proposal: SolanaLiveProposal, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  const value: LiveProposalRecord = {
    proposal,
    status: 'prepared',
    signature: null,
    idempotencyKey: null,
  };
  const ok = await redisSet(proposal.id, value, ttlMs);
  if (!ok) memorySet(proposal.id, value, ttlMs);
}

export async function loadLiveProposal(id: string): Promise<LiveProposalRecord | null> {
  const fromRedis = await redisGet(id);
  if (fromRedis) return fromRedis;
  return memoryGet(id);
}

export async function markLiveProposal(
  id: string,
  patch: Partial<Pick<LiveProposalRecord, 'status' | 'signature' | 'idempotencyKey'>>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<LiveProposalRecord | null> {
  const current = await loadLiveProposal(id);
  if (!current) return null;
  const next: LiveProposalRecord = { ...current, ...patch };
  const ok = await redisSet(id, next, ttlMs);
  if (!ok) memorySet(id, next, ttlMs);
  return next;
}

/** Test helper. */
export function clearLiveProposalMemory(): void {
  memory.clear();
}
