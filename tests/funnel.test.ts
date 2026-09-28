import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { leadBucket, stepsFor, type FunnelBatch } from '../lib/funnel/events.ts';
import { createFunnel, type FunnelDeps } from '../lib/funnel/client.ts';
import { countField, funnelWrites, parseBatch, recordBatch, RETENTION_DAYS } from '../lib/funnel/store.ts';
import { parseField, summarizeFunnel } from '../lib/funnel/report.ts';
import { instructionMatch, readInstruction } from '../lib/desk/turret.ts';
import { proxy } from '../proxy.ts';
import { POST } from '../app/api/funnel/route.ts';

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
    map,
  };
}

function harness(overrides: Partial<FunnelDeps> = {}) {
  const sent: FunnelBatch[] = [];
  const timers: (() => void)[] = [];
  let clock = 4_000;
  const deps: FunnelDeps = {
    local: memoryStorage(),
    session: memoryStorage(),
    send: body => { sent.push(JSON.parse(body)); },
    sinceLoad: () => clock,
    optedOut: () => false,
    randomId: () => 'visit_abcdefghijklmnop',
    schedule: fn => { timers.push(fn); return timers.length; },
    cancel: () => {},
    ...overrides,
  };
  return { funnel: createFunnel(deps), sent, timers, advance: (ms: number) => { clock += ms; } };
}

describe('funnel client', () => {
  it('batches events into one beacon and never sends words', () => {
    const { funnel, sent } = harness();
    funnel.trackVisit('foyer');
    funnel.trackInstruction('typed', 'one');
    funnel.track({ event: 'desk_entered', desk: 'hetty', via: 'foyer', carried: true });
    assert.equal(sent.length, 0, 'queued until the flush timer or page hide');
    funnel.flush();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      visit: 'visit_abcdefghijklmnop',
      newcomer: true,
      events: [
        { event: 'visit_started', landing: 'foyer' },
        { event: 'instruction_given', source: 'typed', matched: 'one', lead: 'under_10s' },
        { event: 'desk_entered', desk: 'hetty', via: 'foyer', carried: true },
      ],
    });
  });

  it('buckets time-to-first-instruction once per visit, and opens a visit once', () => {
    const { funnel, sent, advance } = harness();
    funnel.trackVisit('foyer');
    funnel.trackVisit('desk');
    advance(20_000);
    funnel.trackInstruction('spoken', 'several');
    funnel.trackInstruction('typed', 'none');
    funnel.flush();
    const events = sent[0]!.events;
    assert.equal(events.filter(e => e.event === 'visit_started').length, 1);
    assert.deepEqual(events.slice(1), [
      { event: 'instruction_given', source: 'spoken', matched: 'several', lead: '10_30s' },
      { event: 'instruction_given', source: 'typed', matched: 'none' },
    ]);
  });

  it('treats any existing claflin storage as a returning browser', () => {
    const { funnel, sent } = harness({ local: memoryStorage({ 'claflin.desk.v1.last': 'hetty' }) });
    funnel.track({ event: 'record_filed', desk: 'jesse' });
    funnel.flush();
    assert.equal(sent[0]!.newcomer, false);
  });

  it('keeps the visit for the tab across a reload', () => {
    const session = memoryStorage();
    const first = harness({ session });
    first.funnel.trackVisit('foyer');
    first.funnel.flush();
    const second = harness({ session, randomId: () => 'another_visit_id_000' });
    second.funnel.trackVisit('desk');
    second.funnel.track({ event: 'record_filed', desk: 'hetty' });
    second.funnel.flush();
    assert.equal(second.sent[0]!.visit, 'visit_abcdefghijklmnop');
    assert.deepEqual(second.sent[0]!.events, [{ event: 'record_filed', desk: 'hetty' }], 'the reload is not a second visit');
  });

  it('sends nothing when the browser opts out', () => {
    const { funnel, sent, timers } = harness({ optedOut: () => true });
    funnel.trackVisit('foyer');
    funnel.trackInstruction('typed', 'one');
    funnel.flush();
    assert.equal(sent.length, 0);
    assert.equal(timers.length, 0);
  });

  it('a failing transport never throws into the desk', () => {
    const { funnel } = harness({ send: () => { throw new Error('offline'); } });
    funnel.track({ event: 'record_filed', desk: 'hetty' });
    assert.doesNotThrow(() => funnel.flush());
  });
});

