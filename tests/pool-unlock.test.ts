import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyUnlock, routablePools, type PoolReading } from '../lib/trading/pool-unlock.ts';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog.ts';
import { TOKENIZED_STOCKS } from '../lib/tokenized-stocks.ts';

const pool = (over: Partial<PoolReading> = {}): PoolReading => ({
  tickSpacing: 10,
  poolAddress: '0x' + '1'.repeat(40),
  liquidity: '1000',
  quoterOut1Usdc: '900000',
  ...over,
});

describe('pool unlock classification', () => {
  it('unlockable only with decimals and a routable USDC pool', () => {
    assert.equal(classifyUnlock({ decimalsOnChain: 8, pools: [pool()] }).status, 'unlockable_data_only');
  });

  it('a pool the quoter cannot route needs code, not a catalog edit', () => {
    assert.equal(classifyUnlock({ decimalsOnChain: 8, pools: [pool({ quoterOut1Usdc: null })] }).status, 'pool_not_routable');
    assert.equal(classifyUnlock({ decimalsOnChain: 8, pools: [pool({ quoterOut1Usdc: '0' })] }).status, 'pool_not_routable');
  });

  it('no pool at all means the liquidity is on another venue', () => {
    assert.equal(classifyUnlock({ decimalsOnChain: 8, pools: [] }).status, 'no_usdc_pool');
  });

  it('unreadable decimals block regardless of pools', () => {
    assert.equal(classifyUnlock({ decimalsOnChain: null, pools: [pool()] }).status, 'decimals_unreadable');
  });

  it('chooses the routable pool with the deepest in-range liquidity', () => {
    const chosen = classifyUnlock({
      decimalsOnChain: 8,
      pools: [
        pool({ tickSpacing: 100, liquidity: '500' }),
        pool({ tickSpacing: 10, liquidity: '9000' }),
        pool({ tickSpacing: 1, liquidity: '0', quoterOut1Usdc: '0' }),
      ],
    }).chosen;
    assert.equal(chosen?.tickSpacing, 10);
  });

  it('never picks an unroutable pool even if it is the deepest', () => {
    assert.deepEqual(routablePools([pool({ liquidity: '999999', quoterOut1Usdc: null }), pool({ liquidity: '1' })]).map(p => p.liquidity), ['1']);
  });

  it('tolerates a malformed liquidity string', () => {
    assert.doesNotThrow(() => routablePools([pool({ liquidity: 'not-a-number' })]));
  });
});

describe('probe targets match the live quote gate', () => {
  /* The script probes exactly the instruments the desk cannot quote — the
     same gate as lib/trading/catalog.ts. If the catalog changes, this keeps
     the probe honest about which names it should be reporting on. */
  const quotable = DESK_INSTRUMENTS.filter(i => i.quoteSupported).map(i => i.symbol).sort();
  const blocked = TOKENIZED_STOCKS
    .filter(s => !(s.availability === 'quote_candidate' && s.decimals !== null && s.venuePairs.length > 0))
    .map(s => s.symbol)
    .sort();

  it('7 instruments quote today; the rest are what the probe targets', () => {
    assert.deepEqual(quotable, ['AAPLc', 'GOOGLc', 'METAc', 'NVDAc']);
    assert.equal(quotable.length + blocked.length, TOKENIZED_STOCKS.length);
    assert.ok(blocked.includes('TSLAc') && blocked.includes('AMZNc'));
    assert.ok(!blocked.some(sym => quotable.includes(sym)));
  });
});
