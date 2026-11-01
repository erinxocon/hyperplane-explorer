import test from 'node:test';
import assert from 'node:assert/strict';
import { mm, mv, dot, ident } from '../../src/math4d.js';
import { SPINS, FRAMES, CROSS, BEST, pose, filmAngles, trail } from '../../src/cat/spins.js';

const close = (a, b, eps = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));
const det4 = m => { // Laplace on the first row
  const minor = (r, c) => [0, 1, 2, 3].filter(i => i !== r).flatMap(i => [0, 1, 2, 3].filter(j => j !== c).map(j => m[i * 4 + j]));
  const d3 = n => n[0] * (n[4] * n[8] - n[5] * n[7]) - n[1] * (n[3] * n[8] - n[5] * n[6]) + n[2] * (n[3] * n[7] - n[4] * n[6]);
  return [0, 1, 2, 3].reduce((s, c) => s + (c % 2 ? -1 : 1) * m[c] * d3(minor(0, c)), 0);
};

test('every spin is back at the start after its turns, and not before for the three-turn ones', () => {
  for (const [s, sp] of Object.entries(SPINS)) {
    const { M, drift } = pose(s, sp.turns * 2 * Math.PI);
    close(M, pose(s, 0).M, 1e-9); assert.ok(Math.abs(drift) < 1e-9, s);
    if (sp.turns === 3) { const one = pose(s, 2 * Math.PI); assert.ok(one.M.some((v, i) => Math.abs(v - pose(s, 0).M[i]) > 1e-6) || Math.abs(one.drift) > 1e-6, s); }
  }
});

test('the frames are turns of the start frame, orthonormal, up along y except volume view', () => {
  for (const [k, f] of Object.entries(FRAMES)) {
    const Q = [...f.R, ...f.U, ...f.F, ...f.A];
    close(mm(Q, [0, 1, 2, 3].flatMap(i => [0, 1, 2, 3].map(j => Q[j * 4 + i]))), ident());
    assert.ok(Math.abs(det4(Q) - 1) < 1e-9, k);
    if (k !== 'volume') close(f.U, [0, 1, 0, 0]);
  }
  CROSS.forEach((c, k) => { const e = [0, 0, 0, 0]; e[k] = 1; assert.equal(Math.abs(dot(c.frame.A, e)), 1); });
});

test('a best-view slice holds the spin: its ana direction is left alone by every pose', () => {
  for (const [s, sp] of Object.entries(SPINS)) {
    const b = BEST[sp.best];
    if (!b.frame) continue;
    const A = b.volume ? [0, 1, 0, 0] : FRAMES[b.frame].A;   // volume view's ana is −U = −y
    for (const t of [0.3, 1.1, 2.9, 5.0]) close(mv(pose(s, t).M, A).map(Math.abs), A.map(Math.abs), 1e-9);
  }
});

test('film angles cover one loop; a trail closes', () => {
  assert.equal(filmAngles('knot', 8)[1], 6 * Math.PI / 8);
  const tr = trail('double', [0.3, 0.5, 0.9], 60), next = pose('double', 2 * Math.PI).M;
  close(mv(next, [0.3, 0.5, 0.9, 0]), tr[0]);
});
