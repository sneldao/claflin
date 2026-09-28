import { z } from 'zod';
import { marketClock } from '@/lib/market-clock';
import {
  ENTRY_ROUTES, ESTIMATE_OUTCOMES, FUNNEL_DESKS, INSTRUCTION_SOURCES, LANDINGS, LEAD_BUCKETS, MAX_BATCH_EVENTS,
  MIC_REASONS, OFFERING_MATCHES, RETRIEVAL_ROUTES, VISIT_ID_PATTERN, stepsFor,
  type FunnelBatch, type FunnelEvent, type FunnelStep,
} from './events';

/**
 * Server side of the house funnel. Two Redis shapes, both per UTC day and
 * both expiring after RETENTION_DAYS (docs/FUNNEL_METRICS.md):
 *
 *   funnel:counts:{day}              Hash  field = event|dim=value|… → count
 *   funnel:reach:{day}:{step}:{who}  HLL   approximate unique visits reaching a step
 *
 * The HyperLogLog keeps only a cardinality sketch — visit ids cannot be
 * listed back out of it.
 */

export const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

const desk = z.enum(FUNNEL_DESKS);
const eventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('visit_started'), landing: z.enum(LANDINGS) }).strict(),
  z.object({ event: z.literal('instruction_given'), source: z.enum(INSTRUCTION_SOURCES), matched: z.enum(OFFERING_MATCHES), lead: z.enum(LEAD_BUCKETS).optional() }).strict(),
  z.object({ event: z.literal('mic_blocked'), reason: z.enum(MIC_REASONS) }).strict(),
  z.object({ event: z.literal('desk_entered'), desk, via: z.enum(ENTRY_ROUTES), carried: z.boolean() }).strict(),
  z.object({ event: z.literal('estimate_returned'), desk, outcome: z.enum(ESTIMATE_OUTCOMES) }).strict(),
  z.object({ event: z.literal('record_filed'), desk }).strict(),
  z.object({ event: z.literal('record_retrieved'), desk, via: z.enum(RETRIEVAL_ROUTES) }).strict(),
]);

export const batchSchema = z.object({
  visit: z.string().regex(VISIT_ID_PATTERN),
  newcomer: z.boolean(),
  events: z.array(eventSchema).min(1).max(MAX_BATCH_EVENTS),
}).strict();

export function parseBatch(raw: unknown): FunnelBatch | null {
  const parsed = batchSchema.safeParse(raw);
  return parsed.success ? parsed.data as FunnelBatch : null;
}

export type Audience = 'new' | 'returning';

export const countsKey = (day: string) => `funnel:counts:${day}`;
export const reachKey = (day: string, step: FunnelStep, who: Audience) => `funnel:reach:${day}:${step}:${who}`;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** `desk_entered|carried=1|desk=hetty|hours=closed|new=1|via=foyer` — dims sorted so equal events share a field. */
export function countField(event: FunnelEvent, hours: 'open' | 'closed', newcomer: boolean): string {
  const dims: Record<string, string> = { hours, new: newcomer ? '1' : '0' };
  for (const [key, value] of Object.entries(event)) {
    if (key === 'event' || value === undefined) continue;
    dims[key] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  }
  const parts = Object.keys(dims).sort().map(key => `${key}=${dims[key]}`);
  return [event.event, ...parts].join('|');
}

export interface FunnelWrites {
  counts: { key: string; field: string; by: number }[];
  reach: { key: string; visit: string }[];
}

/** What a batch writes — pure, so the storage contract is testable without Redis. */
export function funnelWrites(batch: FunnelBatch, now: Date): FunnelWrites {
  const day = utcDay(now);
  const hours = marketClock(now).exchange;
  const who: Audience = batch.newcomer ? 'new' : 'returning';
  const tally = new Map<string, number>();
  const steps = new Set<FunnelStep>();
  for (const event of batch.events) {
    const field = countField(event, hours, batch.newcomer);
    tally.set(field, (tally.get(field) ?? 0) + 1);
    for (const step of stepsFor(event)) steps.add(step);
  }
  return {
    counts: [...tally].map(([field, by]) => ({ key: countsKey(day), field, by })),
    reach: [...steps].map(step => ({ key: reachKey(day, step, who), visit: batch.visit })),
  };
}

/** The subset of the Upstash pipeline the store uses. */
export interface FunnelPipeline {
  hincrby: (key: string, field: string, by: number) => unknown;
  pfadd: (key: string, ...elements: string[]) => unknown;
  expire: (key: string, seconds: number) => unknown;
  exec: () => Promise<unknown>;
}

export async function recordBatch(pipeline: FunnelPipeline, batch: FunnelBatch, now = new Date()): Promise<void> {
  const writes = funnelWrites(batch, now);
  const touched = new Set<string>();
  for (const { key, field, by } of writes.counts) { pipeline.hincrby(key, field, by); touched.add(key); }
  for (const { key, visit } of writes.reach) { pipeline.pfadd(key, visit); touched.add(key); }
  for (const key of touched) pipeline.expire(key, RETENTION_SECONDS);
  await pipeline.exec();
}
