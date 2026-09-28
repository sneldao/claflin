/**
 * The house funnel — the §8 measures in docs/FOYER_LINE.md, as events.
 *
 * Every field is an enum or a boolean. No instruction text, amounts,
 * instrument ids, record ids, account ids or wallet addresses ever travel:
 * the funnel answers "how far did people get", never "who did what".
 * Retention and storage are documented in docs/FUNNEL_METRICS.md.
 */

export const FUNNEL_DESKS = ['hetty', 'jesse'] as const;
export type FunnelDesk = (typeof FUNNEL_DESKS)[number];

export const INSTRUCTION_SOURCES = ['spoken', 'typed', 'picked'] as const;
export const OFFERING_MATCHES = ['none', 'one', 'several'] as const;
export const LEAD_BUCKETS = ['under_10s', '10_30s', '30_120s', 'over_120s'] as const;
export const MIC_REASONS = ['denied', 'no_device', 'unsupported', 'interrupted', 'other'] as const;
export const ENTRY_ROUTES = ['foyer', 'link', 'returning', 'switch'] as const;
export const ESTIMATE_OUTCOMES = ['quoted', 'unavailable'] as const;
export const RETRIEVAL_ROUTES = ['ledger', 'last_filing', 'foyer', 'link'] as const;

export type LeadBucket = (typeof LEAD_BUCKETS)[number];
export type MicReason = (typeof MIC_REASONS)[number];

export const LANDINGS = ['foyer', 'desk'] as const;

export type FunnelEvent =
  /** The house was opened in this tab — once per visit; the funnel's denominator. */
  | { event: 'visit_started'; landing: (typeof LANDINGS)[number] }
  /** An instruction reached the house line. `matched` is the house book's
   *  answer; `lead` is time from page load, sent only on a visit's first. */
  | { event: 'instruction_given'; source: (typeof INSTRUCTION_SOURCES)[number]; matched: (typeof OFFERING_MATCHES)[number]; lead?: LeadBucket }
  /** The house line could not open the microphone. */
  | { event: 'mic_blocked'; reason: MicReason }
  | { event: 'desk_entered'; desk: FunnelDesk; via: (typeof ENTRY_ROUTES)[number]; carried: boolean }
  | { event: 'estimate_returned'; desk: FunnelDesk; outcome: (typeof ESTIMATE_OUTCOMES)[number] }
  | { event: 'record_filed'; desk: FunnelDesk }
  | { event: 'record_retrieved'; desk: FunnelDesk; via: (typeof RETRIEVAL_ROUTES)[number] };

export type FunnelEventName = FunnelEvent['event'];

/** One beacon: a per-tab visit id (random, never persisted past the tab),
 *  whether this browser had never seen the house before, and the events. */
export interface FunnelBatch {
  visit: string;
  newcomer: boolean;
  events: FunnelEvent[];
}

export const MAX_BATCH_EVENTS = 20;
export const VISIT_ID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

/** Funnel steps counted as unique visits, in journey order. */
export const FUNNEL_STEPS = ['visited', 'instructed', 'matched', 'entered', 'quoted', 'filed', 'retrieved'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** Which journey step an event proves the visit reached, if any. */
export function stepsFor(event: FunnelEvent): FunnelStep[] {
  switch (event.event) {
    case 'visit_started': return ['visited'];
    case 'instruction_given': return event.matched === 'none' ? ['instructed'] : ['instructed', 'matched'];
    case 'desk_entered': return ['entered'];
    case 'estimate_returned': return event.outcome === 'quoted' ? ['quoted'] : [];
    case 'record_filed': return ['filed'];
    case 'record_retrieved': return ['retrieved'];
    case 'mic_blocked': return [];
  }
}

export function leadBucket(ms: number): LeadBucket {
  if (ms < 10_000) return 'under_10s';
  if (ms < 30_000) return '10_30s';
  if (ms < 120_000) return '30_120s';
  return 'over_120s';
}

export function isFunnelDesk(id: string): id is FunnelDesk {
  return (FUNNEL_DESKS as readonly string[]).includes(id);
}
