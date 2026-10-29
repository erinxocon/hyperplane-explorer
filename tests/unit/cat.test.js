import test from 'node:test';
import assert from 'node:assert/strict';
import { rot, mm, mv, ident } from '../../src/math4d.js';
import { thickSlice, inView, clipRect, screenSlice, screenShadow } from '../../src/cat/slice4d.js';

const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// apply a row-major 4×4 to the pixel (x, y), with the perspective divide
const apply = (m, x, y) => { const v = mv(m, [x, y, 0, 1]); return v.slice(0, 3).map(c => c / v[3]); };

test('unturned, the slice is the whole shape, unchanged', () => {
  const s = thickSlice(ident(), 0.25);
  s.L.forEach((v, i) => near(v, i % 4 === 0 ? 1 : 0));
  assert.deepEqual(s.clip, []);
});

test('turned through w by θ: stretched by 1/cos θ along x, cut to |x| ≤ h·cot θ, mirrored past 90°', () => {
  for (const th of [0.4, 1.2, 2.2]) {
    const s = thickSlice(rot(0, 3, th), 0.25);
    near(s.L[0], 1 / Math.cos(th));
    near(s.clip[0].d, 0.25 * Math.abs(Math.cos(th)) / Math.sin(th));
    assert.equal(det3(s.L) < 0, th > Math.PI / 2);
  }
});

test('edge-on, the cut is the cross-section at x = off drawn the full thickness wide', () => {
  const h = 0.25, off = 0.3, s = thickSlice(rot(0, 3, Math.PI / 2), h, off);
  // the slab keeps a thin layer around x = off ...
  near(-s.clip[0].d / s.clip[0].n[0], off - h * s.b);
  near(s.clip[1].d / -s.clip[1].n[0], off + h * s.b);
  // ... and the map spreads that layer over the thickness: x = off ± h·b lands at ±h
  near(s.L[0] * (off + h * s.b) + s.shift[0], h, 1e-6);
  near(s.L[0] * (off - h * s.b) + s.shift[0], -h, 1e-6);
});

test('a slab that misses an unturned shape is empty', () => {
  assert.equal(thickSlice(ident(), 0.25, 0.2).empty, false);
  assert.equal(thickSlice(ident(), 0.25, 0.3).empty, true);
});

test('det L = 1/b for any turn, and a parallel cut is shifted along the turned w axis', () => {
  const R = mm(mm(rot(0, 3, 0.7), rot(1, 2, 0.4)), rot(1, 3, -0.5));
  const s = thickSlice(R, 0.3, 0.1);
  near(det3(s.L), 1 / R[15]);
  [R[3], R[7], R[11]].forEach((c, i) => near(s.shift[i], c * 0.1 / R[15]));
});

test('inView: an object straight ahead, seen from the start, sits at scene −z with its own axes as yours', () => {
  const V = { P: [0, 0, 0, 0], R: [1, 0, 0, 0], U: [0, 1, 0, 0], F: [0, 0, 1, 0], A: [0, 0, 0, 1] };
  const B = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];   // facing you: its +z is world −z
  const { G, at } = inView(V, [1, 2, 5, 0.5], B);
  assert.deepEqual(at, [1, 2, -5, 0.5]);
  G.forEach((v, i) => near(v, ident()[i]));
});

test('clipRect keeps the part of a rectangle inside a slab', () => {
  assert.equal(clipRect(4, 2, [{ n: [1, 0], d: -3 }]).length, 0);         // x ≥ 3 misses it
  assert.equal(clipRect(4, 2, [{ n: [1, 0], d: 5 }]).length, 4);          // x ≥ −5 keeps it all
  const strip = clipRect(4, 2, [{ n: [1, 0], d: 0.5 }, { n: [-1, 0], d: 0.5 }]);   // |x| ≤ 0.5
  assert.equal(strip.length, 4);
  for (const [x, y] of strip) { assert.ok(Math.abs(x) <= 0.5 + 1e-12); assert.ok(Math.abs(y) <= 1 + 1e-12); }
});

test('the screen in Slice: level, all of it at its place; swung into ana, a band of it', () => {
  const scr = { center: [0, 0.1, 0.4], px: 0.01, w: 640, h: 360 };
  const flat = screenSlice(ident(), [0, 1, -8, 0], 0.7, 0, scr);
  assert.equal(flat.poly.length, 4);
  const c = apply(flat.m, 0, 0), corner = apply(flat.m, 320, 180);
  [0, 1.1, -7.6].forEach((v, i) => near(c[i], v));
  [3.2, 2.9, -7.6].forEach((v, i) => near(corner[i], v));
  const swung = screenSlice(rot(0, 3, 1.2), [0, 1, -8, 0], 0.7, 0, scr);   // x tipped into ana
  const xs = swung.poly.map(p => p[0]);
  near(Math.max(...xs) - Math.min(...xs), 2 * 0.7 / Math.tan(1.2) / scr.px, 1e-6);   // a band 2h·cot θ wide
  assert.equal(screenSlice(ident(), [0, 1, -8, 2], 0.7, 0, scr).poly.length, 0);  // the TV is 2 ana of you: no screen
});

test('the screen in Shadow: the projective matrix agrees with projecting each point from the eye', () => {
  const G = mm(mm(rot(0, 3, 0.5), rot(2, 3, -0.3)), rot(0, 2, 0.8)), at = [0.5, 1, -9, 0.4], E = 4.5;
  const scr = { center: [0, 0.1, 0.4], px: 0.006, w: 640, h: 360 }, m = screenShadow(G, at, E, scr);
  for (const [x, y] of [[0, 0], [320, 180], [-320, 120], [200, -180]]) {
    const r = mv(G, [scr.center[0] + x * scr.px, scr.center[1] + y * scr.px, scr.center[2], 0]), k = E / (E - r[3]);
    apply(m, x, y).forEach((v, i) => near(v, at[i] + r[i] * k));
  }
});
