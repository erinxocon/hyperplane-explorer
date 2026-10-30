import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCat, HEIGHT, PART, LAND } from '../../src/cat/model.js';

const g = buildCat(), pos = g.getAttribute('catPos'), part = g.getAttribute('part'), region = g.getAttribute('region'), ix = g.index.array;
const furVerts = [...Array(pos.count).keys()].filter(i => part.getX(i) === PART.FUR);

test('the fur is closed and wound one way: every edge is crossed once in each direction', () => {
  // Slice draws the cut faces from the inside of the surface, so a hole or a flipped triangle would show
  const edges = new Map(), key = (a, b) => a * pos.count + b;
  let tris = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
    if (part.getX(a) !== PART.FUR) continue;
    tris++;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(key(u, v), (edges.get(key(u, v)) || 0) + 1);
  }
  assert.ok(tris > 1000);
  for (const [k, n] of edges) assert.equal(edges.get(key(k % pos.count, Math.floor(k / pos.count))), n);
});

test('feet on y = −HEIGHT/2, the whole cat within ±HEIGHT/2', () => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) { lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
  assert.ok(Math.abs(lo + HEIGHT / 2) < 0.01, `feet at ${lo}`);
  assert.ok(hi < HEIGHT / 2, `top at ${hi}`);
  assert.equal(LAND.feet, -HEIGHT / 2);
});

test('region weights are between 0 and 1 and leave the body the rest', () => {
  for (const i of furVerts) {
    const w = [region.getX(i), region.getY(i), region.getZ(i), region.getW(i)], sum = w.reduce((a, b) => a + b);
    assert.ok(w.every(v => v >= 0 && v <= 1) && sum <= 1 + 1e-6, `vertex ${i}: ${w}`);
  }
});

test('the tail curls to its right (−x), so a mirror image shows', () => {
  const tip = furVerts.filter(i => region.getZ(i) > 0.9 && g.getAttribute('anchor').getX(i) > 0.8);
  assert.ok(tip.length > 10);
  assert.ok(tip.every(i => pos.getX(i) < 0));
});

test('small enough for Shadow, which projects every vertex each frame', () => {
  assert.ok(pos.count < 25000, `${pos.count} vertices`);
});
