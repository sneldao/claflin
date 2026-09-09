import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { mergePulledRecords, type PaperRecord, type PaperStorage } from '../lib/trading/paper-records';

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
});

describe('usePaperSync echo contract', () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const hook = source('lib/trading/usePaperSync.ts');

  it('merges through the validated record layer, not raw localStorage writes', () => {
    assert.match(hook, /mergePulledRecords\(window\.localStorage/);
    assert.doesNotMatch(hook, /localStorage\.setItem/);
  });
  it('reloads the desk only when the merge actually changed storage', () => {
    assert.match(hook, /if \(added > 0\) \{[\s\S]*?window\.dispatchEvent\(new Event\('storage'\)\);/);
    assert.ok(hook.indexOf('if (added > 0) {') < hook.indexOf("dispatchEvent(new Event('storage'))"), 'the dispatch must be gated on the merge count');
  });
  it('suppresses exactly the one push the merge would echo, then re-arms', () => {
    assert.equal(hook.match(/suppressNextPush\.current = true;/g)?.length, 1, 'set only after a real merge');
    assert.equal(hook.match(/suppressNextPush\.current = false;/g)?.length, 1, 'consumed once by the next push run');
  });
  it('skips pushes whose record set is unchanged, by content not identity', () => {
    assert.match(hook, /function recordsSignature/);
    assert.match(hook, /signature === lastPushedIds\.current\)\s*\n?\s*return;/);
  });
  it('respects Retry-After when auto-retrying a rate-limited request', () => {
    const client = source('lib/api-client.ts');
    assert.match(client, /Math\.max\(computeBackoffDelay\([^)]*\), \(retryAfterSeconds \?\? 0\) \* 1000\)/);
  });
  it('marks the pushed set only after the server accepts it', () => {
    const pushBody = hook.slice(hook.indexOf("method: 'POST'"));
    assert.ok(pushBody.indexOf('lastPushedIds.current = signature') > pushBody.indexOf("await fetch('/api/paper'"));
  });
  it('still pushes nothing when signed out', () => {
    assert.match(hook, /if \(!auth\.authenticated[^)]*\) return;/);
  });
});
