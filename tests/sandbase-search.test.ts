import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { firecrawlSearch, firecrawlScrape } from '../lib/firecrawl';
import { ResearchSkill } from '../lib/agent-skills';

const SB_SEARCH_OK = JSON.stringify({
  id: 'sb-1',
  model: 'firecrawl',
  status: 'completed',
  output: {
    creditsUsed: 1,
    data: { web: [{ title: 'Result A', url: 'https://a.test/x', description: 'snippet a', position: 1 }] },
  },
});

const FC_SEARCH_OK = JSON.stringify({
  success: true,
  data: { web: [{ title: 'Native A', url: 'https://a.test/y', description: 'native a' }] },
});

type Call = { url: string; body: any; headers: any };
let calls: Call[] = [];
let queue: Array<{ status?: number; body: string } | 'throw'> = [];
const realFetch = globalThis.fetch;

function push(...items: typeof queue) { queue = items; }

const stubFetch = async (url: any, init?: any): Promise<Response> => {
  calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers });
  const next = queue.shift() ?? { status: 500, body: 'empty' };
  if (next === 'throw') throw new Error('net down');
  return new Response(next.body, { status: next.status ?? 200 });
};

const ENV_KEYS = ['FIRECRAWL_API_KEY', 'TAVILY_API_KEY', 'SANDBASE_API_KEY', 'SANDBASE_BASE_URL', 'SEARCH_ROUTE_ORDER'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.SANDBASE_API_KEY;
  delete process.env.SANDBASE_BASE_URL;
  delete process.env.SEARCH_ROUTE_ORDER;
  calls = [];
  queue = [];
  (globalThis as any).fetch = stubFetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  (globalThis as any).fetch = realFetch;
});

describe('firecrawl fetch route chain', () => {
  it('serves native first and marks provider native', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-key';
    process.env.SANDBASE_API_KEY = 'sb-key';
    push({ body: FC_SEARCH_OK });
    const r = await firecrawlSearch('hello world');
    assert.equal(r.provider, 'native');
    assert.equal(r.results[0]?.title, 'Native A');
    assert.equal(calls[0]?.url, 'https://api.firecrawl.dev/v2/search');
  });

  it('falls back to sandbase on native failure', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-key';
    process.env.SANDBASE_API_KEY = 'sb-key';
    push({ status: 500, body: 'nope' }, { body: SB_SEARCH_OK });
    const r = await firecrawlSearch('hello world');
    assert.equal(r.provider, 'sandbase');
    assert.equal(r.results[0]?.title, 'Result A');
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.url, 'https://api.sandbase.ai/v1/api/firecrawl/search');
    assert.equal(calls[1]?.headers?.Authorization, 'Bearer sb-key');
  });

  it('works sandbase-only when no FIRECRAWL_API_KEY', async () => {
    process.env.SANDBASE_API_KEY = 'sb-key';
    push({ body: SB_SEARCH_OK });
    const r = await firecrawlSearch('hello world');
    assert.equal(r.provider, 'sandbase');
    assert.equal(calls.length, 1);
  });

  it('honours SEARCH_ROUTE_ORDER=sandbase,native', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-key';
    process.env.SANDBASE_API_KEY = 'sb-key';
    process.env.SEARCH_ROUTE_ORDER = 'sandbase,native';
    push({ body: SB_SEARCH_OK });
    const r = await firecrawlSearch('hello world');
    assert.equal(r.provider, 'sandbase');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://api.sandbase.ai/v1/api/firecrawl/search');
  });

  it('adds proxy:"basic" on sandbase scrape bodies', async () => {
    process.env.SANDBASE_API_KEY = 'sb-key';
    push({
      body: JSON.stringify({
        status: 'completed',
        output: { markdown: '# hi', metadata: { sourceURL: 'https://a.test', title: 'T' } },
      }),
    });
    const r = await firecrawlScrape('https://a.test');
    assert.equal(r.markdown, '# hi');
    assert.equal(calls[0]?.body?.proxy, 'basic');
    assert.equal(calls[0]?.url, 'https://api.sandbase.ai/v1/api/firecrawl/scrape');
  });

  it('throws when every route fails', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-key';
    process.env.SANDBASE_API_KEY = 'sb-key';
    push({ status: 500, body: 'x' }, { status: 500, body: 'y' });
    await assert.rejects(() => firecrawlSearch('q'), /500/);
    assert.equal(calls.length, 2);
  });
});

describe('research skill availability', () => {
  it('runs via sandbase firecrawl path when only SANDBASE_API_KEY is set', async () => {
    process.env.SANDBASE_API_KEY = 'sb-key';
    const skill = new ResearchSkill({} as any);
    push({ body: SB_SEARCH_OK });
    const res = await skill.execute({ query: 'test query' });
    assert.equal(res.success, true);
    const data = res.data as any;
    assert.equal(data.provider, 'sandbase');
    assert.equal(data.results[0].title, 'Result A');
    assert.equal(calls[0]?.url, 'https://api.sandbase.ai/v1/api/firecrawl/search');
  });

  it('fails cleanly when no key is configured', async () => {
    const skill = new ResearchSkill({} as any);
    const res = await skill.execute({ query: 'test' });
    assert.equal(res.success, false);
    assert.match(String(res.error), /SANDBASE_API_KEY/);
  });
});
