import { test, expect } from '@playwright/test';

// Loads 4D chess, plays a move by clicking the board, waits for the computer's reply, tries every view, another
// ana axis and the plain stand, takes both moves back, and fails on any page error.
test('4D chess: a move, the reply, every view', async ({ page }) => {
  test.setTimeout(180_000);   // software GL is slow to draw this scene
  const errors = [];
  const isFont = url => /fonts\.(googleapis|gstatic)\.com/.test(url);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!isFont(r.url())) errors.push(`request failed: ${r.url()}`); });

  await page.goto('/chess.html');
  await expect(page.locator('#view canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const click = async name => { const p = await page.evaluate(n => window.chess4d.cellOnScreen(n), name); await page.mouse.click(p.x, p.y); };

  await click('b2 y1 w2');                       // a white pawn
  await expect(page.locator('#layers .badge').nth(1)).toHaveText('1');
  await click('b3 y1 w2');                       // one step forward along z
  await expect(page.locator('#moves li')).toHaveCount(1);
  await expect(page.locator('#moves li')).toHaveCount(2, { timeout: 30_000 });   // the computer replies
  await page.screenshot({ path: 'test-results/chess-stack.png' });

  for (const [key, name] of [['Digit1', 'slice'], ['Digit3', 'shadow']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/chess-${name}.png` });
  }
  await page.keyboard.press('Digit2');
  await page.click('#ana-x');
  await expect(page.locator('#layers button').first()).toContainText('x 1');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/chess-ana-x.png' });
  await page.click('#ana-w');
  await page.click('#stand-plain');               // the plain frame instead of the tri-d stand
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/chess-plain.png' });
  await page.click('#stand-trek');

  await page.click('#undo');
  await expect(page.locator('#moves li')).toHaveCount(0);
  await expect(page.locator('#state')).toHaveText('White to move');
  expect(errors).toEqual([]);
});
