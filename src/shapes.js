import { sub, dot } from './math4d.js';

// Regular and uniform 4-polytopes as { verts, edges }, centered at the origin.
export function tesseract() {
  const verts = [], edges = [];
  for (let i = 0; i < 16; i++) verts.push([0,1,2,3].map(b => (i >> b & 1) ? 1 : -1));
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
  return { verts, edges };
}
export function cell16() {
  const verts = [], edges = [];
  for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0,0,0,0]; v[a] = s; verts.push(v); }
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if ((i >> 1) !== (j >> 1)) edges.push([i, j]);
  return { verts, edges };
}
export function cell24() {
  const verts = [], edges = [];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const sa of [1, -1]) for (const sb of [1, -1]) { const v = [0,0,0,0]; v[a] = sa; v[b] = sb; verts.push(v); }
  for (let i = 0; i < 24; i++) for (let j = i + 1; j < 24; j++) { const d = sub(verts[i], verts[j]); if (Math.abs(dot(d, d) - 2) < 1e-9) edges.push([i, j]); }
  return { verts, edges };
}
export function cell5() {
  const a = 1 / Math.sqrt(10), b = 1 / Math.sqrt(6), c = 1 / Math.sqrt(3);
  const verts = [[a, b, c, 1], [a, b, c, -1], [a, b, -2 * c, 0], [a, -Math.sqrt(1.5), 0, 0], [-2 * Math.sqrt(0.4), 0, 0, 0]];
  const edges = []; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) edges.push([i, j]);
  return { verts, edges };
}
export function duoprism(p, q) {
  const verts = [], edges = [], id = (i, j) => i * q + j;
  for (let i = 0; i < p; i++) for (let j = 0; j < q; j++) {
    const s = 2 * Math.PI * i / p, t = 2 * Math.PI * j / q;
    verts.push([Math.cos(s), Math.sin(s), Math.cos(t), Math.sin(t)]);
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < q; j++) { edges.push([id(i, j), id((i + 1) % p, j)]); edges.push([id(i, j), id(i, (j + 1) % q)]); }
  return { verts, edges };
}
export function cell600() {
  // 120 vertices on the unit 3-sphere: 8 axis points, 16 of (±1/2)^4, and 96 even permutations of (±phi, ±1, ±1/phi, 0)/2.
  const phi = (1 + Math.sqrt(5)) / 2, verts = [];
  for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0,0,0,0]; v[a] = s; verts.push(v); }
  for (let i = 0; i < 16; i++) verts.push([0,1,2,3].map(b => (i >> b & 1) ? 0.5 : -0.5));
  const base = [phi / 2, 0.5, 1 / (2 * phi), 0];
  const even = [[0,1,2,3],[0,2,3,1],[0,3,1,2],[1,0,3,2],[1,2,0,3],[1,3,2,0],[2,0,1,3],[2,1,3,0],[2,3,0,1],[3,0,2,1],[3,1,0,2],[3,2,1,0]];
  for (const p of even) for (let m = 0; m < 8; m++) {
    const v = [0,0,0,0];
    for (let k = 0; k < 3; k++) v[p[k]] = base[k] * (m >> k & 1 ? -1 : 1);
    verts.push(v);
  }
  const edges = [], e2 = 1 / (phi * phi);
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) { const d = sub(verts[i], verts[j]); if (Math.abs(dot(d, d) - e2) < 1e-9) edges.push([i, j]); }
  return { verts, edges };
}

// Klein bottle embedded in R^4: a ring of radius R in the x–z plane whose tube circle (radius r) spans the
// radial direction and cos(u/2)·y + sin(u/2)·w. Going once around, the tube turns half a turn through w and
// comes back flipped, so (u + 2pi, v) is the same point as (u, -v). Nothing passes through itself.
export const kleinPoint = (u, v, R = 1, r = 0.4) => {
  const k = R + r * Math.cos(v), s = r * Math.sin(v);
  return [k * Math.cos(u), s * Math.cos(u / 2), k * Math.sin(u), s * Math.sin(u / 2)];
};
// A closed triangle mesh of it: verts are the nu*nv distinct points; tris index them with the seams glued,
// including the flip. grid[i*(nv+1)+j] is the vertex at (u, v) = (2pi i/nu, 2pi j/nv) for i <= nu, j <= nv.
export function klein(nu = 96, nv = 32, R = 1, r = 0.4) {
  const verts = [], tris = [], grid = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) verts.push(kleinPoint(2 * Math.PI * i / nu, 2 * Math.PI * j / nv, R, r));
  const id = (i, j) => i === nu ? ((nv - j) % nv) : i * nv + j % nv;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) grid.push(id(i, j));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    tris.push([a, b, c], [a, c, d]);
  }
  return { verts, tris, grid, nu, nv };
}
