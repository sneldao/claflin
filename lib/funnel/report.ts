import { FUNNEL_STEPS, type FunnelStep } from './events';
import type { Audience } from './store';

/**
 * Turns stored funnel counters into the §8 measures (docs/FOYER_LINE.md).
 * Pure — the report script supplies the Redis reads.
 */

export interface ParsedField { event: string; dims: Record<string, string> }

export function parseField(field: string): ParsedField {
  const [event = '', ...parts] = field.split('|');
  const dims: Record<string, string> = {};
  for (const part of parts) {
    const at = part.indexOf('=');
    if (at > 0) dims[part.slice(0, at)] = part.slice(at + 1);
  }
  return { event, dims };
}

export interface FunnelReport {
  /** Unique visits reaching each step; `ofVisits` is the share of visits that opened the house. */
  journey: Record<Audience, { step: FunnelStep; visits: number; ofVisits: number | null }[]>;
  landings: Record<string, number>;
  instructions: {
    total: number;
    bySource: Record<string, number>;
    matchedShare: number | null;
    afterHoursShare: number | null;
    firstInstructionLead: Record<string, number>;
  };
  mic: { blocked: Record<string, number>; deniedRate: number | null };
  entries: Record<string, number>;
  estimates: Record<string, { quoted: number; unavailable: number; availability: number | null }>;
  filed: Record<string, number>;
  retrieved: Record<string, number>;
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const bump = (map: Record<string, number>, key: string | undefined, by: number) => {
  const k = key ?? 'unknown';
  map[k] = (map[k] ?? 0) + by;
};

export function summarizeFunnel(counts: Record<string, number>, reach: Record<`${FunnelStep}:${Audience}`, number>): FunnelReport {
  const report: FunnelReport = {
    journey: { new: [], returning: [] },
    landings: {},
    instructions: { total: 0, bySource: {}, matchedShare: null, afterHoursShare: null, firstInstructionLead: {} },
    mic: { blocked: {}, deniedRate: null },
    entries: {},
    estimates: {},
    filed: {},
    retrieved: {},
  };
  let matched = 0;
  let afterHours = 0;
  let micTotal = 0;

  for (const [field, raw] of Object.entries(counts)) {
    const n = Number(raw) || 0;
    const { event, dims } = parseField(field);
    switch (event) {
      case 'visit_started':
        bump(report.landings, dims.landing, n);
        break;
      case 'instruction_given':
        report.instructions.total += n;
        bump(report.instructions.bySource, dims.source, n);
        if (dims.matched && dims.matched !== 'none') matched += n;
        if (dims.hours === 'closed') afterHours += n;
        if (dims.lead) bump(report.instructions.firstInstructionLead, dims.lead, n);
        break;
      case 'mic_blocked':
        micTotal += n;
        bump(report.mic.blocked, dims.reason, n);
        break;
      case 'desk_entered':
        bump(report.entries, `${dims.desk}:${dims.via}`, n);
        break;
      case 'estimate_returned': {
        const desk = dims.desk ?? 'unknown';
        const row = report.estimates[desk] ?? { quoted: 0, unavailable: 0, availability: null };
        if (dims.outcome === 'quoted') row.quoted += n; else row.unavailable += n;
        row.availability = share(row.quoted, row.quoted + row.unavailable);
        report.estimates[desk] = row;
        break;
      }
      case 'record_filed':
        bump(report.filed, dims.desk, n);
        break;
      case 'record_retrieved':
        bump(report.retrieved, `${dims.desk}:${dims.via}`, n);
        break;
    }
  }

  report.instructions.matchedShare = share(matched, report.instructions.total);
  report.instructions.afterHoursShare = share(afterHours, report.instructions.total);
  /* Of every attempt to open the house mic, how many were refused outright. */
  const spoken = report.instructions.bySource.spoken ?? 0;
  report.mic.deniedRate = share(report.mic.blocked.denied ?? 0, spoken + micTotal);

  for (const who of ['new', 'returning'] as const) {
    const opened = reach[`visited:${who}`] ?? 0;
    report.journey[who] = FUNNEL_STEPS.map(step => {
      const visits = reach[`${step}:${who}`] ?? 0;
      return { step, visits, ofVisits: step === 'visited' ? null : share(visits, opened) };
    });
  }
  return report;
}
