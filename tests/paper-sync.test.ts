import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { mergePulledRecords, type PaperRecord, type PaperStorage } from '../lib/trading/paper-records';
import { createElement, useState, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePaperSync } from '../lib/trading/usePaperSync';
import { DeskAuthContext } from '../components/auth/AuthProvider';
import { resetContainer, getRootElement } from './jsdom-setup';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-sync', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: 'NVDAc', amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function record(id: string, createdAt = now + 1, quoteOverride: Partial<QuoteEstimate> = {}): PaperRecord {
  return { version: 1, mode: 'paper', deskId: 'hetty', id, createdAt, quote: { ...quote, id, ...quoteOverride } };
}

function storage(seed: Record<string, string> = {}): PaperStorage & { removeItem(key: string): void; failNextSet(): void } {
  const map = new Map(Object.entries(seed));
  let failNext = false;
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      if (failNext) { failNext = false; throw new Error('quota'); }
      map.set(key, value);
    },
    removeItem: key => { map.delete(key); },
    failNextSet: () => { failNext = true; },
  };
}

function storedIds(store: PaperStorage): string[] {
  const ids: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith('claflin.paper.v1.')) ids.push(key.slice('claflin.paper.v1.'.length));
  }
  return ids.sort();
}

describe('merging pulled account records into the browser', () => {
  it('adds records the browser does not have and reports the count', () => {
    const store = storage();
    const added = mergePulledRecords(store, [record('a'), record('b')], 'hetty');
    assert.equal(added, 2);
    assert.deepEqual(storedIds(store), ['a', 'b']);
  });
  it('keeps the local record when the account sends the same id', () => {
    const local = record('shared', now + 1);
    const serverCopy = record('shared', now + 99); // different content, same id
    const store = storage({ 'claflin.paper.v1.shared': JSON.stringify(local) });
    const added = mergePulledRecords(store, [serverCopy], 'hetty');
    assert.equal(added, 0, 'local stays authoritative on id collision');
    assert.equal(store.getItem('claflin.paper.v1.shared'), JSON.stringify(local));
  });
  it('adds genuinely new records alongside a collision', () => {
    const local = record('shared');
    const store = storage({ 'claflin.paper.v1.shared': JSON.stringify(local) });
    const added = mergePulledRecords(store, [record('shared'), record('fresh')], 'hetty');
    assert.equal(added, 1);
    assert.deepEqual(storedIds(store), ['fresh', 'shared']);
  });
  it('skips malformed candidates without abandoning the rest of the pull', () => {
    const store = storage();
    const added = mergePulledRecords(store, [
      { version: 1, id: 'broken' },                 // shape-invalid
      record('valid'),
      'not-an-object',                              // not a record at all
      record('expired', now, { quotedAt: now - 60000, expiresAt: now - 57000 }), // unusable estimate
      record('also-valid'),
    ], 'hetty');
    assert.equal(added, 2);
    assert.deepEqual(storedIds(store), ['also-valid', 'valid']);
  });
  it('never writes a record the desk could not read back', () => {
    const store = storage();
    mergePulledRecords(store, [
      { ...record('tampered'), quote: { ...quote, id: 'different-id' } }, // id/quote binding mismatch
    ], 'hetty');
    assert.deepEqual(storedIds(store), [], 'a record that would break loadPaperRecords must not land');
  });
  it('continues past a storage write failure on one candidate', () => {
    const store = storage();
    store.failNextSet();
    const added = mergePulledRecords(store, [record('first'), record('second')], 'hetty');
    assert.equal(added, 1);
    assert.deepEqual(storedIds(store), ['second']);
  });
  it('respects the hundred-record history cap', () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 100; i++) seed[`claflin.paper.v1.full-${i}`] = JSON.stringify(record(`full-${i}`));
    const store = storage(seed);
    assert.equal(mergePulledRecords(store, [record('one-more')], 'hetty'), 0, 'a full history accepts nothing');
    assert.ok(!storedIds(store).includes('one-more'));

    const partial = storage();
    for (let i = 0; i < 98; i++) partial.setItem(`claflin.paper.v1.partial-${i}`, JSON.stringify(record(`partial-${i}`)));
    const added = mergePulledRecords(partial, [record('x1'), record('x2'), record('x3')], 'hetty');
    assert.equal(added, 2, 'the cap, not the payload, bounds the merge');
  });
  it('reports zero for an empty or missing pull without touching storage', () => {
    const store = storage({ 'claflin.paper.v1.kept': JSON.stringify(record('kept')) });
    assert.equal(mergePulledRecords(store, [], 'hetty'), 0);
    assert.equal(mergePulledRecords(store, [undefined, null], 'hetty'), 0);
    assert.deepEqual(storedIds(store), ['kept']);
  });
  it('never merges records that belong to another desk', () => {
    const store = storage();
    const jesseRecord = { ...record('jesse-1'), deskId: 'jesse' as const };
    const added = mergePulledRecords(store, [jesseRecord, record('hetty-1')], 'hetty');
    assert.equal(added, 1, 'only the same-desk record lands');
    assert.deepEqual(storedIds(store), ['hetty-1']);
  });
});

