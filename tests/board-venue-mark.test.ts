import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boardRow } from '../lib/desk/board';
import { INSTRUMENT_OFFERINGS } from '../lib/desk/offerings';
import type { DeskMark } from '../lib/trading/marks-shared';

/**
 * Phase 1.2: Isabel's marks now carry a third leg — the Lighter venue
 * mark — and the board renders it. The test asserts the shape flows
 * end-to-end: a mark with venueMark surfaces as a row with venueMark.
 */

const isabelOffering = INSTRUMENT_OFFERINGS.find(o => o.mandateId === 'robinhood-stock-tokens' && o.quoteSupported);
if (!isabelOffering) {
  throw new Error('Expected at least one quote-supported Robinhood offering in INSTRUMENT_OFFERINGS');
}

function baseMark(): DeskMark {
  return {
    instrumentId: isabelOffering!.instrumentId,
    symbol: isabelOffering!.symbol,
    name: isabelOffering!.name,
    reference: {
      source: 'chainlink',
      status: 'observed',
      priceUsdPerToken: '330.47',
      updatedAt: Date.now(),
      session: 'regular',
      pauseStatus: 'unpaused',
    },
  };
}

describe('board — venue mark (Isabel / Lighter)', () => {
  it('the board row carries a venueMark when the mark has one', () => {
    const mark: DeskMark = {
      ...baseMark(),
      venueMark: {
        priceUsd: '330.285',
        source: 'lighter',
        volume24hUsd: '380',
      },
    };
    const row = boardRow(isabelOffering!, mark, true);
    assert.equal(row.venueMark, '330.29');
    assert.equal(row.venueMarkSource, 'Lighter');
    assert.equal(row.venueMarkVolume24hUsd, '380');
  });

  it('the board row venueMark is null when the mark has no venueMark', () => {
    const row = boardRow(isabelOffering!, baseMark(), true);
    assert.equal(row.venueMark, null);
    assert.equal(row.venueMarkSource, null);
    assert.equal(row.venueMarkVolume24hUsd, null);
  });

  it('the board never computes the venueMark from the token mark', () => {
    // The honesty rule: three legs read independently, never blended.
    // Without a venueMark, the row is null, even if the stock ref exists.
    const mark: DeskMark = {
      ...baseMark(),
      stockReference: {
        priceUsd: '330.37',
        source: 'robinhood',
        differenceBps: '0.5',
      },
    };
    const row = boardRow(isabelOffering!, mark, true);
    assert.equal(row.venueMark, null);
    // But the stock ref is present.
    assert.equal(row.stockRef, '330.37');
  });
});

describe('board — source label', () => {
  it('"lighter" is mapped to "Lighter" in the source label', async () => {
    // The source-label map in board.ts is the single source. The
    // board row passes through sourceLabel which has the entry.
    const { sourceLabel } = await import('../lib/desk/board');
    assert.equal(sourceLabel('lighter'), 'Lighter');
  });
});