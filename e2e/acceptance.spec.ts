import { test, expect } from '@playwright/test';
import { buildStorageState, makeRecord, mockApi, PAPER_PREFIX, stock } from './fixtures';
import type { Page } from '@playwright/test';

/* LEGACY DESK SUITE — written before 0db728f opened the foyer on a bare
   visit. Every test now enters the desk directly with `?desk=hetty`, but
   several assertions still name copy that has since moved (the desk's
   "Indicative reference marks" region, "Quote & product details",
   "older in the archive", Hetty's empty-ledger line). It is marked fixme
   until it is reconciled against a real browser run; e2e/journey.spec.ts
   is the maintained, CI-gated acceptance test. */
test.fixme(true, 'Legacy pre-foyer desk suite — reconcile selectors against a browser run (see header).');

async function selectInstrument(page: Page) {
  // Use the instrument plaque (radio label) instead of the animated tape.
  await page.locator('label', { hasText: /GOOGLc/ }).first().click();
}

async function filePaperRecord(page: Page) {
  await selectInstrument(page);
  await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
  await page.getByRole('button', { name: 'Price it' }).click();
  await expect(page.getByText('0.02948502').first()).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'File paper record' }).click();
  await expect(page.getByText('Filed. Paper only. Nothing moved.')).toBeVisible({ timeout: 30000 });
  const justFiled = page.locator('[data-just-filed="true"]');
  await expect(justFiled).toBeVisible({ timeout: 30000 });
  await expect(justFiled).toBeInViewport({ ratio: 1 });
}

test.describe('desktop filing flow', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('loads the desk and reference tape', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?desk=hetty');
    await expect(page.getByRole('region', { name: 'Indicative reference marks' })).toBeVisible();
    await expect(page.getByRole('button', { name: /GOOGLc/ })).toBeVisible();
  });

  test('files a paper record through the ticket and shows receipt', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?desk=hetty');

    await filePaperRecord(page);
    await expect(page.getByRole('button', { name: 'Start another instruction' })).toBeVisible();

    // Returning to draft clears the receipt and restores a clean ticket.
    await page.getByRole('button', { name: 'Start another instruction' }).click();
    await expect(page.getByRole('button', { name: 'Price it' })).toBeVisible();
    await expect(page.getByText('Filed. Paper only. Nothing moved.')).not.toBeVisible();
  });

  test('files a paper record after inspecting quote details', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/?desk=hetty');

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Price it' }).click();

    await page.getByRole('button', { name: /Quote & product details/ }).click();
    const quoteDialog = page.getByRole('dialog', { name: 'Quote and product details' });
    await expect(quoteDialog).toBeVisible();
    await page.getByRole('button', { name: 'Close quote and product details' }).click();
    await expect(quoteDialog).not.toBeVisible();

    await page.getByRole('button', { name: 'File paper record' }).click();
    await expect(page.getByText('Filed. Paper only. Nothing moved.')).toBeVisible();
    const justFiled = page.locator('[data-just-filed="true"]');
    await expect(justFiled).toBeVisible();
    await expect(justFiled).toBeInViewport({ ratio: 1 });
  });

  test('shows a STALE label when a mark is stale', async ({ page }) => {
    await mockApi(page, { staleMarkId: stock.id });
    await page.goto('/?desk=hetty');
    await expect(page.getByText('STALE').first()).toBeVisible();
    await expect(page.getByText('Reference marks are stale')).toBeVisible();
  });

  test('Product dossier and Quote & product details open as overlays without extending the page', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/?desk=hetty');
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
    await page.getByRole('button', { name: 'Price it' }).click();
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
    await page.goto('/?desk=hetty');
    await expect(page.locator('summary', { hasText: 'About Hetty Green' })).toBeHidden();
  });

  test('drawers can be opened, navigated and dismissed from the keyboard', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/?desk=hetty');

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
    await page.goto('/?desk=hetty');

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
    await page.goto('/?desk=hetty');

    // Open the seeded record from the ledger.
    const ledger = page.locator('#paper-ledger');
    await expect(ledger).toBeVisible();
    await page.locator('#paper-ledger ol > li').first().locator('button').click();
    await expect(page.getByText('Filed. Paper only. Nothing moved.')).toBeVisible();

    // Simulate deletion from another tab via storage event.
    await page.evaluate(key => {
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
    }, `${PAPER_PREFIX}${record.id}`);

    await expect(page.getByText('That record is no longer here')).toBeVisible();
    await page.getByRole('button', { name: /Back to the ticket|Back to your instruction/ }).click();
    await expect(page.getByRole('button', { name: 'Price it' })).toBeVisible();
  });
});

test.describe('mobile filing flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('files a paper record through the ticket on a narrow viewport', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?desk=hetty');
    await filePaperRecord(page);
    await expect(page.getByText('Filed. Paper only. Nothing moved.')).toBeVisible();
  });

  test('drawers render as bottom sheets and do not trap horizontal overflow', async ({ page }) => {
    const now = Date.now();
    await page.clock.install();
    await page.clock.setSystemTime(now);
    await mockApi(page, { now });
    await page.goto('/?desk=hetty');

    await selectInstrument(page);
    await page.getByRole('button', { name: 'Set amount to 10 USDC' }).click();
    await page.getByRole('button', { name: 'Price it' }).click();
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
    await page.goto('/?desk=hetty');
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
    await page.goto('/?desk=hetty');
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
    await page.goto('/?desk=hetty');

    const lines = page.locator('#paper-ledger ol > li');
    await expect(lines).toHaveCount(5);
    await expect(page.getByText('3 older in the archive')).toBeVisible();

    // Click the oldest visible line (the last one in the preview).
    const last = lines.last();
    await last.locator('button').click();
    await expect(last).toHaveAttribute('data-current', 'true');
  });
});
