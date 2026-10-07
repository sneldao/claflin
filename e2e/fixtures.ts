import type { Page } from '@playwright/test';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, formatAmount, parseAmount } from '../lib/trading/domain';
import type { BaseQuoteEstimate, TradeIntent } from '../lib/trading/domain';
import type { MarksResult } from '../lib/trading/marks-shared';
import type { PaperRecord } from '../lib/trading/paper-records';

/** Shared e2e fixtures: deterministic Hetty estimates, marks and seeded paper records. */
export const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;
export const MULTIPLIER = '1000000000000000000';
export const PAPER_PREFIX = 'claflin.paper.v1.';

export function makeEstimate(
  instrument: typeof stock,
  side: 'buy' | 'sell',
  amount: string,
  id: string,
  time: number,
): BaseQuoteEstimate {
  const decimals = instrument.decimals!;
  const inputDecimals = side === 'buy' ? 6 : decimals;
  const outputDecimals = side === 'buy' ? decimals : 6;
  const inputRaw = parseAmount(amount, inputDecimals);
  // Deterministic conversion: 10 USDC -> 0.02948502 tokens (8 decimals)
  const outputRaw = side === 'buy'
    ? (inputRaw * 2948502n) / 10000000n
    : (inputRaw * 10000000n) / 2948502n;
  const inputAmount = formatAmount(inputRaw, inputDecimals);
  const outputAmount = formatAmount(outputRaw, outputDecimals);
  const tokenRaw = side === 'buy' ? outputRaw : inputRaw;
  const shareEquivalent = formatAmount(tokenRaw * BigInt(MULTIPLIER), decimals + 18);

  const intent: TradeIntent = (side === 'buy'
    ? { instrumentId: instrument.id, side: 'buy' as const, unit: 'USDC' as const, amount }
    : { instrumentId: instrument.id, side: 'sell' as const, unit: 'token' as const, amount });

  return {
    id,
    kind: 'estimate',
    mode: 'paper',
    liveExecutionEnabled: false,
    intent,
    chainId: 8453,
    venue: 'aerodrome',
    poolAddress: instrument.venuePairs[0].poolAddress,
    instrumentAddress: instrument.contractAddress,
    instrumentName: instrument.name,
    inputSymbol: side === 'buy' ? 'USDC' : instrument.symbol,
    outputSymbol: side === 'buy' ? instrument.symbol : 'USDC',
    amountInRaw: inputRaw.toString(),
    amountOutRaw: outputRaw.toString(),
    inputAmount,
    outputAmount,
    tokenDecimals: decimals,
    multiplierRaw: MULTIPLIER,
    shareEquivalent,
    reference: {
      source: 'chainlink',
      status: 'observed',
      priceUsdPerToken: '164.20',
      updatedAt: Math.floor(time / 1000) - 10,
      session: 'unknown',
      pauseStatus: 'unchecked',
    },
    blockNumber: 123,
    blockTimestamp: Math.floor(time / 1000) - 2,
    quotedAt: time - 5000,
    expiresAt: time + 25000,
    assumptions: PAPER_ASSUMPTIONS,
  };
}

export function makeMarks(now: number, staleInstrumentId?: string): MarksResult {
  return {
    asOf: now,
    marks: DESK_INSTRUMENTS.filter(s => s.quoteSupported).map(s => {
      const stale = staleInstrumentId === s.id;
      return {
        instrumentId: s.id,
        symbol: s.symbol,
        name: s.name,
        reference: {
          source: 'chainlink',
          status: stale ? 'stale' : 'observed',
          priceUsdPerToken: '150.00',
          updatedAt: Math.floor(now / 1000) - 10,
          session: 'unknown',
          pauseStatus: 'unchecked',
        },
      };
    }),
  };
}

export function makeRecord(index: number, createdAt: number): PaperRecord {
  const id = `seed-${createdAt}-${index}`;
  return {
    version: 1,
    id,
    mode: 'paper',
    deskId: 'hetty',
    owner: 'anonymous',
    createdAt,
    quote: makeEstimate(stock, 'buy', '10', id, createdAt),
  };
}

export function buildStorageState(records: PaperRecord[]) {
  return {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:3000',
        localStorage: records.map(record => ({
          name: `${PAPER_PREFIX}${record.id}`,
          value: JSON.stringify(record),
        })),
      },
    ],
  };
}

export async function mockApi(page: Page, { now, staleMarkId, failQuotes = 0, expiredQuotes = 0 }: {
  now?: number;
  staleMarkId?: string;
  failQuotes?: number;
  expiredQuotes?: number;
} = {}) {
  const time = now ?? Date.now();
  const quoteId = `quote-${time}`;
  await page.route('**/api/desk/*/marks', async route => {
    const hetty = route.request().url().includes('/api/desk/hetty/');
    const body: MarksResult = hetty ? makeMarks(time, staleMarkId) : { asOf: time, marks: [] };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/api/desk/hetty/quote*', async route => {
    const url = new URL(route.request().url());
    const instrumentId = url.searchParams.get('instrumentId');
    const side = (url.searchParams.get('side') as 'buy' | 'sell') ?? 'buy';
    const amount = url.searchParams.get('amount') ?? '10';
    const unit = url.searchParams.get('unit') ?? 'USDC';
    const found = DESK_INSTRUMENTS.find(s => s.id === instrumentId);
    if (!found) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unknown_instrument' }) });
    }
    if (failQuotes-- > 0) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'venue_unavailable', message: 'The venue is unavailable. Please retry.' } }) });
    }
    const quote = makeEstimate(found, side, amount, quoteId, now ?? Date.now());
    if (expiredQuotes-- > 0) {
      quote.quotedAt = Date.now() - 35000;
      quote.expiresAt = Date.now() - 5000;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(quote) });
  });
}