describe('usePaperSync behavior', () => {
  type FetchRequest = { url: string; method?: string };
  let requests: FetchRequest[] = [];
  let root: Root | null = null;

  function mockFetch() {
    requests = [];
    (globalThis as any).fetch = async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (url.includes('/api/paper') && method === 'POST') {
        const postCount = requests.filter(r => r.url.includes('/api/paper') && r.method === 'POST').length;
        if (postCount === 1) return new Response('Service Unavailable', { status: 503 });
        return new Response(null, { status: 200 });
      }
      if (url.includes('/api/paper')) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      return new Response(null, { status: 404 });
    };
  }

  beforeEach(() => {
    resetContainer();
    mockFetch();
    window.localStorage.clear();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  function Harness({ initialRecords }: { initialRecords: PaperRecord[] }) {
    const [records, setRecords] = useState(initialRecords);
    const desk = { deskId: 'hetty', historyReady: true, records };
    const { importAnonymousRecords, anonymousCount } = usePaperSync(desk as any);
    globalThis.__importAnonymous = importAnonymousRecords;
    globalThis.__anonymousCount = () => anonymousCount;
    return createElement('div', null,
      createElement('button', { type: 'button', id: 'add', onClick: () => setRecords(prev => [...prev, record(String.fromCharCode(97 + prev.length))]) }, 'Add'),
      createElement('button', { type: 'button', id: 'same', onClick: () => setRecords(prev => [...prev]) }, 'Same'),
    );
  }

  const authValue = {
    enabled: false, ready: true, authenticated: true, userId: 'u1', label: null, walletAddress: null,
    linkWallet: () => {}, login: () => {}, logout: () => {}, getAccessToken: async () => 'token',
  };

  async function renderHarness(initialRecords: PaperRecord[]) {
    root = createRoot(getRootElement());
    await act(async () => root.render(
      createElement(DeskAuthContext.Provider, { value: authValue },
        createElement(Harness, { initialRecords }),
      ),
    ));
  }

  async function flush() {
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async function click(id: string) {
    await act(async () => { document.getElementById(id)!.click(); });
    await flush();
  }

  it('pushes nothing while signed out', async () => {
    const signedOutValue = { ...authValue, authenticated: false, getAccessToken: async () => null };
    root = createRoot(getRootElement());
    await act(async () => root.render(
      createElement(DeskAuthContext.Provider, { value: signedOutValue },
        createElement(Harness, { initialRecords: [record('a')] }),
      ),
    ));
    await flush();
    assert.equal(requests.filter(r => r.url.includes('/api/paper') && r.method === 'POST').length, 0);
  });

  it('marks the pushed set only after the server accepts it and retries on the next change', async () => {
    await renderHarness([]);
    await flush();
    const postRequests = () => requests.filter(r => r.url.includes('/api/paper') && r.method === 'POST');
    assert.equal(postRequests().length, 0, 'no records to push yet');

    await click('add');
    assert.equal(postRequests().length, 1, 'first push attempt');
    assert.equal(postRequests()[0].url, '/api/paper');
    assert.equal(postRequests()[0].method, 'POST');

    await click('add');
    assert.equal(postRequests().length, 2, 'failed backup is retried on the next change');
    assert.equal(postRequests()[1].method, 'POST');

    await click('same');
    assert.equal(postRequests().length, 2, 'same record set is not pushed again after success');
  });

  it('does not upload anonymous browser records on sign-in; imports them only explicitly', async () => {
    await renderHarness([record('anon-1')]);
    await flush();
    const postRequests = () => requests.filter(r => r.url.includes('/api/paper') && r.method === 'POST');
    assert.equal(postRequests().length, 0, 'anonymous work stays local on sign-in');
    assert.equal(globalThis.__anonymousCount(), 1, 'the importable anonymous count is visible after sign-in');

    // Import is explicit; signing the claim and a records change uploads it.
    await act(async () => { globalThis.__importAnonymous(); });
    assert.equal(globalThis.__anonymousCount(), 0, 'explicit import clears the importable set');
    await click('same');
    await click('same'); // first attempt 503s; this retry is accepted and claims the record
    assert.equal(postRequests().length, 2, 'explicit import attributes the anonymous record (with one failed retry)');
    assert.equal(postRequests().some(r => r.method === 'POST'), true);

    await click('same');
    assert.equal(postRequests().length, 2, 'no repeat upload after it is claimed');
  });
});
