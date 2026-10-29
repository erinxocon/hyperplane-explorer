import { test, expect } from '@playwright/test';

// Loads the 4D spinning cat with YouTube blocked (the test can't depend on it), presses play, walks, steps ana, taps
// the TV in the ruler, swings the slice so the screen is cut to a band, tries every view and volume view, resets, and
// fails on any page error. Reduced motion makes jumps and volume view instant, so the steps don't wait on frame rate.
test('4D spinning cat: walk, tilt, every view', async ({ page }) => {
  test.setTimeout(180_000);   // software GL is slow to draw this scene
  const errors = [];
  const external = url => /fonts\.(googleapis|gstatic)\.com|youtube|ytimg|googlevideo/.test(url);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!external(r.url())) errors.push(`request failed: ${r.url()}`); });
  await page.route(/youtube|ytimg|googlevideo/, r => r.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/cat.html');
  await expect(page.locator('#view canvas').first()).toBeVisible();
  await expect(page.locator('#music-note')).toContainText('YouTube didn’t load');
  await page.click('#play');                               // no music, but the cat still spins
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/cat-slice.png' });

  const step = async (id, n = 1) => { await page.focus(id); for (let i = 0; i < n; i++) await page.keyboard.press('Enter'); };
  await step('#k-fwd');                                     // a key pressed from the keyboard moves one step
  await expect(page.locator('#pz')).toHaveText('0.60');
  await step('#k-ana');
  await expect(page.locator('#pw')).toHaveText('0.60');
  await page.click('.row-btn:has-text("4D TV")');          // back to the middle of the TV along ana
  await expect(page.locator('#pw')).toHaveText('0.00');
  await step('#k-ana');
  await step('#r-ra', 3);                                   // swing sideways into ana: the screen is cut to a band
  await expect.poll(() => page.evaluate(() => document.querySelector('.tv-screen').style.clipPath)).toContain('polygon');
  await page.screenshot({ path: 'test-results/cat-swing.png' });

  for (const [key, name] of [['Digit2', 'stack'], ['Digit3', 'shadow']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/cat-${name}.png` });
  }
  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#volume')).toBeChecked();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/cat-volume.png' });
  await page.keyboard.press('KeyV');
  await page.click('#reset');
  await expect(page.locator('#pw')).toHaveText('0.00');
  await expect(page.locator('#pz')).toHaveText('0.00');
  expect(errors).toEqual([]);
});
