import { test, expect } from '@playwright/test';

test('an anonymous Jesse paper visit loads the media transport only when the line is requested', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', response => {
    if (response.request().resourceType() === 'script') scripts.push(response.url());
  });
  let voiceRequests = 0;
  await page.route('**/api/**', route => {
    if (route.request().url().includes('/api/desk/jesse/session')) {
      voiceRequests++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'voice_unavailable' }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ asOf: Date.now(), marks: [], enabled: false }) });
  });
  await page.goto('/?desk=jesse&view=compact&line=elevenlabs', { waitUntil: 'networkidle' });
  const ring = page.getByRole('button', { name: 'Ring Jesse', exact: true });
  await expect(ring).toBeVisible();
  expect(voiceRequests).toBe(0);
  const before = scripts.length;
  await ring.click();
  await expect.poll(() => voiceRequests).toBeGreaterThan(0);
  expect(scripts.length).toBeGreaterThan(before);
  await expect(page.locator('#instruction')).toBeVisible();
  await expect(page.locator('#jesse-line [role="alert"]')).toBeVisible();
});
