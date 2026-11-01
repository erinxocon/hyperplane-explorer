import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// Loads the explorer, flips through every view, walks, tries volume view, and fails on any page error.
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

  // Walking changes the position readout.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#pz')).not.toHaveText('0.00');

  // Volume view lays the slice level.
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).toBeChecked();
  await page.screenshot({ path: 'test-results/volume.png' });
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1300);
  await expect(page.locator('#volume')).not.toBeChecked();

  expect(errors).toEqual([]);
});
