import test from 'node:test';
import assert from 'node:assert/strict';
import { sub } from '../../src/math4d.js';
import { tesseract, cell16, cell24, cell5, duoprism, cell600, klein, kleinPoint } from '../../src/shapes.js';

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
