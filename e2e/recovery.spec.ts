import { test, expect, type Page } from '@playwright/test';
import { mockApi, PAPER_PREFIX } from './fixtures';

async function openDesk(page: Page, options: Parameters<typeof mockApi>[1] = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page, options);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Instruction for the house' }).fill('buy Apple for 100 USDC');
  await page.getByRole('region', { name: 'Matching products' }).getByRole('button', { name: /Continue with AAPLc/ }).click();
  await expect(page.getByRole('button', { name: 'Price it' }).first()).toBeVisible();
}
async function noRecord(page: Page) {
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, PAPER_PREFIX)).toBe(0);
  await expect(page.getByRole('region', { name: 'Filed receipt' })).toHaveCount(0);
}

test.describe('paper failure and recovery', () => {
  test('a missing record link recovers to a usable ticket without claiming a receipt', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.goto('/?desk=hetty&view=compact&record=missing-fixture');
    await expect(page.getByRole('heading', { name: 'That record is no longer here.' })).toBeVisible();
    await noRecord(page);
    await page.getByRole('button', { name: 'Back to the ticket', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Price it' }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/record=/);
  });
  test('an unavailable quote retains the instruction and can be retried', async ({ page }) => {
    await openDesk(page, { failQuotes: 3 });
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: /problem completing|try again/i }).first()).toBeVisible();
    await noRecord(page);
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await expect(page.getByRole('button', { name: 'Save paper record' }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Save paper record' }).first().click();
    await expect(page.getByRole('region', { name: 'Filed receipt' })).toBeVisible();
  });

  test('an estimate expired on arrival cannot be filed and can be refreshed', async ({ page }) => {
    await openDesk(page, { expiredQuotes: 1 });
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: /expired/i }).first()).toBeVisible();
    await noRecord(page);
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await expect(page.getByRole('button', { name: 'Save paper record' }).first()).toBeEnabled();
  });

  test('failed browser storage never claims success and the same quotation can be filed on retry', async ({ page }) => {
    await page.addInitScript(prefix => {
      const original = Storage.prototype.setItem;
      let fail = true;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith(prefix) && fail) { fail = false; throw new DOMException('Quota exceeded', 'QuotaExceededError'); }
        return original.call(this, key, value);
      };
    }, PAPER_PREFIX);
    await openDesk(page);
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await page.getByRole('button', { name: 'Save paper record' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: /Not filed/ }).first()).toBeVisible();
    await noRecord(page);
    await page.getByRole('button', { name: 'Save paper record' }).first().click();
    await expect(page.getByRole('region', { name: 'Filed receipt' })).toBeVisible();
    expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, PAPER_PREFIX)).toBe(1);
  });

  test('keyboard users can price and file with reduced motion on a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
    await openDesk(page);
    const price = page.getByRole('button', { name: 'Price it' }).first();
    await price.focus();
    await expect(price).toBeFocused();
    await page.keyboard.press('Enter');
    const file = page.getByRole('button', { name: 'Save paper record' }).first();
    await expect(file).toBeEnabled();
    await file.focus();
    await expect(file).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Filed receipt' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Desk presentation' }).getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true');
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflows).toBe(false);
  });
});
