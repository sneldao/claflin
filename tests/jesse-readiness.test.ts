import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBalanceResult, parseTokenAccountsResult, readWalletReadiness } from '../lib/solana/readiness-rpc';
import { GET as readinessGet } from '../app/api/desk/jesse/readiness/route';
import { marketProfile, CLAFLIN_MARKET, MARKET_PROFILES } from '../lib/desk/market';
import { loadAttestation, saveAttestation, attestationCopy } from '../lib/desk/eligibility';
import { SOLANA_USDC_MINT, SOLANA_INSTRUMENTS } from '../lib/solana/catalog';

const WALLET = SOLANA_USDC_MINT; // any valid 32-byte base58 key
const APPLE = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;

function rpcBody(value: number) {
  return { jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value } };
}

function tokenBody(raw: string, decimals = 6, accounts = 1) {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      context: { slot: 1 },
      value: Array.from({ length: accounts }, () => ({
        account: { data: { parsed: { info: { tokenAmount: { amount: raw, decimals, uiAmountString: '0' } }, program: 'spl-token', space: 165 }, program: 'jsonParsed' }, executable: false, lamports: 1, owner: 't', rentEpoch: 0 },
      })),
    },
  };
}

describe('readiness parsers', () => {
  it('reads lamports and refuses malformed shapes', () => {
    assert.equal(parseBalanceResult(rpcBody(5_000)), '5000');
    assert.equal(parseBalanceResult(rpcBody(0)), '0');
    assert.equal(parseBalanceResult({ result: null }), null);
    assert.equal(parseBalanceResult({ result: { value: 'x' } }), null);
    assert.equal(parseBalanceResult(null), null);
  });

  it('treats no token account as a real zero, sums multiple accounts', () => {
    const empty = parseTokenAccountsResult(tokenBody('0', 6, 0), 6)!;
    assert.equal(empty.accountExists, false);
    assert.equal(empty.raw, '0');
    const two = parseTokenAccountsResult({ result: { value: [
      { account: { data: { parsed: { info: { tokenAmount: { amount: '100', decimals: 6 } } } } } },
      { account: { data: { parsed: { info: { tokenAmount: { amount: '250', decimals: 6 } } } } } },
    ] } }, 6)!;
    assert.equal(two.raw, '350');
    assert.equal(two.accountExists, true);
    assert.equal(parseTokenAccountsResult({ result: { value: [
      { account: { data: { parsed: { info: { tokenAmount: { amount: '1', decimals: 6 } } } } } },
      { account: { data: { parsed: { info: { tokenAmount: { amount: '1', decimals: 8 } } } } } },
    ] } }, 6), null);
  });

  it('returns honest nulls when the endpoint cannot be reached', async () => {
    const res = await readWalletReadiness({
      rpcUrl: 'https://rpc.invalid',
      wallet: WALLET,
      fetchImpl: async () => { throw new Error('down'); },
    });
    assert.equal(res.ok, false);
    assert.equal(res.solLamports, null);
    assert.equal(res.usdc, null);
    assert.deepEqual(res.holdings, []);
  });

  it('reads a batch into the right fields, one sum per mint', async () => {
    const res = await readWalletReadiness({
      rpcUrl: 'https://rpc.example',
      wallet: WALLET,
      mints: [{ mint: APPLE.mint, decimals: APPLE.decimals }],
      fetchImpl: async (_url, init) => {
        const sent = JSON.parse(String(init?.body)) as { id: number }[];
        assert.equal(sent.length, 3);
        return new Response(JSON.stringify([
          { jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 9_000 } },
          { jsonrpc: '2.0', id: 2, result: { context: { slot: 1 }, value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '1000000', decimals: 6 } } } } } }] } },
          { jsonrpc: '2.0', id: 3, result: { context: { slot: 1 }, value: [] } },
        ]));
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.solLamports, '9000');
    assert.equal(res.usdc?.raw, '1000000');
    assert.equal(res.holdings[0]?.accountExists, false);
  });

  it('reads every requested mint as a holding', async () => {
    const res = await readWalletReadiness({
      rpcUrl: 'https://rpc.example',
      wallet: WALLET,
      mints: SOLANA_INSTRUMENTS.map(i => ({ mint: i.mint, decimals: i.decimals })),
      fetchImpl: async (_url, init) => {
        const sent = JSON.parse(String(init?.body)) as { id: number }[];
        assert.equal(sent.length, 2 + SOLANA_INSTRUMENTS.length);
        return new Response(JSON.stringify(sent.map(({ id }) => (
          id === 1
            ? { jsonrpc: '2.0', id, result: { context: { slot: 1 }, value: 1 } }
            : { jsonrpc: '2.0', id, result: { context: { slot: 1 }, value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '42', decimals: 8 } } } } } }] } }
        ))));
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.holdings.length, SOLANA_INSTRUMENTS.length);
    assert.ok(res.holdings.every(h => h?.raw === '42'));
  });
});

