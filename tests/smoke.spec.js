import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// Loads the app, flips through every view, runs a twist, tries volume view, and fails on any page error.
test('renders every view without errors', async ({ page }) => {
  const errors = watchErrors(page);

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

  // Volume view lays the slice level; a Y layer can then be faced by moving to its height.
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).toBeChecked();
  await page.screenshot({ path: 'test-results/volume.png' });
  await page.click('#rk-ax1');
  await expect(page.locator('#rk-goto')).toHaveText('Face this layer');
  await page.click('#rk-goto');
  await page.waitForTimeout(1000);
  await expect(page.locator('#py')).toHaveText('0.72'); // puzzle center y 0.1 + one layer pitch 0.62
  await page.screenshot({ path: 'test-results/volume-y-layer.png' });
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).not.toBeChecked();

  expect(errors).toEqual([]);
});
