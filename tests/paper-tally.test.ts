import './jsdom-setup.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { baseFill, jesseFill, safeFills, tallyPaper, type PaperFill } from '../lib/desk/paper-tally.ts';
import type { PaperRecord } from '../lib/trading/paper-records.ts';
import type { JessePaperRecord } from '../lib/solana/paper.ts';
import { PaperTally } from '../components/desk/PaperTally.tsx';

const fill = (over: Partial<PaperFill>): PaperFill => ({
  instrumentId: '8453:0xaaa', symbol: 'AAPLc', name: 'Apple Inc.', side: 'buy',
  tokenRaw: 0n, tokenDecimals: 8, usdcRaw: 0n, createdAt: 1, ...over,
});

describe('paper tally', () => {
  it('nets buys and sells per instrument with exact decimals and average prices', () => {
    const [row] = tallyPaper([
      fill({ tokenRaw: 50_000_000n, usdcRaw: 100_000_000n, createdAt: 1 }), // 0.5 for 100 USDC
      fill({ tokenRaw: 25_000_000n, usdcRaw: 60_000_000n, createdAt: 2 }),  // 0.25 for 60 USDC
      fill({ side: 'sell', tokenRaw: 10_000_000n, usdcRaw: 22_500_000n, createdAt: 3 }), // 0.1 for 22.5
    ]);
    assert.equal(row!.records, 3);
    assert.equal(row!.bought, '0.75');
    assert.equal(row!.sold, '0.1');
    assert.equal(row!.net, '0.65');
    assert.equal(row!.netDirection, 'long');
    assert.equal(row!.usdcSpent, '160.00');
    assert.equal(row!.usdcReceived, '22.50');
    assert.equal(row!.averageBuy, '213.3333', '160 / 0.75, half-up to 4 places');
    assert.equal(row!.averageSell, '225.0000');
  });

  it('says short, not a negative holding, when paper sells exceed paper buys', () => {
    const [row] = tallyPaper([fill({ side: 'sell', tokenRaw: 30_000_000n, usdcRaw: 70_000_000n })]);
    assert.equal(row!.net, '-0.3');
    assert.equal(row!.netDirection, 'short');
    assert.equal(row!.averageBuy, null);
  });

  it('is flat when buys and sells cancel', () => {
    const [row] = tallyPaper([
      fill({ tokenRaw: 10n, usdcRaw: 5n }),
      fill({ side: 'sell', tokenRaw: 10n, usdcRaw: 6n }),
    ]);
    assert.equal(row!.netDirection, 'flat');
    assert.equal(row!.net, '0');
  });

  it('keeps instruments apart and lists the most recently filed first', () => {
    const rows = tallyPaper([
      fill({ instrumentId: 'a', symbol: 'AAPLc', tokenRaw: 1n, usdcRaw: 1n, createdAt: 5 }),
      fill({ instrumentId: 'b', symbol: 'NVDAc', tokenRaw: 1n, usdcRaw: 1n, createdAt: 9 }),
    ]);
    assert.deepEqual(rows.map(r => r.symbol), ['NVDAc', 'AAPLc']);
  });

  it('never adds rows whose units disagree', () => {
    const [row] = tallyPaper([
      fill({ tokenRaw: 100_000_000n, usdcRaw: 1_000_000n, tokenDecimals: 8, createdAt: 2 }),
      fill({ tokenRaw: 1n, usdcRaw: 1n, tokenDecimals: 18, createdAt: 1 }),
    ]);
    assert.equal(row!.records, 1);
    assert.equal(row!.bought, '1');
  });

  it('reads Base records by side: buys spend USDC for tokens, sells the reverse', () => {
    const quote = (side: 'buy' | 'sell') => ({
      intent: side === 'buy'
        ? { instrumentId: '8453:0xaaa', side, unit: 'USDC', amount: '10' }
        : { instrumentId: '8453:0xaaa', side, unit: 'token', amount: '0.1' },
      inputSymbol: side === 'buy' ? 'USDC' : 'AAPLc',
      outputSymbol: side === 'buy' ? 'AAPLc' : 'USDC',
      instrumentName: 'Apple Inc.',
      amountInRaw: side === 'buy' ? '10000000' : '10000000',
      amountOutRaw: side === 'buy' ? '4000000' : '25000000',
      tokenDecimals: 8,
    });
    const buy = baseFill({ createdAt: 1, quote: quote('buy') } as unknown as PaperRecord);
    const sell = baseFill({ createdAt: 2, quote: quote('sell') } as unknown as PaperRecord);
    assert.deepEqual([buy.side, buy.symbol, buy.tokenRaw, buy.usdcRaw], ['buy', 'AAPLc', 4_000_000n, 10_000_000n]);
    assert.deepEqual([sell.side, sell.symbol, sell.tokenRaw, sell.usdcRaw], ['sell', 'AAPLc', 10_000_000n, 25_000_000n]);
  });

  it('reads Jesse records with the instrument snapshot decimals', () => {
    const record = {
      createdAt: 3,
      instrumentSnapshot: { symbol: 'AAPLx', name: 'Apple xStock', decimals: 8 },
      quote: { intent: { instrumentId: 'sol:Xs1', side: 'buy', unit: 'USDC', amount: '50' }, amountInRaw: '50000000', amountOutRaw: '21000000' },
    } as unknown as JessePaperRecord;
    const f = jesseFill(record);
    assert.deepEqual([f.symbol, f.tokenDecimals, f.tokenRaw, f.usdcRaw], ['AAPLx', 8, 21_000_000n, 50_000_000n]);
  });

  it('omits unreadable legacy rows instead of miscounting', () => {
    const fills = safeFills([{ broken: true }, { ok: true }], row => {
      if ('broken' in row) throw new Error('bad row');
      return fill({ tokenRaw: 1n, usdcRaw: 1n });
    });
    assert.equal(fills.length, 1);
  });
});

describe('paper tally view', () => {
  it('renders nothing with no records', () => {
    assert.equal(renderToStaticMarkup(createElement(PaperTally, { rows: [], place: 'in this browser' })), '');
  });

  it('labels itself as simulations, not holdings or P&L, and uses a real table', () => {
    const rows = tallyPaper([fill({ tokenRaw: 50_000_000n, usdcRaw: 100_000_000n })]);
    const html = renderToStaticMarkup(createElement(PaperTally, { rows, place: 'in this browser' }));
    assert.match(html, /Paper tally · 1 instrument/);
    assert.match(html, /not wallet holdings/);
    assert.match(html, /no profit or loss is implied/);
    assert.match(html, /<th scope="row">/);
    assert.match(html, /0\.5 AAPLc/);
    assert.match(html, /200\.0000 each/);
  });
});
