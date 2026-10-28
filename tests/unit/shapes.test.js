import test from 'node:test';
import assert from 'node:assert/strict';
import { sub, dot } from '../../src/math4d.js';
import { tesseract, cell16, cell24, cell5, duoprism, cell600, klein, kleinPoint, spunKleinFiber, mobius4 } from '../../src/shapes.js';

const degrees = s => { const d = s.verts.map(() => 0); s.edges.forEach(([i, j]) => { d[i]++; d[j]++; }); return d; };
const regular = (s, nv, ne, deg) => { assert.equal(s.verts.length, nv); assert.equal(s.edges.length, ne); assert.ok(degrees(s).every(x => x === deg)); };

test('tesseract', () => regular(tesseract(), 16, 32, 4));
test('16-cell', () => regular(cell16(), 8, 24, 6));
test('24-cell', () => regular(cell24(), 24, 96, 8));
test('5-cell', () => regular(cell5(), 5, 10, 4));
test('6,6-duoprism', () => regular(duoprism(6, 6), 36, 72, 4));
test('600-cell', () => {
  const s = cell600();
  regular(s, 120, 720, 12);
  s.verts.forEach(v => assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9));
});

test('Klein bottle: closed, Euler characteristic 0, non-orientable, embedded', () => {
  const k = klein(24, 12);
  const edges = new Map();
  for (const t of k.tris) for (let e = 0; e < 3; e++) {
    const a = t[e], b = t[(e + 1) % 3], key = Math.min(a, b) + ',' + Math.max(a, b);
    edges.set(key, [...(edges.get(key) || []), { t, a, b }]);
  }
  assert.ok([...edges.values()].every(l => l.length === 2));
  assert.equal(k.verts.length - edges.size + k.tris.length, 0);
  // try to orient every triangle consistently; on a Klein bottle this must fail
  const sign = new Map([[k.tris[0], 1]]), queue = [k.tris[0]];
  let conflict = false;
  while (queue.length) {
    const t = queue.shift();
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      for (const n of edges.get(Math.min(a, b) + ',' + Math.max(a, b))) {
        if (n.t === t) continue;
        const want = sign.get(t) * (n.a === a ? -1 : 1);
        if (!sign.has(n.t)) { sign.set(n.t, want); queue.push(n.t); } else if (sign.get(n.t) !== want) conflict = true;
      }
    }
  }
  assert.ok(conflict);
  // the seam glues (u + 2pi, v) to (u, -v)
  const p = kleinPoint(2 * Math.PI + 0.7, 1.1), q = kleinPoint(0.7, -1.1);
  p.forEach((x, i) => assert.ok(Math.abs(x - q[i]) < 1e-12));
  // no two mesh vertices coincide: the surface doesn't pass through itself
  let min = Infinity;
  for (let i = 0; i < k.verts.length; i++) for (let j = i + 1; j < k.verts.length; j++) min = Math.min(min, Math.hypot(...sub(k.verts[i], k.verts[j])));
  assert.ok(min > 1e-3);
});

test('3D Klein bottle: glued with a mirror flip, immersed, and its w = 0 slice is the glass bottle', () => {
  const X = (u, p) => { const f = spunKleinFiber(u); return [0, 1, 2, 3].map(i => f.c[i] + f.M[0][i] * p[0] + f.M[1][i] * p[1] + f.M[2][i] * p[2]); };
  const close = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12));
  const p = [0.6, 0.48, 0.64];
  close(X(Math.PI, p), X(0, [-p[0], p[1], p[2]]));
  // immersed: at every sampled point the u-derivative and two tangents of the fiber sphere are independent
  const h = 1e-6, Mp = (f, v) => [0, 1, 2, 3].map(i => f.M[0][i] * v[0] + f.M[1][i] * v[1] + f.M[2][i] * v[2]);
  let margin = Infinity;
  for (let i = 0; i < 120; i++) for (let j = 1; j < 16; j++) for (let l = 0; l < 16; l++) {
    const u = Math.PI * (i + 0.5) / 120, a = Math.PI * j / 16, b = 2 * Math.PI * l / 16;
    const q = [Math.cos(a), Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b)];
    const t1 = [-Math.sin(a), Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b)], t2 = [0, -Math.sin(b), Math.cos(b)];
    const f = spunKleinFiber(u);
    const basis = [];
    for (const c of [sub(X(u + h, q), X(u, q)), Mp(f, t1), Mp(f, t2)]) {
      let w = c.slice();
      for (const e of basis) { const d = w.reduce((acc, x, k) => acc + x * e[k], 0); w = w.map((x, k) => x - d * e[k]); }
      const n = Math.hypot(...w); margin = Math.min(margin, n / Math.hypot(...c)); basis.push(w.map(x => x / n));
    }
  }
  assert.ok(margin > 0.5);
  // p2 = 0 gives w = 0: the classic bottle, z = (2/15)(3 + 5 cos u sin u) sin v before scaling
  const u = 1.1, v = 2.3, q = X(u, [Math.cos(v), Math.sin(v), 0]);
  assert.equal(q[3], 0);
  assert.ok(Math.abs(q[2] * 2.1 - (2 / 15) * (3 + 5 * Math.cos(u) * Math.sin(u)) * Math.sin(v)) < 1e-12);
});

test('4D Möbius strip: the disk comes back mirrored, and a slice through every disk is a Möbius strip', () => {
  const D = mobius4(200), first = D[0], last = D[200];
  const close = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12));
  close(last.c, first.c); close(last.M[0], first.M[0]); close(last.M[1], first.M[1].map(x => -x));
  // tilted 0.233 rad in x–w and offset 0.23: the hyperplane n·X = c crosses every disk, in the chord α a + β b = δ
  const n = [Math.sin(0.233), 0, 0, Math.cos(0.233)], c = 0.23;
  const chord = f => {
    const al = dot(f.M[0], n), be = dot(f.M[1], n), del = c - dot(f.c, n);
    assert.ok(del * del < al * al + be * be);
    return [0, 1, 2, 3].map(i => -be * f.M[0][i] + al * f.M[1][i]);   // the chord's direction in 4D
  };
  const T = D.map(chord);
  // the direction varies continuously around the loop, and comes back reversed on the same chord: a Möbius strip
  for (let i = 1; i < T.length; i++) assert.ok(dot(T[i], T[i - 1]) > 0);
  assert.ok(dot(T[200], T[0]) < 0);
});
