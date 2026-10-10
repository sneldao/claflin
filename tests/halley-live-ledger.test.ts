import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase58 } from '../lib/solana/catalog';
import { loadLaunches, upsertLaunch, launchesFromChainStatuses, type HalleyLaunchRecord } from '../lib/meteora/live-ledger';
import { GET as reconcileGet } from '../app/api/desk/halley/live/reconcile/route';
import { GET as metadataGet } from '../app/api/desk/halley/token-metadata/route';
import { attestationCopy, METEORA_LAUNCH_SCOPE } from '../lib/desk/eligibility';

const WALLET = encodeBase58(new Uint8Array(32).fill(3));
const SIG = encodeBase58(new Uint8Array(64).fill(7));

function launch(over: Partial<HalleyLaunchRecord> = {}): HalleyLaunchRecord {
  return {
    proposalId: 'p1',
    wallet: WALLET,
    signature: SIG,
    configSignature: encodeBase58(new Uint8Array(64).fill(8)),
    symbol: 'TTRK',
    quoteSymbol: 'USDC',
    baseMint: encodeBase58(new Uint8Array(32).fill(4)),
    pool: encodeBase58(new Uint8Array(32).fill(5)),
    submittedAt: 100,
    status: 'submitted',
    lastCheckedAt: null,
    ...over,
  };
}

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('halley launch ledger', () => {
  it('filters by wallet and replaces by proposal id', () => {
    const storage = memStorage();
    upsertLaunch(storage, launch());
    upsertLaunch(storage, launch({ proposalId: 'p1', status: 'confirmed' }));
    upsertLaunch(storage, launch({ proposalId: 'p2', wallet: encodeBase58(new Uint8Array(32).fill(9)) }));
    const mine = loadLaunches(storage, WALLET);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'confirmed');
  });

  it('caps the ledger per wallet, newest first', () => {
    const storage = memStorage();
    for (let i = 0; i < 25; i++) upsertLaunch(storage, launch({ proposalId: `p${i}`, submittedAt: i }));
    const mine = loadLaunches(storage, WALLET);
    assert.equal(mine.length, 20);
    assert.equal(mine[0].proposalId, 'p24');
  });

  it('survives malformed storage and refuses partial records', () => {
    const storage = memStorage();
    storage.setItem('claflin.halley.live-ledger.v1', '{bad json');
    assert.deepEqual(loadLaunches(storage, WALLET), []);
    storage.setItem('claflin.halley.live-ledger.v1', JSON.stringify([launch(), { proposalId: 7 }, 'x']));
    assert.equal(loadLaunches(storage, WALLET).length, 1);
  });

  it('maps the two-signature chain truth to honest launch statuses', () => {
    assert.equal(launchesFromChainStatuses('finalized', 'confirmed', 'submitted'), 'confirmed');
    assert.equal(launchesFromChainStatuses('confirmed', 'notFound', 'submitted'), 'partial');
    assert.equal(launchesFromChainStatuses('confirmed', undefined, 'submitted'), 'partial');
    assert.equal(launchesFromChainStatuses('failed', 'notFound', 'submitted'), 'failed');
    assert.equal(launchesFromChainStatuses('notFound', 'notFound', 'submitted'), 'unknown');
    assert.equal(launchesFromChainStatuses('confirmed', 'failed', 'submitted'), 'failed');
    assert.equal(launchesFromChainStatuses('unreadable', 'unreadable', 'submitted'), 'submitted');
  });
});

describe('halley reconcile route', () => {
  it('rejects missing and malformed signatures', async () => {
    const missing = await reconcileGet(new Request('http://x/api/desk/halley/live/reconcile'));
    assert.equal(missing.status, 400);
    const bad = await reconcileGet(new Request('http://x/api/desk/halley/live/reconcile?signature=abc'));
    assert.equal(bad.status, 400);
  });

  it('returns per-signature chain checks', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = (async (_u: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { params: unknown[] };
      assert.equal((sent.params[1] as { searchTransactionHistory: boolean }).searchTransactionHistory, true);
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { context: { slot: 1 }, value: [{ confirmationStatus: 'finalized', err: null }] },
      }));
    }) as typeof fetch;
    try {
      const res = await reconcileGet(new Request(`http://x/api/desk/halley/live/reconcile?signature=${SIG}`));
      assert.equal(res.status, 200);
      const body = await res.json() as { ok: boolean; checks: { signature: string; status: string }[] };
      assert.equal(body.ok, true);
      assert.deepEqual(body.checks, [{ signature: SIG, status: 'finalized' }]);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});

describe('halley token-metadata route', () => {
  it('serves Metaplex JSON that says what the mint is not', async () => {
    const res = await metadataGet(new Request('http://x/api/desk/halley/token-metadata?symbol=TTRK&name=Test%20Tracker&anchor=NVDA'));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      name: string;
      symbol: string;
      description: string;
      attributes: { trait_type: string; value: string }[];
    };
    assert.equal(body.symbol, 'TTRK');
    assert.match(body.description, /tracker\/exposure token/);
    assert.match(body.description, /not.*stock ownership/);
    const traits = Object.fromEntries(body.attributes.map(a => [a.trait_type, a.value]));
    assert.equal(traits['is_stock_ownership'], 'false');
    assert.equal(traits['price_anchor'], 'NVDA');
  });

  it('rejects symbols outside the launch grammar', async () => {
    const res = await metadataGet(new Request('http://x/api/desk/halley/token-metadata?symbol=x&name=ab'));
    assert.equal(res.status, 400);
  });
});

describe('halley launch eligibility scope', () => {
  it('names the launcher as creator and keeps the xStock quote disclosure', () => {
    const copy = attestationCopy(METEORA_LAUNCH_SCOPE);
    assert.match(copy, /token's creator/);
    assert.match(copy, /not stock ownership/);
    assert.match(copy, /not offered to US persons/);
    /* It is a self-declaration, not a legal determination — the copy asks
       the launcher to confirm, it does not declare them eligible. */
    assert.match(copy, /Confirm you may create and launch/);
  });
});
