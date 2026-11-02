import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// Every page on WebGPURenderer's WebGL2 backend, through every view, so the TSL shaders get compiled and drawn: an
// incompatible material or a shader that won't compile shows up as a console error. Headless software GPUs can't create
// WebGPU pipelines, so this is as near to WebGPU as the suite gets.
for (const page_ of ['index', 'rubik', 'chess', 'cat']) {
  test(`WebGPURenderer, WebGL2 backend: ${page_}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page, /fonts\.(googleapis|gstatic)\.com|youtube|ytimg|googlevideo/);
    await page.route(/youtube|ytimg|googlevideo/, r => r.abort());
    await page.goto(`/${page_}.html?renderer=webgpu-gl`);
    await expect(page.locator('#view canvas').first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__renderer.isWebGPURenderer)).toBe(true);
    for (const key of ['Digit2', 'Digit3', 'Digit1']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `test-results/webgpu-${page_}-${key}.png` });
    }
    expect(errors).toEqual([]);
  });
}
