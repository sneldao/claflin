import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_SLIP_DISCLAIMER,
  deskSlipTokenMetadata,
  findDeskSlipByKind,
  loadDeskSlips,
  mintFirstLiveSlip,
  mintFirstPaperSlip,
  rememberSlipDedication,
  takeSlipDedication,
} from '../lib/trading/desk-slips';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import type { PaperRecord } from '../lib/trading/paper-records';
import type { LiveJournalEntry } from '../lib/trading/live-journal';

const stock = DESK_INSTRUMENTS[0];
const now = 1_788_600_000_000;
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
const quote: QuoteEstimate = {
  id: 'slip-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
  inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals!,
  multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function storage() {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key(index: number) { return [...map.keys()][index] ?? null; },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    setItem(key: string, value: string) { map.set(key, value); },
    removeItem(key: string) { map.delete(key); },
  };
}

function paperRecord(): PaperRecord {
  return {
    version: 1, id: quote.id, mode: 'paper', deskId: 'hetty', owner: 'anonymous',
    createdAt: now + 1, quote,
  };
}

function liveEntry(status: 'filled' | 'submitted' = 'filled'): LiveJournalEntry {
  const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  return {
    version: 1,
    id: `live-${hash}`,
    kind: status === 'filled' ? 'confirmed-swap' : 'submitted-swap',
    mode: 'live',
    deskId: 'hetty',
    walletAddress: '0x000000000000000000000000000000000000dEaD',
    hash,
    quote,
    reviewed: {
      inputAmount: quote.inputAmount,
      inputSymbol: quote.inputSymbol,
      outputAmount: quote.outputAmount,
      outputSymbol: quote.outputSymbol,
    },
    settlement: { status, message: status === 'filled' ? 'filled' : 'submitted' },
    slippageBps: 50,
    updatedAt: now + 2,
    isPosition: false,
  };
}

describe('desk slips', () => {
  beforeEach(() => { takeSlipDedication(); });

  it('mints an idempotent first-paper slip with disclaimer and optional dedication', () => {
    const store = storage();
    rememberSlipDedication('user', 'Buy NVIDIA for 10 USDC');
    const first = mintFirstPaperSlip(store, paperRecord(), now);
    assert.equal(first.kind, 'first-paper');
    assert.equal(first.disclaimer, DESK_SLIP_DISCLAIMER);
    assert.equal(first.dedication?.text, 'Buy NVIDIA for 10 USDC');
    const second = mintFirstPaperSlip(store, paperRecord(), now + 99);
    assert.equal(second.id, first.id);
    assert.equal(loadDeskSlips(store, 'hetty').length, 1);
    const meta = deskSlipTokenMetadata(first);
    assert.equal((meta.claflin as { isEquity: boolean }).isEquity, false);
    assert.match(String(meta.description), /Not a security/);
  });

  it('mints first-live only for confirmed fills and binds the Base hash', () => {
    const store = storage();
    assert.equal(mintFirstLiveSlip(store, liveEntry('submitted'), now), null);
    const slip = mintFirstLiveSlip(store, liveEntry('filled'), now);
    assert.ok(slip);
    assert.equal(slip!.kind, 'first-live');
    assert.equal(slip!.txHash?.startsWith('0x'), true);
    assert.equal(findDeskSlipByKind(store, 'first-live')?.id, slip!.id);
  });

  it('never confuses dedication take with inventing speech', () => {
    assert.equal(takeSlipDedication(), null);
    rememberSlipDedication('agent', '   ');
    assert.equal(takeSlipDedication(), null);
  });
});
