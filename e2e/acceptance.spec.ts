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
    owner: 'anonymous',
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

async function mockApi(page: Page, { now, staleMarkId }: { now?: number; staleMarkId?: string } = {}) {
  const time = now ?? Date.now();
  const quoteId = `quote-${time}`;
  await page.route('**/api/desk/hetty/marks', async route => {
    const body = makeMarks(time, staleMarkId);
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
    const quote = makeEstimate(found, side, amount, quoteId, time);
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
  const justFiled = page.locator('[data-just-filed="true"]');
  await expect(justFiled).toBeVisible({ timeout: 30000 });
  await expect(justFiled).toBeInViewport({ ratio: 1 });
}

test.describe('desktop filing flow', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('loads the desk and reference tape', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Indicative reference marks' })).toBeVisible();
    await expect(page.getByRole('button', { name: /GOOGLc/ })).toBeVisible();
  });

  test('files a paper record through the ticket and shows receipt', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await filePaperRecord(page);
    await expect(page.getByRole('button', { name: 'Start another instruction' })).toBeVisible();

    // Returning to draft clears the receipt and restores a clean ticket.
    await page.getByRole('button', { name: 'Start another instruction' }).click();
    await expect(page.getByRole('button', { name: 'Review estimate' })).toBeVisible();
    await expect(page.getByText('Filed to your paper ledger')).not.toBeVisible();
  });

  test('files a paper record after inspecting quote details', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/');

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Review estimate' }).click();

    await page.getByRole('button', { name: /Quote & product details/ }).click();
    const quoteDialog = page.getByRole('dialog', { name: 'Quote and product details' });
    await expect(quoteDialog).toBeVisible();
    await page.getByRole('button', { name: 'Close quote and product details' }).click();
    await expect(quoteDialog).not.toBeVisible();

    await page.getByRole('button', { name: 'Record paper trade' }).click();
    await expect(page.getByText('Filed to your paper ledger')).toBeVisible();
    const justFiled = page.locator('[data-just-filed="true"]');
    await expect(justFiled).toBeVisible();
    await expect(justFiled).toBeInViewport({ ratio: 1 });
  });

  test('shows a STALE label when a mark is stale', async ({ page }) => {
    await mockApi(page, { staleMarkId: stock.id });
    await page.goto('/');
    await expect(page.getByText('STALE').first()).toBeVisible();
    await expect(page.getByText('Reference marks are stale')).toBeVisible();
  });

  test('Product dossier and Quote & product details open as overlays without extending the page', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/');
    /* The desk hydrates lazily — wait for the ticket before measuring, or
       `before` captures a half-rendered page and the delta lies. */
    await expect(page.getByRole('button', { name: 'Product dossier' })).toBeVisible();

    const before = await page.evaluate(() => document.documentElement.scrollHeight);

    await page.getByRole('button', { name: 'Product dossier' }).click();
    const productDialog = page.getByRole('dialog', { name: 'Product dossier' });
    await expect(productDialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close product dossier' })).toBeVisible();

    const productBox = await productDialog.boundingBox();
    expect(productBox).not.toBeNull();
    const { width: vw } = page.viewportSize()!;
    expect(productBox!.x + productBox!.width).toBeLessThanOrEqual(vw);
    expect(productBox!.x + productBox!.width).toBeGreaterThanOrEqual(vw - 420);
    expect(productBox!.y).toBeGreaterThanOrEqual(0);
    expect(productBox!.width).toBeLessThanOrEqual(420);

    const afterDossier = await page.evaluate(() => document.documentElement.scrollHeight);
    /* Overlays sit in the top layer, so the page must not grow meaningfully.
       Tolerance covers font-load and scrollbar jitter (tens of px); a real
       layout regression extends the page by hundreds. The strict checks are
       the bounding-box geometry above. */
    expect(afterDossier).toBeLessThanOrEqual(before + 48);

    await page.getByRole('button', { name: 'Close product dossier' }).click();
    await expect(productDialog).not.toBeVisible();

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Review estimate' }).click();
    await expect(page.getByText('0.02948502').first()).toBeVisible();

    const beforeQuote = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.getByRole('button', { name: /Quote & product details/ }).click();

    const quoteDialog = page.getByRole('dialog', { name: 'Quote and product details' });
    await expect(quoteDialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close quote and product details' })).toBeVisible();

    const quoteBox = await quoteDialog.boundingBox();
    expect(quoteBox).not.toBeNull();
    expect(quoteBox!.x + quoteBox!.width).toBeLessThanOrEqual(vw);
    expect(quoteBox!.x + quoteBox!.width).toBeGreaterThanOrEqual(vw - 420);
    expect(quoteBox!.y).toBeGreaterThanOrEqual(0);
    expect(quoteBox!.width).toBeLessThanOrEqual(420);

    const afterQuote = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(afterQuote).toBeLessThanOrEqual(beforeQuote + 48);
  });

  /* On desktop the ledger takes the aside's room: the popover is hidden by
     design (`.grid[data-ledger="true"] .aboutHetty`). The popover itself is
     exercised in the mobile flow below. */
  test('About Hetty popover steps aside for the ledger on desktop', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('summary', { hasText: 'About Hetty Green' })).toBeHidden();
  });

  test('drawers can be opened, navigated and dismissed from the keyboard', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'Product dossier' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Product dossier' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close product dossier' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(toggle).toBeFocused();

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    const closeButton = page.getByRole('button', { name: 'Close product dossier' });
    await expect(closeButton).toBeFocused();

    // Tab and Shift+Tab should keep focus inside the modal.
    const activeIsInDialog = async () => page.evaluate(() => document.activeElement?.closest('dialog[aria-label]') !== null);
    await page.keyboard.press('Tab');
    expect(await activeIsInDialog()).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await activeIsInDialog()).toBe(true);
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.goto('/');

    const reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(reducedMotion).toBe(true);

    const ticket = page.locator('[data-ticket-view="draft"]').first();
    await expect(ticket).toBeVisible();
    const animation = await ticket.evaluate(el => window.getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });

  test('recovers from a missing record that was opened then deleted elsewhere', async ({ browser }) => {
    const now = Date.now();
    const record = makeRecord(0, now);
    const context = await browser.newContext({ storageState: buildStorageState([record]) });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await mockApi(page, { now });
    await page.goto('/');

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
    await mockApi(page);
    await page.goto('/');
    await filePaperRecord(page);
    await expect(page.getByText('Filed to your paper ledger')).toBeVisible();
  });

  test('drawers render as bottom sheets and do not trap horizontal overflow', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/');

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Review estimate' }).click();
    await page.getByRole('button', { name: /Quote & product details/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Quote and product details' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const { width: vw, height: vh } = page.viewportSize()!;
    // Bottom sheet anchored to the bottom of the viewport, nearly full width, no horizontal overflow.
    expect(box!.x).toBe(0);
    expect(box!.width).toBeGreaterThanOrEqual(vw * 0.9);
    expect(box!.width).toBeLessThanOrEqual(vw);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vh);
    expect(box!.y).toBeGreaterThanOrEqual(vh * 0.25);
  });

  test('About Hetty Green opens as a popover without extending the page', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    /* Wait for the desk to settle before measuring — a half-hydrated page
       makes `before` a lie. */
    const toggle = page.locator('summary', { hasText: 'About Hetty Green' });
    await expect(toggle).toBeVisible();
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await toggle.click();
    await expect(page.getByText('AI character inspired by the historical financier')).toBeVisible();
    const after = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(after).toBeLessThanOrEqual(before + 20);
  });
});

test.describe('ledger preview', () => {
  test('shows empty history until a record is filed, then previews the latest', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    /* An empty ledger is furniture, not a missing section: the ruled slip
       stays visible and says so before anything is filed. */
    const emptyLedger = page.locator('#paper-ledger');
    await expect(emptyLedger).toBeVisible();
    await expect(emptyLedger.getByText('No paper on file yet.')).toBeVisible();

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
    await mockApi(page, { now });
    await page.goto('/');

    const lines = page.locator('#paper-ledger ol > li');
    await expect(lines).toHaveCount(5);
    await expect(page.getByText('3 older in the archive')).toBeVisible();

    // Click the oldest visible line (the last one in the preview).
    const last = lines.last();
    await last.locator('button').click();
    await expect(last).toHaveAttribute('data-current', 'true');
  });
});
