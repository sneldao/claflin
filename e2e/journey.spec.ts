import { test, expect, type Page } from '@playwright/test';
import { mockApi, PAPER_PREFIX } from './fixtures';

/**
 * The primary journey, end to end in a browser — the acceptance test CI
 * gates on. A bare visit opens the foyer; an instruction lights the line
 * that carries it; typing into that desk carries the instruction onto the
 * ticket; the desk prices and files a paper record; the house home shows
 * the last filing and reopens it.
 *
 * Every selector here is a role or accessible name taken from the source:
 *   HouseTurret   — textbox "Instruction for the house", list "The house lines"
 *                   (folded behind "Talk with a broker" while products match),
 *                   link "Type instead", data-lamp on each line
 *   HouseFoyer    — region "Live reference marks"
 *   SLIP_ACTIONS  — "Price it", "File paper record"
 *   outcomes.ts   — "Filed. Paper only. Nothing moved."
 *   DeskRoom / RoomPresentation — link "Claflin home"
 *   LastFilingLine — button "Open that record"
 *
 * Reduced motion pins the Compact view (shouldPreferCompactView) and keeps
 * WebGL out of the run, so the test is deterministic in headless CI.
 */

const INSTRUCTION = 'buy Apple for 100 USDC';
const FILED = 'Filed. Paper only. Nothing moved.';

async function openFoyer(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page);
  await page.goto('/');
}

function hettyLine(page: Page) {
  return page.getByRole('list', { name: 'The house lines' }).getByRole('listitem').filter({ hasText: 'Hetty' });
}

/* Once an instruction matches products the broker lines fold behind a
   disclosure — open it before asserting on the lamps. */
async function openBrokerLines(page: Page) {
  await page.locator('summary', { hasText: 'Talk with a broker' }).click();
}

test.describe('house journey', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a bare visit opens the foyer, not a desk', async ({ page }) => {
    await openFoyer(page);
    await expect(page.getByRole('textbox', { name: 'Instruction for the house' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Live reference marks' })).toBeVisible();
    await expect(page).not.toHaveURL(/desk=/);
    /* Nothing prices or files from the foyer. */
    await expect(page.getByRole('button', { name: 'Price it' })).toHaveCount(0);
    await expect(page.locator('#house-example')).toHaveCount(1);
    const stops = await page.getByRole('navigation', { name: 'The rooms' }).locator('a').evaluateAll(elements => elements.map(el => el.getAttribute('href')));
    const rooms = await page.locator('#main-content > section').evaluateAll(elements => elements.map(el => `#${el.id}`));
    expect(stops).toEqual(rooms);
  });

  test('an instruction lights the lines and names the products that carry it', async ({ page }) => {
    await openFoyer(page);
    await page.getByRole('textbox', { name: 'Instruction for the house' }).fill(INSTRUCTION);
    await openBrokerLines(page);
    await expect(hettyLine(page)).toHaveAttribute('data-lamp', 'match');
    const matches = page.getByRole('region', { name: 'Matching products' });
    await expect(matches).toBeVisible();
    await expect(matches.getByRole('button', { name: /Continue with AAPLc/ })).toBeVisible();
    await expect(matches.getByRole('button', { name: /Continue with AAPLx/ })).toBeVisible();
  });

  test('foyer → desk → price → file → return → reopen', async ({ page }) => {
    await openFoyer(page);

    // Foyer: say what you want, then take the lit line.
    await page.getByRole('textbox', { name: 'Instruction for the house' }).fill(INSTRUCTION);
    await openBrokerLines(page);
    await expect(hettyLine(page)).toHaveAttribute('data-lamp', 'match');
    await page.getByRole('region', { name: 'Matching products' }).getByRole('button', { name: /Continue with AAPLc/ }).click();

    // Desk: the instruction came with us — no chain chosen, no re-typing.
    await expect(page).toHaveURL(/desk=hetty/);
    await expect(page).toHaveURL(/side=buy/);
    await expect(page).toHaveURL(/amount=100/);

    await page.getByRole('button', { name: 'Price it' }).first().click();
    await page.getByRole('button', { name: 'Save paper record' }).first().click();
    await expect(page.getByText(FILED).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filed receipt' })).toBeVisible();

    // The record is kept in this browser.
    const kept = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, PAPER_PREFIX);
    expect(kept).toBe(1);

    // The ledger adds it up per instrument — labelled as paper, not a holding.
    const tally = page.locator('[data-paper-tally="true"]');
    await tally.locator('summary', { hasText: 'Paper tally · 1 instrument' }).click();
    await expect(tally.getByRole('rowheader', { name: 'AAPLc' })).toBeVisible();
    await expect(tally.getByText(/not wallet holdings/)).toBeVisible();

    // Return to the house: the foyer remembers the last filing.
    await page.getByRole('link', { name: 'Claflin home' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Instruction for the house' })).toBeVisible();
    const reopen = page.getByRole('button', { name: 'Open that record' });
    await expect(reopen).toBeVisible();

    // Reopen it: back on the desk, looking at the same filed record.
    await reopen.click();
    await expect(page).toHaveURL(/desk=hetty/);
    await expect(page).toHaveURL(/record=/);
    await expect(page.getByText(FILED).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filed receipt' })).toBeVisible();
  });

  test('the same journey on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFoyer(page);
    await page.getByRole('textbox', { name: 'Instruction for the house' }).fill(INSTRUCTION);
    await page.getByRole('region', { name: 'Matching products' }).getByRole('button', { name: /Continue with AAPLc/ }).click();
    await expect(page).toHaveURL(/desk=hetty/);
    /* Both views are reachable from the first visit, including from
       Compact on a phone (reduced motion lands here in Compact). */
    await expect(page.getByRole('group', { name: 'Desk presentation' }).getByRole('button', { name: 'Room' })).toBeVisible();
    await page.getByRole('button', { name: 'Price it' }).first().click();
    await page.getByRole('button', { name: 'Save paper record' }).first().click();
    await expect(page.getByText(FILED).first()).toBeVisible();
  });
});
