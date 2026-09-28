import { isFunnelDesk, leadBucket, MAX_BATCH_EVENTS, type FunnelBatch, type FunnelEvent } from './events';

/**
 * Browser side of the house funnel. Events are queued and sent as one small
 * beacon; a failed send is dropped, never retried and never surfaced — the
 * desk must behave identically whether or not anything is being counted.
 *
 * Opt-out: Global Privacy Control or Do Not Track turns the whole thing off.
 * Automated browsers (navigator.webdriver — Playwright, headless crawlers)
 * are never counted, so test runs do not pollute the baseline.
 */

export const FUNNEL_ENDPOINT = '/api/funnel';
const VISIT_KEY = 'claflin.visit.v1';
const SEEN_KEY = 'claflin.seen.v1';
const FLUSH_DELAY_MS = 5_000;

interface VisitState {
  id: string;
  newcomer: boolean;
  instructed: boolean;
  opened: boolean;
}

export interface FunnelDeps {
  local: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'> | null;
  session: Pick<Storage, 'getItem' | 'setItem'> | null;
  send: (body: string) => void;
  /** ms since the page started loading. */
  sinceLoad: () => number;
  optedOut: () => boolean;
  randomId: () => string;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface FunnelClient {
  track: (event: FunnelEvent) => void;
  /** Instruction events carry the time-to-first-instruction bucket once per visit. */
  trackInstruction: (source: 'spoken' | 'typed' | 'picked', matched: 'none' | 'one' | 'several') => void;
  /** Once per visit (a reload in the same tab is the same visit). */
  trackVisit: (landing: 'foyer' | 'desk') => void;
  flush: () => void;
}

export function createFunnel(deps: FunnelDeps): FunnelClient {
  let queue: FunnelEvent[] = [];
  let timer: unknown = null;
  let memoryVisit: VisitState | null = null;

  const readVisit = (): VisitState => {
    if (memoryVisit) return memoryVisit;
    try {
      const raw = deps.session?.getItem(VISIT_KEY);
      const parsed = raw ? JSON.parse(raw) as Partial<VisitState> : null;
      if (parsed && typeof parsed.id === 'string' && typeof parsed.newcomer === 'boolean') {
        memoryVisit = { id: parsed.id, newcomer: parsed.newcomer, instructed: parsed.instructed === true, opened: parsed.opened === true };
        return memoryVisit;
      }
    } catch { /* unreadable session storage: start a fresh visit */ }
    memoryVisit = { id: deps.randomId(), newcomer: isNewcomer(deps.local), instructed: false, opened: false };
    try { deps.local?.setItem(SEEN_KEY, '1'); } catch { /* storage may be blocked */ }
    writeVisit(memoryVisit);
    return memoryVisit;
  };

  const writeVisit = (visit: VisitState) => {
    try { deps.session?.setItem(VISIT_KEY, JSON.stringify(visit)); } catch { /* per-tab only; memory copy still holds */ }
  };

  const flush = () => {
    if (timer !== null) { deps.cancel(timer); timer = null; }
    if (queue.length === 0) return;
    const visit = readVisit();
    const events = queue.slice(0, MAX_BATCH_EVENTS);
    queue = queue.slice(MAX_BATCH_EVENTS);
    const batch: FunnelBatch = { visit: visit.id, newcomer: visit.newcomer, events };
    try { deps.send(JSON.stringify(batch)); } catch { /* counting must never break the desk */ }
    if (queue.length > 0) flush();
  };

  const track = (event: FunnelEvent) => {
    if (deps.optedOut()) return;
    queue.push(event);
    if (queue.length >= MAX_BATCH_EVENTS) { flush(); return; }
    if (timer === null) timer = deps.schedule(flush, FLUSH_DELAY_MS);
  };

  const trackInstruction: FunnelClient['trackInstruction'] = (source, matched) => {
    if (deps.optedOut()) return;
    const visit = readVisit();
    if (visit.instructed) {
      track({ event: 'instruction_given', source, matched });
      return;
    }
    visit.instructed = true;
    writeVisit(visit);
    track({ event: 'instruction_given', source, matched, lead: leadBucket(deps.sinceLoad()) });
  };

  const trackVisit: FunnelClient['trackVisit'] = landing => {
    if (deps.optedOut()) return;
    const visit = readVisit();
    if (visit.opened) return;
    visit.opened = true;
    writeVisit(visit);
    track({ event: 'visit_started', landing });
  };

  return { track, trackInstruction, trackVisit, flush };
}

/** A browser the house has never written to. Any existing `claflin.` key
 *  (a record, a draft, a last desk) means the visitor has been here before. */
function isNewcomer(local: FunnelDeps['local']): boolean {
  if (!local) return true;
  try {
    if (local.getItem(SEEN_KEY)) return false;
    for (let i = 0; i < local.length; i += 1) {
      if (local.key(i)?.startsWith('claflin.')) return false;
    }
    return true;
  } catch { return true; }
}

function browserOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.webdriver === true;
}

function browserRandomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function browserSend(body: string): void {
  const blob = new Blob([body], { type: 'application/json' });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(FUNNEL_ENDPOINT, blob)) return;
  void fetch(FUNNEL_ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
}

function safeStorage(pick: () => Storage): Storage | null {
  try { return pick(); } catch { return null; }
}

const NOOP: FunnelClient = { track: () => {}, trackInstruction: () => {}, trackVisit: () => {}, flush: () => {} };
let browserClient: FunnelClient | null = null;

function client(): FunnelClient {
  if (typeof window === 'undefined') return NOOP;
  if (browserClient) return browserClient;
  browserClient = createFunnel({
    local: safeStorage(() => window.localStorage),
    session: safeStorage(() => window.sessionStorage),
    send: browserSend,
    sinceLoad: () => performance.now(),
    optedOut: browserOptedOut,
    randomId: browserRandomId,
    schedule: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      /* Never hold a non-browser runtime (jsdom tests) open for a beacon. */
      (handle as { unref?: () => void }).unref?.();
      return handle;
    },
    cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const flushNow = () => browserClient?.flush();
  /* pagehide + hidden are the last reliable moments to send on mobile. */
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  return browserClient;
}

export function trackFunnel(event: FunnelEvent): void {
  client().track(event);
}

export function trackVisit(landing: 'foyer' | 'desk'): void {
  client().trackVisit(landing);
}

export function trackInstruction(source: 'spoken' | 'typed' | 'picked', matched: 'none' | 'one' | 'several'): void {
  client().trackInstruction(source, matched);
}

/** A paper record reopened from somewhere on a desk. */
export function countRetrieval(desk: string, via: 'ledger' | 'last_filing'): void {
  if (isFunnelDesk(desk)) trackFunnel({ event: 'record_retrieved', desk, via });
}
