import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreStockDuplex,
  clearPreStockCache,
  findPreStockProduct,
  parsePreStockProducts,
  prestockReferenceDifferenceBps,
  readPreStockDuplex,
  unavailablePreStockDuplex,
  type PreStockProduct,
} from '../lib/solana/market/prestocks';

const SAMPLE: PreStockProduct = {
  name: 'Anduril PreStocks',
  symbol: 'ANDURIL',
  description: 'SPV-backed',
  image: 'https://www.prestocks.com/logos/anduril.png',
  external_url: 'https://www.prestocks.com/anduril',
  contract_address: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB',
  markPrice: 100,
  tokenPrice: 101,
  markValuation: 1,
  impliedValuation: 1,
  supply: 1,
};

describe('prestocks duplex', () => {
  beforeEach(() => clearPreStockCache());

  it('computes reference difference like the Pyth fixtures', () => {
    assert.equal(prestockReferenceDifferenceBps(100, 101), '100.0');
    assert.equal(prestockReferenceDifferenceBps(100, 99), '-100.0');
    assert.equal(prestockReferenceDifferenceBps(0, 101), null);
  });

  it('builds a comparable duplex with SPV disclaimer', () => {
    const d = buildPreStockDuplex(SAMPLE, 1_700_000_000_000);
    assert.equal(d.status, 'comparable');
    assert.equal(d.referenceDifferenceBps, '100.0');
    assert.ok(d.reasonCodes.includes('spv-issuer-mark'));
    assert.match(d.disclaimer, /SPV/);
  });

  it('refuses non-positive prices', () => {
    const d = buildPreStockDuplex({ ...SAMPLE, markPrice: 0 }, 1);
    assert.equal(d.status, 'unavailable');
    assert.equal(d.referenceDifferenceBps, null);
    assert.ok(d.reasonCodes.includes('nonpositive-price'));
  });

  it('parses issuer list and finds by symbol', () => {
    const list = parsePreStockProducts([SAMPLE, { ...SAMPLE, symbol: 'OPENAI', name: 'OpenAI PreStocks' }]);
    assert.equal(list.length, 2);
    assert.equal(findPreStockProduct(list, 'openai')?.symbol, 'OPENAI');
    assert.equal(findPreStockProduct(list, 'NOPE'), null);
  });

  it('degrades to unavailable when the issuer fetch fails', async () => {
    const duplex = await readPreStockDuplex({
      symbol: 'ANDURIL',
      fetchImpl: async () => { throw new Error('network'); },
      now: 42,
    });
    assert.equal(duplex.status, 'unavailable');
    assert.ok(duplex.reasonCodes.includes('issuer-api-unavailable'));
  });

  it('degrades on unknown symbol after a good list', async () => {
    const duplex = await readPreStockDuplex({
      symbol: 'NOPE',
      fetchImpl: async () => new Response(JSON.stringify([SAMPLE]), { status: 200 }),
      now: 42,
    });
    assert.equal(duplex.status, 'unavailable');
    assert.ok(duplex.reasonCodes.includes('unknown-symbol'));
  });

  it('keeps unavailable shell honest', () => {
    const d = unavailablePreStockDuplex('X', ['issuer-api-unavailable'], 1);
    assert.equal(d.source, 'prestocks');
    assert.equal(d.status, 'unavailable');
    assert.ok(d.reasonCodes.includes('spv-issuer-mark'));
  });
});
