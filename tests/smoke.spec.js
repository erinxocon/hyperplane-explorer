import { test, expect } from '@playwright/test';

// Loads the app, flips through every view, runs a twist, and fails on any page error.
test('renders every view without errors', async ({ page }) => {
  const errors = [];
  const isFont = url => /fonts\.(googleapis|gstatic)\.com/.test(url);
  page.on('pageerror', e => errors.push(String(e)));
  // Resource failures are checked by URL below, so web fonts being offline doesn't fail the run.
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!isFont(r.url())) errors.push(`request failed: ${r.url()}`); });

  await page.goto('/');
  await expect(page.locator('#view canvas:not(.compass)')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/slice.png' });

  for (const [key, name] of [['Digit2', 'stack'], ['Digit3', 'shadow'], ['Digit1', 'slice-again']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/${name}.png` });
  }

  await page.click('#rk-diag');
  await page.waitForTimeout(1500);
  await page.click('#tw-YZ-p');
  await page.waitForTimeout(600);
  await expect(page.locator('#rk-state')).toHaveText('1 move');
  await page.screenshot({ path: 'test-results/diagonal-twist.png' });

  expect(errors).toEqual([]);
});
