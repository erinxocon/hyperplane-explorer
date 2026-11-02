import { test, expect } from '@playwright/test';
import { watchErrors } from './errors.js';

// Loads the 4D spinning cat with YouTube blocked (the test can't depend on it), presses play, walks, steps ana, taps
// the TV in the ruler, swings the slice so the screen is cut to a band, tries every view and volume view, resets, tries
// every spin, and fails on any page error. Reduced motion makes jumps and volume view instant, so the steps don't wait
// on frame rate; window.cat4d.pose stops the cat at a set pose for the screenshots that need one.
// A stand-in for YouTube's player whose clock, like the real one, only changes four times a second. The test reads how
// far the spin is from where that clock's true time says it should be, wherever the frame rate is.
const FAKE_YT = `
  window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }, Player: class {
    constructor(el, o) { this.o = o; this.state = -1; this.at = 0; window.fakePlayer = this; }
    true() { return this.state === 1 ? this.at + (performance.now() - this.from) / 1000 : this.at; }
    set(state) { this.at = this.true(); this.from = performance.now(); this.state = state; this.o.events.onStateChange({ data: state }); }
    playVideo() { this.set(1); }
    pauseVideo() { this.set(2); }
    seekTo(t) { this.at = t; this.from = performance.now(); }
    getPlayerState() { return this.state; }
    getCurrentTime() { return Math.floor(this.true() * 4) / 4; }
  } };
  window.onYouTubeIframeAPIReady();`;

test('4D spinning cat: the spin keeps to the song', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page, /fonts\.(googleapis|gstatic)\.com|youtube|ytimg|googlevideo/);
  await page.route(/youtube|ytimg|googlevideo/, r => r.request().url().includes('iframe_api')
    ? r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }) : r.abort());
  await page.goto('/cat.html');
  await expect(page.locator('#speed')).toHaveValue('2.5');
  await page.waitForFunction(() => window.fakePlayer);

  // the spin's distance from the song's true time at the last frame, in degrees of a turn, the short way round
  const off = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => setTimeout(() => {
    const { angle, songT, tick, speed, beat0 } = window.cat4d.sync(), p = window.fakePlayer;
    if (songT === null) return done(null);
    const song = p.at + (tick * 1000 - p.from) / 1000;
    const d = ((angle / (2 * Math.PI) - speed * (song - beat0)) % 1 + 1.5) % 1 - 0.5;
    done(Math.abs(d) * 360);
  }))));
  const settled = async () => {
    await page.waitForTimeout(3000);
    const seen = [];
    for (let i = 0; i < 12; i++) { seen.push(await off()); await page.waitForTimeout(170); }
    for (const d of seen) expect(d).toBeLessThan(30);
  };

  await page.evaluate(() => window.fakePlayer.seekTo(1.13));   // start where a free-running spin would be out of phase
  await page.click('#play');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await settled();

  await page.evaluate(() => window.fakePlayer.seekTo(42.37));   // a seek
  await settled();

  await page.locator('#beat0').fill('0.2');                     // half a beat later
  await expect(page.locator('#beat0-out')).toHaveText('0.20 s');
  await settled();

  await page.locator('#speed').fill('1.25');                    // half time
  await settled();

  await page.click('#play');                                    // pause: the lock lets go
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(off).toBeNull();
  expect(errors).toEqual([]);
});

test('4D spinning cat: walk, tilt, every view', async ({ page }) => {
  test.setTimeout(180_000);   // software GL is slow to draw this scene
  const errors = watchErrors(page, /fonts\.(googleapis|gstatic)\.com|youtube|ytimg|googlevideo/);
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

  // every spin for a moment, level with the cat; then poses that show its roundness in w: a quarter somersault, and
  // Pass through partway out of your slice
  for (const v of ['w', 'pass', 'double', 'opposite', 'knot', 'flip', 'tumble', 'wobble', 'y']) {
    await page.click(`#spin-${v}`);
    await expect(page.locator(`#spin-${v}`)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
  }
  for (const [spin, deg] of [['flip', 90], ['pass', 45], ['w', 90]]) {
    await page.evaluate(([s, d]) => window.cat4d.pose(s, d), [spin, deg]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/cat-${spin}-${deg}.png` });
  }
  // the cat's own views: the axis cross and the film strip (Slice only, so they switch the view back to it)
  await page.keyboard.press('Digit3');
  for (const l of ['cross', 'film']) {
    await page.click(`#lay-${l}`);
    await expect(page.locator('#vm-slice')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1200);
    await expect(page.locator('.cat-tags .tag:not([hidden])').first()).toBeVisible();
    await page.screenshot({ path: `test-results/cat-${l}.png` });
  }
  await page.keyboard.press('Digit2');                       // another view puts the cat back in your slice
  await expect(page.locator('#lay-slice')).toHaveAttribute('aria-pressed', 'true');

  // Best view: a quarter-turn pitch for Through w, volume view for Both, Shadow with trails for Double
  for (const [spin, check] of [['w', '#vm-slice'], ['both', '#volume'], ['double', '#vm-shadow']]) {
    await page.click(`#spin-${spin}`);
    await page.click('#best');
    await expect(page.locator('#best-desc')).toBeVisible();
    if (check === '#volume') await expect(page.locator(check)).toBeChecked();
    else await expect(page.locator(check)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/cat-best-${spin}.png` });
  }
  await expect(page.locator('#trails')).toBeChecked();
  await expect(page.locator('#pw')).toHaveText('0.00');
  expect(errors).toEqual([]);
});
