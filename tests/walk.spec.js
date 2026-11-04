import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// When you walk, the explorer's shapes slide instead of being built again. What that draws must be what a fresh build
// draws from the same spot: pressing the view's own key builds them again without moving you, so the two pictures
// should match. Earth is hidden because it spins.
const diff = (page, a, b) => page.evaluate(async ([a, b]) => {
  const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
  const data = i => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
  const [x, y] = (await Promise.all([load(a), load(b)])).map(data);
  let off = 0;
  for (let i = 0; i < x.length; i += 4) if (Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])) > 40) off++;
  return 100 * off / (x.length / 4);
}, [a.toString('base64'), b.toString('base64')]);

for (const renderer of ['', 'webgpu-gl']) {
  test(`walking draws what a fresh build draws${renderer ? ` (${renderer})` : ''}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page, /fonts\.(googleapis|gstatic)\.com/);
    await page.addInitScript(() => localStorage.setItem('hw-hidden', JSON.stringify(['Earth'])));
    await page.goto(`/index.html${renderer ? `?renderer=${renderer}` : ''}`);
    await expect(page.locator('#view canvas').first()).toBeVisible();
    await page.waitForTimeout(1500);
    // in Slice, stepping ana changes the cut, so it builds; walking within the slice slides. Stack and Shadow slide for both.
    for (const [digit, keys] of [['Digit1', ['KeyW', 'KeyD', 'KeyR']], ['Digit1', ['KeyE']], ['Digit2', ['KeyE', 'KeyA']], ['Digit3', ['KeyQ', 'KeyS']]]) {
      await page.keyboard.press(digit);
      await page.waitForTimeout(2500);   // the camera's move into Stack
      for (const k of keys) { await page.keyboard.down(k); await page.waitForTimeout(350); await page.keyboard.up(k); }
      await page.waitForTimeout(800);    // moving eases out
      const view = page.locator('#view canvas').first(), slid = await view.screenshot();
      await page.keyboard.press(digit);
      await page.waitForTimeout(500);
      const fresh = await view.screenshot();
      expect(await diff(page, slid, fresh), `${digit} after ${keys}`).toBeLessThan(0.1);
    }
    expect(errors).toEqual([]);
  });
}