describe('readiness route', () => {
  it('rejects a bad wallet and an unknown mint', async () => {
    const badWallet = await readinessGet(new Request('http://x/api/desk/jesse/readiness?wallet=nope'));
    assert.equal(badWallet.status, 400);
    const badMint = await readinessGet(new Request(`http://x/api/desk/jesse/readiness?wallet=${WALLET}&mint=So11111111111111111111111111111111111111112`));
    assert.equal(badMint.status, 400);
  });

  it('returns the readiness payload with no-store headers', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => new Response(JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 5000 } },
      { jsonrpc: '2.0', id: 2, result: { context: { slot: 1 }, value: [] } },
    ]))) as typeof fetch;
    try {
      const res = await readinessGet(new Request(`http://x/api/desk/jesse/readiness?wallet=${WALLET}`));
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const body = await res.json() as { ok: boolean; solLamports: string | null; usdc: { raw: string } | null; holdings: unknown[] };
      assert.equal(body.ok, true);
      assert.equal(body.solLamports, '5000');
      assert.equal(body.usdc?.raw, '0');
      assert.deepEqual(body.holdings, []);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});

describe('market profiles', () => {
  it('defaults to the Philippines and keeps Nigeria configured', () => {
    assert.equal(CLAFLIN_MARKET.id, 'ph');
    assert.equal(marketProfile(undefined).id, 'ph');
    assert.equal(marketProfile('ng').id, 'ng');
    assert.equal(marketProfile('xx').id, 'ph');
    assert.equal(MARKET_PROFILES.ng.fiatCurrency, 'NGN');
  });

  it('builds ramp links with the wallet and the right asset', () => {
    const moonpay = MARKET_PROFILES.ph.ramps[0];
    assert.equal(moonpay.name, 'MoonPay');
    assert.match(moonpay.urlFor('USDC', WALLET), /currencyCode=usdc_sol/);
    assert.match(moonpay.urlFor('USDC', WALLET), /walletAddress=EPjFW/);
    assert.match(moonpay.urlFor('USDC', WALLET), /baseCurrencyCode=PHP/);
    const transak = MARKET_PROFILES.ng.ramps[0];
    assert.equal(transak.name, 'Transak');
    assert.match(transak.urlFor('SOL', WALLET), /cryptoCurrencyCode=SOL/);
    assert.match(transak.urlFor('SOL', WALLET), /network=solana/);
    assert.match(transak.urlFor('SOL', WALLET), /fiatCurrency=NGN/);
  });

  it('encodes the desk URL into the wallet deep links', () => {
    const phantom = MARKET_PROFILES.ph.wallets[0];
    const url = phantom.url('https://claflin.trustfall.xyz/?desk=jesse');
    assert.match(url, /^https:\/\/phantom\.app\/ul\/browse\//);
    assert.ok(url.includes(encodeURIComponent('https://claflin.trustfall.xyz/?desk=jesse')));
  });
});

describe('eligibility attestation', () => {
  function memStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  }

  it('roundtrips per market and ignores other markets', () => {
    const storage = memStorage();
    assert.equal(loadAttestation(storage, 'ph'), null);
    const saved = saveAttestation(storage, 'ph', 123);
    assert.ok(saved);
    const loaded = loadAttestation(storage, 'ph');
    assert.equal(loaded?.attestedAt, 123);
    assert.equal(loadAttestation(storage, 'ng'), null);
  });

  it('names the issuer exclusions honestly', () => {
    const copy = attestationCopy(MARKET_PROFILES.ph);
    assert.match(copy, /Backed Assets/);
    assert.match(copy, /US persons/);
    assert.match(copy, /UK retail/);
    assert.match(MARKET_PROFILES.ph.issuerTermsUrl, /assets\.backed\.fi/);
  });
});
