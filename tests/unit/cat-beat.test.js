import test from 'node:test';
import assert from 'node:assert/strict';
import { BPM, BEATS_PER_SECOND, songClock, songAngle, phaseError, lockStep } from '../../src/cat/beat.js';

const TURN = 2 * Math.PI;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('150 BPM is 2.5 beats a second', () => {
  assert.equal(BPM, 150);
  assert.equal(BEATS_PER_SECOND, 2.5);
});

test('at one turn per beat, every beat is a whole turn, measured from beat0', () => {
  for (const beat of [0, 1, 7, 100]) {
    const t = 0.12 + beat / BEATS_PER_SECOND;
    near(songAngle(t, BEATS_PER_SECOND, 0.12), beat * TURN, 1e-6);
  }
  near(songAngle(0.12 + 2 / BEATS_PER_SECOND, BEATS_PER_SECOND / 2, 0.12), TURN, 1e-6);   // half time: a turn every two beats
});

test('the phase error is the short way round, and never more than half a turn', () => {
  near(phaseError(0, 1), 1);
  near(phaseError(1, 0), -1);
  near(phaseError(0.1, TURN - 0.1), -0.2);
  near(phaseError(TURN - 0.1, 0.1), 0.2);
  near(phaseError(3 * TURN, 40 * TURN), 0);
  for (let a = -20; a < 20; a += 0.37) for (let b = -20; b < 20; b += 0.41) {
    const e = phaseError(a, b);
    assert.ok(e >= -Math.PI && e < Math.PI, `${e}`);
    near(Math.sin(a + e), Math.sin(b), 1e-9);
    near(Math.cos(a + e), Math.cos(b), 1e-9);
  }
});

test('the catch-up takes a share of the error that grows with the frame, and overshoots at no frame rate', () => {
  near(lockStep(1, 0), 0);
  assert.ok(lockStep(1, 1 / 60) < lockStep(1, 1 / 10));
  assert.ok(lockStep(1, 10) < 1);
  near(lockStep(-2, 0.1), -lockStep(2, 0.1));
});

// A song played for 10 s from `song0`, read on frames `fps` a second, by a player that reports four times a second.
function play(clock, fps, song0 = 7, start = 100) {
  let worst = 0;
  for (let frame = 0; frame < 10 * fps; frame++) {
    const played = frame / fps;
    const t = clock.read(song0 + Math.floor(played * 4) / 4, start + played);
    if (played > 2) worst = Math.max(worst, Math.abs(t - (song0 + played)));
  }
  return worst;
}

test('the clock sees through readings that only change a few times a second, at any frame rate', () => {
  for (const fps of [60, 30, 13, 7]) assert.ok(play(songClock(), fps) < 0.02, `${fps} fps: ${play(songClock(), fps)}`);
});

test('a reading ahead lands at once, one a little behind barely moves it, one far off is a seek', () => {
  const clock = songClock();
  clock.read(10, 100);
  near(clock.read(10, 100.5), 10.5);                // no new reading: it counts on
  near(clock.read(10.6, 100.5), 10.6);              // ahead: we had been late
  near(clock.read(10.4, 100.5), 10.6 - 0.2 * 0.05); // behind: this reading was late
  near(clock.read(60, 101), 60);                    // a seek forward
  near(clock.read(40, 101.5), 40);                  // a seek back, further than a late reading can be
  near(clock.read(0, 102), 0);                      // the video looped
});

test('reset forgets the song, so a short stall does not leave the clock ahead', () => {
  const clock = songClock();
  clock.read(10, 100);
  clock.reset();
  near(clock.read(10.1, 100.5), 10.1);              // 0.4 s behind where it was, but it isn't held there
});
