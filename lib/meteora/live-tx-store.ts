/**
 * Store for Halley's single-transaction live actions (swap, claim) —
 * prepare → sign → broadcast binding. Same posture as the launch store:
 * Redis when Upstash is configured, process memory otherwise.
 */

import type { HalleyTxProposal } from './live-contracts';

const KEY_PREFIX = 'claflin.halley.tx.v1.';
const DEFAULT_TTL_MS = 60_000;

export type HalleyTxRecord = {
  proposal: HalleyTxProposal;
  status: 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'unknown';
  signature: string | null;
  idempotencyKey: string | null;
};

const memory = new Map<string, { expiresAt: number; value: HalleyTxRecord }>();

async function redisGet(id: string): Promise<HalleyTxRecord | null> {
  try {
    const { getRedis } = await import('../redis');
    return (await getRedis().get<HalleyTxRecord>(KEY_PREFIX + id)) ?? null;
  } catch {
    return null;
  }
}

async function redisSet(id: string, value: HalleyTxRecord, ttlMs: number): Promise<boolean> {
  try {
    const { getRedis } = await import('../redis');
    await getRedis().set(KEY_PREFIX + id, value, { px: ttlMs });
    return true;
  } catch {
    return false;
  }
}

function memorySet(id: string, value: HalleyTxRecord, ttlMs: number): void {
  if (memory.size > 200) {
    const now = Date.now();
    for (const [k, v] of memory) if (now >= v.expiresAt) memory.delete(k);
  }
  memory.set(id, { expiresAt: Date.now() + ttlMs, value });
}

export async function saveHalleyTxProposal(proposal: HalleyTxProposal, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  const value: HalleyTxRecord = { proposal, status: 'prepared', signature: null, idempotencyKey: null };
  if (!(await redisSet(proposal.id, value, ttlMs))) memorySet(proposal.id, value, ttlMs);
}

export async function loadHalleyTxProposal(id: string): Promise<HalleyTxRecord | null> {
  const fromRedis = await redisGet(id);
  if (fromRedis) return fromRedis;
  const row = memory.get(id);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    memory.delete(id);
    return null;
  }
  return row.value;
}

export async function markHalleyTxProposal(
  id: string,
  patch: Partial<Pick<HalleyTxRecord, 'status' | 'signature' | 'idempotencyKey'>>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<HalleyTxRecord | null> {
  const current = await loadHalleyTxProposal(id);
  if (!current) return null;
  const next: HalleyTxRecord = { ...current, ...patch };
  if (!(await redisSet(id, next, ttlMs))) memorySet(id, next, ttlMs);
  return next;
}

/** Test helper. */
export function clearHalleyTxMemory(): void {
  memory.clear();
}
