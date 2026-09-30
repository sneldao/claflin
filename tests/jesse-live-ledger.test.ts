import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signatureFromSignedTransaction } from '../lib/solana/signature';
import { parseSignatureStatusesResult, readSignatureStatuses } from '../lib/solana/tx-status';
import { GET as reconcileGet } from '../app/api/desk/jesse/live/reconcile/route';
import { encodeBase58, decodeBase58, SOLANA_USDC_MINT } from '../lib/solana/catalog';
import { loadOrders, upsertOrder, type LiveOrderRecord } from '../lib/solana/live-ledger';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';

const WALLET = SOLANA_USDC_MINT;
const APPLE = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const SIG = encodeBase58(new Uint8Array(64).fill(7));

function order(over: Partial<LiveOrderRecord> = {}): LiveOrderRecord {
  return {
    proposalId: 'p1',
    wallet: WALLET,
    signature: SIG,
    instrumentId: APPLE.id,
    side: 'buy',
    amount: '25',
    unit: 'USDC',
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

describe('signature from signed transaction', () => {
  it('roundtrips base58 and derives the first signature', () => {
    const sig = new Uint8Array(64).map((_, i) => (i * 37) % 256);
    const tx = new Uint8Array([1, ...sig, 0xaa, 0xbb, 0xcc]); // count=1 + sig + message
    const derived = signatureFromSignedTransaction(tx);
    assert.ok(derived);
    assert.deepEqual(decodeBase58(derived!), sig);
    assert.equal(derived, encodeBase58(sig));
  });

  it('reads past a two-byte compact-u16 signature count', () => {
    const sig = new Uint8Array(64).fill(9);
    const tx = new Uint8Array([0x80, 0x01, ...sig, 0]); // count=128, encoded 0x80 0x01
    assert.equal(signatureFromSignedTransaction(tx), encodeBase58(sig));
  });

  it('refuses empty and truncated transactions', () => {
    assert.equal(signatureFromSignedTransaction(new Uint8Array([])), null);
    assert.equal(signatureFromSignedTransaction(new Uint8Array([0])), null);
    assert.equal(signatureFromSignedTransaction(new Uint8Array([1, ...new Uint8Array(10)])), null);
  });
});

describe('signature status parsing', () => {
  const sigs = ['a', 'b', 'c', 'd'];

  it('maps the wire shape to honest statuses', () => {
    const checks = parseSignatureStatusesResult({
      result: {
        context: { slot: 1 },
        value: [
          null,
          { confirmationStatus: 'finalized', err: null },
          { confirmationStatus: 'confirmed', err: null },
          { confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] } },
        ],
      },
    }, sigs);
    assert.deepEqual(checks.map(c => c.status), ['notFound', 'finalized', 'confirmed', 'failed']);
  });

  it('marks every signature unreadable when the shape is wrong', () => {
    const checks = parseSignatureStatusesResult({ result: { value: null } }, sigs);
    assert.ok(checks.every(c => c.status === 'unreadable'));
    assert.equal(parseSignatureStatusesResult({ result: { value: [null] } }, sigs).length, sigs.length);
  });

  it('fails closed on transport errors', async () => {
    const res = await readSignatureStatuses({
      rpcUrl: 'https://rpc.invalid',
      signatures: ['x'],
      fetchImpl: async () => { throw new Error('down'); },
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.checks, []);
  });
});

describe('reconcile route', () => {
  it('rejects missing and malformed signatures', async () => {
    const missing = await reconcileGet(new Request('http://x/api/desk/jesse/live/reconcile'));
    assert.equal(missing.status, 400);
    const bad = await reconcileGet(new Request('http://x/api/desk/jesse/live/reconcile?signature=abc'));
    assert.equal(bad.status, 400);
  });

  it('returns per-signature checks', async () => {
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
      const res = await reconcileGet(new Request(`http://x/api/desk/jesse/live/reconcile?signature=${SIG}`));
      assert.equal(res.status, 200);
      const body = await res.json() as { ok: boolean; checks: { signature: string; status: string }[] };
      assert.equal(body.ok, true);
      assert.deepEqual(body.checks, [{ signature: SIG, status: 'finalized' }]);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});

describe('live order ledger', () => {
  it('filters by wallet and replaces by proposal id', () => {
    const storage = memStorage();
    upsertOrder(storage, order());
    upsertOrder(storage, order({ proposalId: 'p1', status: 'confirmed', signature: SIG }));
    upsertOrder(storage, order({ proposalId: 'p2', wallet: 'OtherWallet1111111111111111111111111111111' }));
    const mine = loadOrders(storage, WALLET);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'confirmed');
    assert.equal(loadOrders(storage, 'OtherWallet1111111111111111111111111111111').length, 1);
  });

  it('caps the ledger per wallet, newest first', () => {
    const storage = memStorage();
    for (let i = 0; i < 25; i++) {
      upsertOrder(storage, order({ proposalId: `p${i}`, submittedAt: i }));
    }
    const mine = loadOrders(storage, WALLET);
    assert.equal(mine.length, 20);
    assert.equal(mine[0].proposalId, 'p24');
  });

  it('survives malformed storage and refuses partial records', () => {
    const storage = memStorage();
    storage.setItem('claflin.jesse.live-ledger.v1', '{bad json');
    assert.deepEqual(loadOrders(storage, WALLET), []);
    storage.setItem('claflin.jesse.live-ledger.v1', JSON.stringify([order(), { proposalId: 7 }, 'x']));
    assert.equal(loadOrders(storage, WALLET).length, 1);
  });
});
