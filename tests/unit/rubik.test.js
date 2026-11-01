import test from 'node:test';
import assert from 'node:assert/strict';
import { rot, mm, mv } from '../../src/math4d.js';
import { createCube, isSolved } from '../../src/rubik/cube.js';

// run every animation to its end
const settle = c => { for (let n = 0; n < 2000 && (c.anim || c.queue.length || c.mirror || c.spin.on || c.spin.stopping); n++) c.step(0.05); };
const integer = c => c.pieces.every(p => p.M.every(x => x === Math.round(x)));

test('80 pieces, solved to start with', () => {
  const c = createCube();
  assert.equal(c.pieces.length, 80);
  assert.ok(c.solved());
});

test('a twist and its inverse put it back; four quarter turns of a layer too', () => {
  const c = createCube();
  c.axis = 3; c.val = 1;
  c.twist(0, 1, 1); settle(c);
  assert.ok(!c.solved());
  c.twist(0, 1, -1); settle(c);
  assert.ok(c.solved());
  assert.equal(c.moves, 2);
  for (let k = 0; k < 4; k++) c.twist(1, 2, 1);
  settle(c);
  assert.ok(c.solved() && integer(c));
});

test('a twist turns exactly its layer: 27 pieces turn, and all but the 3 on the fixed line move', () => {
  const c = createCube();
  c.axis = 0; c.val = -1;
  const where = p => mv(p.M, p.h).join(), before = c.pieces.map(p => ({ M: p.M.join(), at: where(p) }));
  c.twist(1, 3, 1); settle(c);
  assert.equal(c.pieces.filter((p, k) => p.M.join() !== before[k].M).length, 27);
  assert.equal(c.pieces.filter((p, k) => where(p) !== before[k].at).length, 24);   // y = w = 0 stays put
});

test('solved holds up to a whole-puzzle rotation', () => {
  const c = createCube(), O = mm(rot(0, 3, Math.PI / 2), rot(1, 2, Math.PI)).map(Math.round);
  for (const p of c.pieces) p.M = mm(O, p.M).map(Math.round);
  assert.ok(isSolved(c.pieces));
});

test('Mirror via 4D and Double rotation end baked into the pieces, still solved', () => {
  const c = createCube();
  assert.ok(c.startMirror([1, 0, 0, 0], [0, 0, 0, 1]));
  assert.ok(!c.toggleSpin());   // not while mirroring
  settle(c);
  assert.ok(integer(c) && c.O.every((x, i) => x === (i % 5 === 0 ? 1 : 0)));
  assert.ok(c.solved());
  c.toggleSpin(); for (let n = 0; n < 30; n++) c.step(0.05);
  c.toggleSpin(); settle(c);   // runs on to the next quarter turn, then bakes
  assert.ok(integer(c) && c.solved());
});

test('scramble queues fast twists and resets the count; reset puts everything back', () => {
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const c = createCube();
  c.twist(0, 1, 1);
  c.scramble(24, rand);
  assert.equal(c.moves, 0);
  assert.equal(c.queue.length, 25);
  settle(c);
  assert.ok(!c.solved() && integer(c));
  c.reset();
  assert.ok(c.solved() && c.moves === 0 && !c.queue.length);
});
