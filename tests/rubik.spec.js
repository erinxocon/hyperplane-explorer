import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// Loads the 4D Rubik's cube, flips every view, does a diagonal view and a twist, faces a Y layer in volume view, and
// fails on any page error.
test('4D Rubik’s cube: every view, a twist, facing a layer', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('/rubik.html');
  await expect(page.locator('#view canvas:not(.compass)')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/rubik-slice.png' });

  for (const [key, name] of [['Digit2', 'stack'], ['Digit3', 'shadow'], ['Digit1', 'slice-again']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/rubik-${name}.png` });
  }

  await page.click('#rk-diag');
  await page.waitForTimeout(1500);
  await page.click('#tw-YZ-p');
  await page.waitForTimeout(600);
  await expect(page.locator('#rk-state')).toHaveText('1 move');
  await page.screenshot({ path: 'test-results/rubik-diagonal-twist.png' });

  // Volume view lays the slice level; a Y layer can then be faced by moving to its height.
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).toBeChecked();
  await page.click('#rk-ax1');
  await expect(page.locator('#rk-goto')).toHaveText('Face this layer');
  await page.click('#rk-goto');
  await page.waitForTimeout(1000);
  await expect(page.locator('#py')).toHaveText('0.72'); // puzzle center y 0.1 + one layer pitch 0.62
  await page.screenshot({ path: 'test-results/rubik-volume-y-layer.png' });
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).not.toBeChecked();

  expect(errors).toEqual([]);
});
