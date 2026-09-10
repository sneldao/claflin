import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveLiveApproval,
  saveLiveSubmission,
  updateLiveOutcome,
  loadLiveJournal,
  pendingLiveJournalEntries,
  findLiveJournalByHash,
  compactLiveEntry,
  parseLiveJournalEntry,
} from '../lib/trading/live-journal';
import { outcomeFromReceipt } from '../lib/trading/execute-swap';
import { buildLiveJournalExport } from '../lib/trading/ledger-export';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { BASE_USDC } from '../lib/base-chain';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;
const now = 1_788_600_000_000;
const wallet = '0x000000000000000000000000000000000000dEaD';
const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const approveHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
const quote: QuoteEstimate = {
  id: 'live-journal-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '10000000', amountOutRaw: '2948502',
  inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals!,
  multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
  reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: Math.floor(now / 1000), session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function memoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    key(index: number) { return [...map.keys()][index] ?? null; },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    setItem(key: string, value: string) { map.set(key, value); },
    removeItem(key: string) { map.delete(key); },
  };
  return storage;
}

describe('live journal persistence', () => {
  it('files a submission as soon as the hash exists, before confirmation', () => {
    const storage = memoryStorage();
    const entry = saveLiveSubmission(storage, {
      hash,
      quote,
      walletAddress: wallet,
      slippageBps: 50,
      deskId: 'hetty',
      now,
    });
    assert.equal(entry.kind, 'submitted-swap');
    assert.equal(entry.settlement.status, 'submitted');
    assert.equal(entry.isPosition, false);
    assert.equal(entry.reviewed.inputAmount, '10');
    assert.equal(loadLiveJournal(storage, 'hetty').length, 1);
    assert.equal(pendingLiveJournalEntries(storage, 'hetty').length, 1);
  });

  it('updates settlement without rewriting reviewed terms', () => {
    const storage = memoryStorage();
    saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 50, now });
    const updated = updateLiveOutcome(storage, hash, {
      status: 'filled',
      hash,
      message: 'Swap filled on Base.',
      feeEth: '0.0001',
      amountInObserved: '10',
      amountOutObserved: '0.029',
      blockNumber: 999,
    }, now + 1000);
    assert.ok(updated);
    assert.equal(updated!.kind, 'confirmed-swap');
    assert.equal(updated!.settlement.status, 'filled');
    assert.equal(updated!.reviewed.outputAmount, '0.02948502');
    assert.equal(updated!.settlement.amountOutObserved, '0.029');
    assert.equal(pendingLiveJournalEntries(storage).length, 0);
  });

  it('records approvals as a distinct document type', () => {
    const storage = memoryStorage();
    const entry = saveLiveApproval(storage, { hash: approveHash, quote, walletAddress: wallet, now });
    assert.equal(entry.kind, 'approval');
    assert.equal(entry.settlement.status, 'filled');
    assert.equal(pendingLiveJournalEntries(storage).length, 0);
    assert.equal(findLiveJournalByHash(storage, approveHash)?.id, entry.id);
  });

  it('is idempotent on the same hash and rejects empty hashes', () => {
    const storage = memoryStorage();
    const first = saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 50, now });
    const second = saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 100, now: now + 5 });
    assert.equal(first.id, second.id);
    assert.equal(loadLiveJournal(storage).length, 1);
    assert.throws(() => saveLiveSubmission(storage, { hash: '0x', quote, walletAddress: wallet, slippageBps: 50, now }));
  });

  it('labels compact entries as live evidence, never positions', () => {
    const storage = memoryStorage();
    const entry = saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 50, now });
    const compact = compactLiveEntry(entry);
    assert.match(compact.action, /Live buy/);
    assert.equal(compact.isPosition, false);
    assert.equal(compact.mode, 'live');
  });

  it('round-trips through parseLiveJournalEntry', () => {
    const storage = memoryStorage();
    const entry = saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 50, now });
    const raw = storage.getItem(`claflin.live.v1.${entry.id}`)!;
    assert.deepEqual(parseLiveJournalEntry(raw).reviewed, entry.reviewed);
  });
});

describe('receipt enrichment', () => {
  it('extracts gas fee and Transfer amounts when present', () => {
    const walletAddr = wallet as `0x${string}`;
    const pad = (addr: string) => `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}`;
    const amountIn = 10_000_000n; // 10 USDC
    const amountOut = 2_948_502n;
    const receipt = {
      status: 'success' as const,
      gasUsed: 210000n,
      effectiveGasPrice: 1_000_000_000n,
      blockNumber: 42n,
      logs: [
        {
          address: BASE_USDC,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            pad(walletAddr),
            pad('0x1111111111111111111111111111111111111111'),
          ],
          data: `0x${amountIn.toString(16).padStart(64, '0')}`,
        },
        {
          address: stock.contractAddress,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            pad('0x1111111111111111111111111111111111111111'),
            pad(walletAddr),
          ],
          data: `0x${amountOut.toString(16).padStart(64, '0')}`,
        },
      ],
    };
    const outcome = outcomeFromReceipt(receipt, hash, quote, walletAddr);
    assert.equal(outcome.status, 'filled');
    assert.equal(outcome.amountInObserved, '10');
    assert.equal(outcome.amountOutObserved, '0.02948502');
    assert.ok(outcome.feeEth);
    assert.equal(outcome.blockNumber, 42);
  });
});

describe('live journal export', () => {
  it('marks provenance clearly in CSV and JSON', () => {
    const storage = memoryStorage();
    saveLiveSubmission(storage, { hash, quote, walletAddress: wallet, slippageBps: 50, now });
    const entries = loadLiveJournal(storage);
    const csv = buildLiveJournalExport(entries, 'csv').body;
    assert.match(csv, /Historical Base transaction/);
    assert.match(csv, /submitted-swap/);
    const json = JSON.parse(buildLiveJournalExport(entries, 'json').body);
    assert.equal(json.kind, 'claflin-live-journal');
    assert.equal(json.mode, 'live');
    assert.equal(json.entries[0].isPosition, false);
  });
});