describe('funnel events', () => {
  it('buckets lead time at the §8 thresholds', () => {
    assert.equal(leadBucket(9_999), 'under_10s');
    assert.equal(leadBucket(29_999), '10_30s');
    assert.equal(leadBucket(119_999), '30_120s');
    assert.equal(leadBucket(120_000), 'over_120s');
  });

  it('maps events to journey steps', () => {
    assert.deepEqual(stepsFor({ event: 'instruction_given', source: 'typed', matched: 'none' }), ['instructed']);
    assert.deepEqual(stepsFor({ event: 'instruction_given', source: 'typed', matched: 'one' }), ['instructed', 'matched']);
    assert.deepEqual(stepsFor({ event: 'estimate_returned', desk: 'hetty', outcome: 'unavailable' }), []);
    assert.deepEqual(stepsFor({ event: 'estimate_returned', desk: 'jesse', outcome: 'quoted' }), ['quoted']);
  });

  it('reads the house book answer for an instruction', () => {
    assert.equal(instructionMatch(readInstruction('')), null);
    assert.equal(instructionMatch(readInstruction('buy some zzzz widgets')), 'none');
    assert.notEqual(instructionMatch(readInstruction('buy Apple for 100 USDC')), 'none');
  });
});

describe('funnel store', () => {
  const batch: FunnelBatch = {
    visit: 'visit_abcdefghijklmnop',
    newcomer: true,
    events: [
      { event: 'instruction_given', source: 'spoken', matched: 'one', lead: 'under_10s' },
      { event: 'desk_entered', desk: 'jesse', via: 'foyer', carried: true },
      { event: 'estimate_returned', desk: 'jesse', outcome: 'quoted' },
      { event: 'estimate_returned', desk: 'jesse', outcome: 'quoted' },
    ],
  };

  it('accepts only enums and booleans', () => {
    assert.ok(parseBatch(batch));
    assert.equal(parseBatch({ ...batch, events: [{ event: 'instruction_given', source: 'typed', matched: 'one', text: 'buy apple' }] }), null, 'no free text');
    assert.equal(parseBatch({ ...batch, userId: 'did:privy:1' }), null, 'no identifiers');
    assert.equal(parseBatch({ ...batch, visit: 'x' }), null);
    assert.equal(parseBatch({ ...batch, events: [] }), null);
    assert.equal(parseBatch({ ...batch, events: [{ event: 'record_filed', desk: 'isabel' }] }), null);
  });

  it('writes day-scoped counters and unique-visit sketches', () => {
    const saturday = new Date('2026-09-26T15:00:00Z');
    const writes = funnelWrites(batch, saturday);
    assert.deepEqual(writes.counts.map(c => [c.field, c.by]), [
      ['instruction_given|hours=closed|lead=under_10s|matched=one|new=1|source=spoken', 1],
      ['desk_entered|carried=1|desk=jesse|hours=closed|new=1|via=foyer', 1],
      ['estimate_returned|desk=jesse|hours=closed|new=1|outcome=quoted', 2],
    ]);
    assert.ok(writes.counts.every(c => c.key === 'funnel:counts:2026-09-26'));
    assert.deepEqual(writes.reach.map(r => r.key), [
      'funnel:reach:2026-09-26:instructed:new',
      'funnel:reach:2026-09-26:matched:new',
      'funnel:reach:2026-09-26:entered:new',
      'funnel:reach:2026-09-26:quoted:new',
    ]);
  });

  it('stamps NYSE hours from the server clock', () => {
    const tuesdayMidday = new Date('2026-09-29T16:00:00Z'); // 12:00 ET
    assert.match(countField(batch.events[0]!, 'open', false), /hours=open/);
    assert.match(funnelWrites(batch, tuesdayMidday).counts[0]!.field, /hours=open/);
  });

  it('expires every key it touches', async () => {
    const calls: string[] = [];
    await recordBatch({
      hincrby: (key, field, by) => calls.push(`hincrby ${key} ${by}`),
      pfadd: key => calls.push(`pfadd ${key}`),
      expire: (key, seconds) => calls.push(`expire ${key} ${seconds}`),
      exec: async () => [],
    }, batch, new Date('2026-09-26T15:00:00Z'));
    const touched = new Set(calls.filter(c => !c.startsWith('expire')).map(c => c.split(' ')[1]));
    const expired = new Set(calls.filter(c => c.startsWith('expire')).map(c => c.split(' ')[1]));
    assert.deepEqual(expired, touched);
    assert.ok(calls.filter(c => c.startsWith('expire')).every(c => c.endsWith(String(RETENTION_DAYS * 86_400))));
  });
});

