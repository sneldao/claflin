import { test, expect, type Browser, type Page } from '@playwright/test';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, formatAmount, parseAmount } from '../lib/trading/domain';
import type { QuoteEstimate, TradeIntent } from '../lib/trading/domain';
import type { MarksResult } from '../lib/trading/marks-shared';
import type { PaperRecord } from '../lib/trading/paper-records';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;
const MULTIPLIER = '1000000000000000000';
const PAPER_PREFIX = 'claflin.paper.v1.';

function makeEstimate(
  instrument: typeof stock,
  side: 'buy' | 'sell',
  amount: string,
  id: string,
  time: number,
): QuoteEstimate {
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

function makeMarks(now: number, staleInstrumentId?: string): MarksResult {
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

function makeRecord(index: number, createdAt: number): PaperRecord {
  const id = `seed-${createdAt}-${index}`;
  return {
    version: 1,
    id,
    mode: 'paper',
    deskId: 'hetty',
    createdAt,
    quote: makeEstimate(stock, 'buy', '10', id, createdAt),
  };
}

function buildStorageState(records: PaperRecord[]) {
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

async function mockApi(page: Page, { staleMarkId }: { staleMarkId?: string } = {}) {
  await page.route('**/api/stocks/marks', async route => {
    const body = makeMarks(Date.now(), staleMarkId);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/api/stocks/quote*', async route => {
    const url = new URL(route.request().url());
    const instrumentId = url.searchParams.get('instrumentId');
    const side = (url.searchParams.get('side') as 'buy' | 'sell') ?? 'buy';
    const amount = url.searchParams.get('amount') ?? '10';
    const unit = url.searchParams.get('unit') ?? 'USDC';
    const found = DESK_INSTRUMENTS.find(s => s.id === instrumentId);
    if (!found) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unknown_instrument' }) });
    }
    const quote = makeEstimate(found, side, amount, `quote-${Date.now()}`, Date.now());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(quote) });
  });
}

async function selectInstrument(page: Page) {
  // Use the instrument plaque (radio label) instead of the animated tape.
  await page.locator('label', { hasText: /GOOGLc/ }).first().click();
}

async function filePaperRecord(page: Page) {
  await selectInstrument(page);
  await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
  await page.getByRole('button', { name: 'Review estimate' }).click();
  await expect(page.getByText('0.02948502').first()).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Record paper trade' }).click();
  await expect(page.getByText('Filed to your paper ledger')).toBeVisible({ timeout: 30000 });
}

test.describe('desktop filing flow', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('loads the desk and reference tape', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);
    await expect(page.getByRole('region', { name: 'Indicative reference marks' })).toBeVisible();
    await expect(page.getByRole('button', { name: /GOOGLc/ })).toBeVisible();
  });

  test('files a paper record through the ticket and shows receipt', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);

    await filePaperRecord(page);
    await expect(page.getByRole('button', { name: 'Start another instruction' })).toBeVisible();

    // Returning to draft clears the receipt and restores a clean ticket.
    await page.getByRole('button', { name: 'Start another instruction' }).click();
    await expect(page.getByRole('button', { name: 'Review estimate' })).toBeVisible();
    await expect(page.getByText('Filed to your paper ledger')).not.toBeVisible();
  });

  test('shows a STALE label when a mark is stale', async ({ page }) => {
    await page.goto('/');
    await mockApi(page, { staleMarkId: stock.id });
    await expect(page.getByText('STALE').first()).toBeVisible();
    await expect(page.getByText('Reference marks are stale')).toBeVisible();
  });

  test('Product dossier and Quote & product details open as overlays without extending the page', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);

    const before = await page.evaluate(() => document.documentElement.scrollHeight);

    await page.getByText('Product dossier').click();
    await expect(page.getByText('Coinbase-issued tokenized products')).toBeVisible();
    const afterDossier = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(afterDossier).toBeLessThanOrEqual(before + 10);
    await page.getByRole('button', { name: 'Close product dossier' }).click();

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Review estimate' }).click();
    const beforeQuote = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.getByText('Quote & product details').click();

    await expect(page.getByText('This paper trade uses the quoted output')).toBeVisible();
    const panel = page.getByTestId('quote-details-panel');
    await expect(panel).toBeVisible();
    const afterQuote = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(afterQuote).toBeLessThanOrEqual(beforeQuote + 80);
  });

  test('About Hetty Green opens as a popover without extending the page', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.getByText('About Hetty Green').click();
    await expect(page.getByText('AI character inspired by the historical financier')).toBeVisible();
    const after = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(after).toBeLessThanOrEqual(before + 10);
  });

  test('disclosures can be opened and closed from the keyboard', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);

    await page.getByText('Product dossier').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Coinbase-issued tokenized products')).toBeVisible();

    await page.getByRole('button', { name: 'Close product dossier' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Coinbase-issued tokenized products')).not.toBeVisible();
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.reload();

    const reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(reducedMotion).toBe(true);

    const ticket = page.locator('[data-ticket-view="draft"]').first();
    await expect(ticket).toBeVisible();
    const animation = await ticket.evaluate(el => window.getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });

  test('recovers from a missing record that was opened then deleted elsewhere', async ({ browser }) => {
    const record = makeRecord(0, Date.now());
    const context = await browser.newContext({ storageState: buildStorageState([record]) });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await mockApi(page);

    // Open the seeded record from the ledger.
    const ledger = page.locator('#paper-ledger');
    await expect(ledger).toBeVisible();
    await page.locator('#paper-ledger ol > li').first().locator('button').click();
    await expect(page.getByText('Filed to your paper ledger')).toBeVisible();

    // Simulate deletion from another tab via storage event.
    await page.evaluate(key => {
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
    }, `${PAPER_PREFIX}${record.id}`);

    await expect(page.getByText('That record is no longer here')).toBeVisible();
    await page.getByRole('button', { name: /Back to the ticket|Back to your instruction/ }).click();
    await expect(page.getByRole('button', { name: 'Review estimate' })).toBeVisible();
  });
});

test.describe('mobile filing flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('files a paper record through the ticket on a narrow viewport', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);
    await filePaperRecord(page);
    await expect(page.getByText('Filed to your paper ledger')).toBeVisible();
  });

  test('drawers render as bottom sheets and do not trap horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Review estimate' }).click();
    await page.getByText('Quote & product details').click();

    await expect(page.getByText('This paper trade uses the quoted output')).toBeVisible();
    const panel = page.getByTestId('quote-details-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

test.describe('ledger preview', () => {
  test('shows empty history until a record is filed, then previews the latest', async ({ page }) => {
    await page.goto('/');
    await mockApi(page);
    await expect(page.locator('#paper-ledger')).not.toBeVisible();

    await filePaperRecord(page);

    const ledger = page.locator('#paper-ledger');
    await expect(ledger).toBeVisible();
    await expect(ledger.getByText('1 ON FILE')).toBeVisible();
  });

  test('keeps the focused older record visible in the compact preview', async ({ browser }) => {
    const now = Date.now();
    const records = Array.from({ length: 8 }, (_, i) => makeRecord(i, now - i * 86_400_000));
    const context = await browser.newContext({ storageState: buildStorageState(records) });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await mockApi(page);

    const lines = page.locator('#paper-ledger ol > li');
    await expect(lines).toHaveCount(5);
    await expect(page.getByText('3 older in the archive')).toBeVisible();

    // Click the oldest visible line (the last one in the preview).
    const last = lines.last();
    await last.locator('button').click();
    await expect(last).toHaveAttribute('data-current', 'true');
  });
});
