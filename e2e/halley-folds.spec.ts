import { test, expect, type Page } from '@playwright/test';

/**
 * The launch slip's fold behaviour, verified in a real browser.
 *
 * This is the one part of the desk that unit tests cannot reach. The three
 * sections are mutually exclusive because they share a `<details name>`,
 * the browser owns which one is open, and the desk only nudges — so the
 * assertions here are about DOM state after interaction, never about the
 * markup that produces it.
 *
 * Reaching the desk needs no estimate: the draft completes client-side the
 * moment a quote is chosen, because the house pencils the rest. Only the
 * live-path probe is stubbed, and it is stubbed closed — paper stays
 * available, so no wallet ceremony enters the run.
 */

const FOLDS = ['halley-step-1', 'halley-step-2', 'halley-step-3'] as const;

async function openHalley(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/desk/*/marks', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ asOf: Date.now(), marks: [], enabled: false }),
  }));
  await page.route('**/api/desk/halley/live/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ enabled: false }),
  }));
  await page.goto('/?desk=halley');
  await expect(page.getByRole('heading', { name: 'The launch desk.' })).toBeVisible();
  /* The launch card leads; the three-section slip is Customise. */
  await expect(page.locator('#halley-card')).toBeVisible();
  await expect(page.locator('#halley-step-1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Customise' }).click();
}

/** Which sections are open right now, in fold order. */
async function openFolds(page: Page): Promise<string[]> {
  const state = await page.locator(FOLDS.map(id => `#${id}`).join(', ')).evaluateAll(els =>
    els.filter(el => (el as HTMLDetailsElement).open).map(el => el.id));
  return state;
}

/** Fill the draft to the point where the house has pencilled the economics. */
async function completeDraft(page: Page) {
  await page.locator('#halley-name').fill('Basilisk');
  await page.locator('#halley-symbol').fill('BASILISK');
  await page.getByRole('button', { name: 'USDC', exact: true }).click();
}

test.describe('the launch slip folds', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('one section stands open, and the desk opens it', async ({ page }) => {
    await openHalley(page);
    /* A blank slip orients the caller in the first section. */
    expect(await openFolds(page)).toEqual(['halley-step-1']);
  });

  test('opening a section closes the other two', async ({ page }) => {
    await openHalley(page);
    await page.locator('#halley-step-1 > summary').click();
    expect(await openFolds(page)).toEqual([]);

    await page.locator('#halley-step-3 > summary').click();
    expect(await openFolds(page)).toEqual(['halley-step-3']);

    /* The caller's hand, not React's: it stays where they put it. */
    await page.waitForTimeout(150);
    expect(await openFolds(page)).toEqual(['halley-step-3']);
  });

  test('a still-needed link opens the section that owns it, and a write there keeps it', async ({ page }) => {
    await openHalley(page);
    await page.locator('#halley-name').fill('Basilisk');
    await page.locator('#halley-symbol').fill('BASILISK');
    await page.locator('#halley-step-3 > summary').click();
    expect(await openFolds(page)).toEqual(['halley-step-3']);

    /* The quote lives in the anchor section — its jump link opens that one. */
    await page.locator('#halley-needed').getByRole('button', { name: 'quote asset' }).click();
    expect(await openFolds(page)).toEqual(['halley-step-2']);

    /* A single-section write keeps the caller where their hand is. */
    await page.getByRole('button', { name: 'NVDA', exact: true }).click();
    expect(await openFolds(page)).toEqual(['halley-step-2']);
  });

  test('a completed slip rests closed on its chips', async ({ page }) => {
    await openHalley(page);
    await completeDraft(page);

    /* House defaults finished the economics, so nothing is left to decide
       and every fold closes — the review button is the only lit path. */
    await expect(page.getByText('Still needed:')).toHaveCount(0);
    expect(await openFolds(page)).toEqual([]);
    await expect(page.getByRole('button', { name: /Review projected launch|See paper projection/ })).toBeEnabled();

    /* And a completed slip can still be opened again to adjust it. */
    await page.locator('#halley-step-3 > summary').click();
    expect(await openFolds(page)).toEqual(['halley-step-3']);
  });

  test('a house-pencilled value reads as pencil until the caller touches it', async ({ page }) => {
    await openHalley(page);
    await completeDraft(page);

    const supply = page.locator('[data-pencil]').filter({ hasText: '1,000,000' }).first();
    await expect(supply).toHaveAttribute('data-pencil', 'house');

    await page.locator('#halley-step-3 > summary').click();
    /* Raw figures live one depth down, behind Fine-tune. */
    await page.locator('#halley-fine-tune > summary').click();
    await page.locator('#halley-supply').fill('2000000');
    const touched = page.locator('[data-pencil]').filter({ hasText: '2,000,000' }).first();
    await expect(touched).toHaveAttribute('data-pencil', 'caller');
  });
});