describe('funnel report', () => {
  it('computes the §8 measures', () => {
    const report = summarizeFunnel({
      'visit_started|hours=closed|landing=foyer|new=1': 10,
      'instruction_given|hours=closed|lead=under_10s|matched=one|new=1|source=spoken': 3,
      'instruction_given|hours=open|matched=none|new=1|source=typed': 1,
      'mic_blocked|hours=closed|new=1|reason=denied': 1,
      'estimate_returned|desk=hetty|hours=closed|new=1|outcome=quoted': 3,
      'estimate_returned|desk=hetty|hours=closed|new=1|outcome=unavailable': 1,
      'record_filed|desk=hetty|hours=closed|new=1': 2,
    }, { 'visited:new': 10, 'instructed:new': 4, 'filed:new': 2 } as never);
    assert.equal(report.instructions.total, 4);
    assert.equal(report.instructions.matchedShare, 0.75);
    assert.equal(report.instructions.afterHoursShare, 0.75);
    assert.equal(report.mic.deniedRate, 0.25);
    assert.equal(report.estimates.hetty!.availability, 0.75);
    assert.equal(report.journey.new.find(row => row.step === 'filed')!.ofVisits, 0.2, 'share of first visits that file a record');
    assert.deepEqual(parseField('record_filed|desk=hetty'), { event: 'record_filed', dims: { desk: 'hetty' } });
  });
});

describe('funnel route', () => {
  it('is reachable through the API proxy', () => {
    assert.equal(proxy(new NextRequest('http://localhost:3000/api/funnel', { method: 'POST' })).status, 200);
  });

  it('rejects anything that is not a funnel batch', async () => {
    const response = await POST(new Request('http://localhost:3000/api/funnel', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.1' },
      body: JSON.stringify({ events: [{ event: 'onboarding_dial_spun' }] }),
    }));
    assert.equal(response.status, 400);
  });

  it('drops quietly when the deployment has no Redis', async () => {
    const saved = [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN];
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const response = await POST(new Request('http://localhost:3000/api/funnel', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.2' },
        body: JSON.stringify({ visit: 'visit_abcdefghijklmnop', newcomer: false, events: [{ event: 'record_filed', desk: 'hetty' }] }),
      }));
      assert.equal(response.status, 204);
    } finally {
      if (saved[0]) process.env.UPSTASH_REDIS_REST_URL = saved[0];
      if (saved[1]) process.env.UPSTASH_REDIS_REST_TOKEN = saved[1];
    }
  });

  it('refuses oversized bodies', async () => {
    const response = await POST(new Request('http://localhost:3000/api/funnel', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.3' },
      body: 'x'.repeat(5_000),
    }));
    assert.equal(response.status, 413);
  });
});
