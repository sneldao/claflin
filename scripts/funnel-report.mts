/**
 * House funnel report — the §8 measures from docs/FOYER_LINE.md.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/funnel-report.mts [--days=7] [--json]
 *
 * Reads Upstash directly (UPSTASH_REDIS_REST_URL / _TOKEN); there is
 * deliberately no HTTP read endpoint. Days are UTC. See docs/FUNNEL_METRICS.md.
 */
import { Redis } from '@upstash/redis';
import { FUNNEL_STEPS, type FunnelStep } from '../lib/funnel/events.ts';
import { countsKey, reachKey, RETENTION_DAYS, type Audience } from '../lib/funnel/store.ts';
import { summarizeFunnel, type FunnelReport } from '../lib/funnel/report.ts';

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value] as const;
}));
const days = Math.min(Math.max(Number(args.get('days') ?? 7) || 7, 1), RETENTION_DAYS);

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (e.g. --env-file=.env.local).');
  process.exit(1);
}
const redis = new Redis({ url, token });

const dayList = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));

const counts: Record<string, number> = {};
for (const day of dayList) {
  const hash = await redis.hgetall<Record<string, number>>(countsKey(day));
  for (const [field, value] of Object.entries(hash ?? {})) counts[field] = (counts[field] ?? 0) + Number(value);
}

const reach = {} as Record<`${FunnelStep}:${Audience}`, number>;
for (const step of FUNNEL_STEPS) {
  for (const who of ['new', 'returning'] as const) {
    const [first, ...rest] = dayList.map(day => reachKey(day, step, who));
    /* PFCOUNT over several keys is the union — a visit across midnight counts once. */
    reach[`${step}:${who}`] = await redis.pfcount(first!, ...rest);
  }
}

const report = summarizeFunnel(counts, reach);
if (args.has('json')) {
  console.log(JSON.stringify({ days: dayList, report }, null, 2));
} else {
  print(report);
}

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function print(r: FunnelReport) {
  console.log(`Claflin house funnel · last ${days} UTC day(s): ${dayList[dayList.length - 1]} → ${dayList[0]}\n`);
  for (const who of ['new', 'returning'] as const) {
    console.log(`Journey — ${who === 'new' ? 'first-time browsers' : 'returning browsers'} (unique visits, share of visits)`);
    for (const row of r.journey[who]) console.log(`  ${row.step.padEnd(11)} ${String(row.visits).padStart(6)}  ${pct(row.ofVisits)}`);
    console.log('');
  }
  const i = r.instructions;
  console.log(`Instructions: ${i.total} · matched an offering ${pct(i.matchedShare)} · given while NYSE closed ${pct(i.afterHoursShare)}`);
  console.log(`  by source: ${fmt(i.bySource)}`);
  console.log(`  time to first instruction: ${fmt(i.firstInstructionLead)}`);
  console.log(`Mic: blocked ${fmt(r.mic.blocked)} · denied rate ${pct(r.mic.deniedRate)}`);
  console.log(`Landings: ${fmt(r.landings)}`);
  console.log(`Desk entries (desk:via): ${fmt(r.entries)}`);
  for (const [desk, row] of Object.entries(r.estimates)) {
    console.log(`Estimates ${desk}: quoted ${row.quoted} · unavailable ${row.unavailable} · availability ${pct(row.availability)}`);
  }
  console.log(`Records filed: ${fmt(r.filed)}`);
  console.log(`Records retrieved (desk:via): ${fmt(r.retrieved)}`);
}

function fmt(map: Record<string, number>): string {
  const entries = Object.entries(map);
  return entries.length ? entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') : 'none';
}
