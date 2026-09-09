import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS, getDeskInstrument, parseInstrumentId, canonicalInstrumentId } from '../lib/trading/catalog';
import { deskQuoteLimits } from '../lib/trading/desk-mandate';
import { markAdapterFor, quoteAdapterFor } from '../lib/trading/adapters';
import { aerodromeQuoteAdapter } from '../lib/trading/adapters/aerodrome';
import { chainlinkMarkAdapter } from '../lib/trading/adapters/chainlink';

const stock = DESK_INSTRUMENTS[0];

describe('instrument identity scheme', () => {
  it('keeps legacy Base ids byte-identical', () => {
    assert.match(stock.id, /^8453:0x[0-9a-f]{40}$/);
    assert.equal(getDeskInstrument(stock.id).id, stock.id);
  });
  it('parses EVM, Solana, and Robinhood refs', () => {
    assert.deepEqual(parseInstrumentId('8453:0xB20000000000000000000078ee7ce2fE4908108C'), {
      protocol: 'evm', chainId: 8453, address: '0xb20000000000000000000078ee7ce2fe4908108c',
    });
    assert.deepEqual(parseInstrumentId('sol:So11111111111111111111111111111111111111112'), {
      protocol: 'sol', address: 'So11111111111111111111111111111111111111112',
    });
    assert.deepEqual(parseInstrumentId('rh:nvda'), { protocol: 'rh', address: 'nvda' });
    assert.equal(parseInstrumentId('tesla'), null);
    assert.equal(parseInstrumentId('sol:not base58!!'), null);
  });
  it('folds base:0x… to the canonical 8453:0x… id', () => {
    const ref = parseInstrumentId(`base:${stock.contractAddress}`);
    assert.ok(ref && ref.protocol === 'evm' && ref.chainId === 8453);
    assert.equal(canonicalInstrumentId(ref), stock.id);
    assert.equal(getDeskInstrument(`base:${stock.contractAddress}`).id, stock.id);
  });
});

describe('desk quote limits live in the mandate', () => {
  it('gives every desk explicit guardrails', () => {
    for (const deskId of ['hetty', 'jesse', 'isabel', 'arbitrum'] as const) {
      const limits = deskQuoteLimits(deskId);
      assert.equal(limits.buyMax, '10000');
      assert.equal(limits.sellMax, '1000');
      assert.equal(limits.quoteDecimals, 6);
    }
  });
});

describe('adapter registries', () => {
  it('resolves Hetty to Aerodrome quotes and Chainlink marks', () => {
    assert.equal(quoteAdapterFor('hetty').venue, 'aerodrome');
    assert.equal(quoteAdapterFor('HETTY').chainId, 8453);
    assert.equal(markAdapterFor('hetty').source, 'chainlink');
    assert.equal(markAdapterFor('hetty').market, 'Base');
  });
  it('refuses planned desks without borrowing another venue', () => {
    const codeOf = (fn: () => unknown): string => {
      try { fn(); } catch (error) { return (error as { code?: string }).code ?? 'no-code'; }
      return 'did-not-throw';
    };
    for (const deskId of ['jesse', 'isabel', 'arbitrum', 'nope']) {
      assert.equal(codeOf(() => quoteAdapterFor(deskId)), 'desk_unavailable');
      assert.equal(codeOf(() => markAdapterFor(deskId)), 'desk_unavailable');
    }
  });
  it('the Aerodrome adapter covers Base quote candidates only', () => {
    assert.equal(aerodromeQuoteAdapter.canQuote(stock), true);
    assert.equal(
      aerodromeQuoteAdapter.canQuote({ ...stock, quoteSupported: false }),
      false,
    );
    assert.equal(chainlinkMarkAdapter.source, 'chainlink');
  });
});
