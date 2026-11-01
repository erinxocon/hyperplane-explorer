// The cat from the OIIA OIIA meme: Ethel, a chubby grey-brown tabby on short legs, standing on all four and facing
// you. Her fur is one closed surface: a signed distance field of ellipsoids, round cones, cupped triangular ears and a
// tapered tail, blended with smooth minimums so neck, legs and tail grow out of the body without seams, and meshed by
// surface nets. Eyes, nose and whiskers are small separate meshes set into it.
// Each vertex carries what the fur shader (fur.js) paints from: `part` (fur, eye, nose or whisker), `region` (for
// fur, how much of it is head, leg, tail and inner ear; the rest is body, and the weights blend across the joins),
// `anchor` (an eye's or the nose's center; for fur, x is how far along the tail), `catPos` (its own position, kept
// when a slice or Shadow moves `position`) and `shade` (Shadow's depth tint; none here). LAND gives the shader its
// landmarks. `depth` is for the 4D rounding (main.js): how far in along its normal the vertex's part is thickest.
// It faces +z with y up and its left side toward +x, centered front to back and on its middle height, so 4D turns
// spin it in place; its feet are at y = −HEIGHT / 2. Two things are only on one side, so a mirror image is easy to
// spot: its tail curls to its right, and its left front paw has a white sock.
// In 4D the cat is as round in w as it is in 3D: each skin point turns into w around a circle about the middle of its
// part, `depth` in, so a ball becomes a 4D ball and a round leg a round 4D tube (slice4d.js does the cutting). Its body
// reaches about ±0.57 along w, its head ±0.33, its legs ±0.12, its ears ±0.04 and its whiskers hardly at all.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HEIGHT = 2;
export const PART = { FUR: 0, EYE: 1, NOSE: 2, WHISKER: 3 };
const SC = 1.12;      // design units (feet at y = 0) to cat units
const STEP = 0.025;   // the surface-nets grid, in design units

/* ---------- the shape, in design units: feet at y = 0, nose toward +z, its left toward +x ---------- */
const BODY = { chest: [[0, 0.66, 0.34], [0.4, 0.38, 0.46]], rump: [[0, 0.68, -0.4], [0.45, 0.42, 0.52]], belly: [[0, 0.56, -0.04], [0.42, 0.3, 0.56]] };
const HEAD = [0, 1.2, 0.8], SKULL = [0.33, 0.29, 0.29];
const EYE_XY = [0.118, 1.225], EYE_R = [0.078, 0.074, 0.06];
const LEGS = [   // top, foot, radii; front legs first, its left (+x) before its right
  [[0.22, 0.55, 0.42], [0.21, 0.09, 0.47], 0.105, 0.09], [[-0.22, 0.55, 0.42], [-0.21, 0.09, 0.47], 0.105, 0.09],
  [[0.27, 0.45, -0.64], [0.26, 0.09, -0.58], 0.1, 0.09], [[-0.27, 0.45, -0.64], [-0.26, 0.09, -0.58], 0.1, 0.09],
];
const TAIL = new THREE.CatmullRomCurve3([[0, 0.8, -0.84], [-0.02, 0.97, -1.08], [-0.1, 1.27, -1.2], [-0.28, 1.56, -1.15], [-0.46, 1.68, -0.97]].map(p => new THREE.Vector3(...p)));
// from the back of its rump to the front of its muzzle, the middle front to back
const ZC = (BODY.rump[0][2] - BODY.rump[1][2] + HEAD[2] + 0.335) / 2;
const at = p => [p[0] * SC, p[1] * SC - HEIGHT / 2, (p[2] - ZC) * SC];   // design units to cat units

export const LAND = {
  head: at(HEAD), headR: SKULL.map(r => r * SC), eyeR: EYE_R[0] * SC,
  bodyY: at(BODY.chest[0])[1], backY: at([0, 1.06, 0])[1], chest: at([0, 0.8, 0.7]),
  legSplit: at([0, 0, 0])[2], feet: -HEIGHT / 2, toe: 0.09 * SC, sock: 0.2 * SC,
};

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid([cx, cy, cz], [rx, ry, rz]) {   // a close (iq) distance estimate
  return (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / rx, py / ry, pz / rz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  };
}
function roundCone(a, b, ra, rb) {   // a segment whose radius runs from ra to rb
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz;
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2], h = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / bb));
    return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
  };
}
// unsigned distance to the triangle abc (iq), for the ears
function triangle(a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const ba = sub(b, a), cb = sub(c, b), ac = sub(a, c), nor = cross(ba, ac);
  const e = [[a, ba, cross(ba, nor)], [b, cb, cross(cb, nor)], [c, ac, cross(ac, nor)]].map(([o, d, s]) => [o, d, s, dot(d, d)]), nn = dot(nor, nor);
  return (x, y, z) => {
    let inside = 0, best = Infinity;
    for (const [o, d, s, dd] of e) {
      const px = x - o[0], py = y - o[1], pz = z - o[2];
      inside += Math.sign(s[0] * px + s[1] * py + s[2] * pz);
      const h = Math.min(1, Math.max(0, (d[0] * px + d[1] * py + d[2] * pz) / dd));
      best = Math.min(best, (d[0] * h - px) ** 2 + (d[1] * h - py) ** 2 + (d[2] * h - pz) ** 2);
    }
    if (inside >= 2) { const q = nor[0] * (x - a[0]) + nor[1] * (y - a[1]) + nor[2] * (z - a[2]); return Math.sqrt(q * q / nn); }
    return Math.sqrt(best);
  };
}
// skip a piece far from p: |p − c| − R is never more than its distance, and far from every join it doesn't matter
const near = (c, R, f) => (x, y, z) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) - R; return d > 0.3 ? d : f(x, y, z); };

// An ear: two triangles hinged along the middle, so it cups forward, thick at the base and thin at the tip. The
// inside is carved out of its front; `cup` is how far a point is from that hollow, which the shader paints pink.
function ear(s) {
  const P = (dx, dy, dz) => [HEAD[0] + dx * s, HEAD[1] + dy, HEAD[2] + dz];
  const L = P(0.07, 0.2, 0.02), M = P(0.2, 0.2, -0.05), R = P(0.33, 0.12, -0.04), T = P(0.29, 0.47, -0.07);
  const tri = (a, b, c) => triangle(a, b, c), base = [tri(L, M, T), tri(M, R, T)];
  const toward = (p, k) => [p[0] + (T[0] - p[0]) * k, p[1] + (T[1] - p[1]) * k + 0.02, p[2] + (T[2] - p[2]) * k + 0.045];
  const hollow = [tri(toward(L, 0.16), toward(M, 0.12), toward(T, 0.1)), tri(toward(M, 0.12), toward(R, 0.16), toward(T, 0.1))];
  const thick = y => 0.036 - 0.016 * Math.min(1, Math.max(0, (y - L[1]) / (T[1] - L[1])));
  const c = [(L[0] + R[0] + T[0]) / 3, (L[1] + R[1] + T[1]) / 3, (L[2] + R[2] + T[2]) / 3];
  return near(c, 0.3, (x, y, z) => {
    const outer = Math.min(base[0](x, y, z), base[1](x, y, z)) - thick(y);
    const cup = Math.min(hollow[0](x, y, z), hollow[1](x, y, z)) - thick(y) * 0.75;
    return [smax(outer, -cup, 0.015), cup];
  });
}

const chest = ellipsoid(...BODY.chest), rump = ellipsoid(...BODY.rump), belly = ellipsoid(...BODY.belly);
const neck = roundCone([0, 0.84, 0.48], [0, 1.08, 0.72], 0.25, 0.23);
const haunch = [1, -1].map(s => ellipsoid([0.25 * s, 0.6, -0.54], [0.2, 0.28, 0.3]));
const skull = ellipsoid(HEAD, SKULL);
const face = [
  ...[1, -1].map(s => [ellipsoid([HEAD[0] + 0.13 * s, HEAD[1] - 0.08, HEAD[2] + 0.08], [0.21, 0.17, 0.19]), 0.1]),     // cheeks
  ...[1, -1].map(s => [ellipsoid([HEAD[0] + 0.12 * s, HEAD[1] + 0.105, HEAD[2] + 0.19], [0.1, 0.05, 0.08]), 0.06]),   // brows
  [ellipsoid([HEAD[0], HEAD[1] - 0.03, HEAD[2] + 0.23], [0.065, 0.075, 0.08]), 0.08],                                 // bridge
  ...[1, -1].map(s => [ellipsoid([HEAD[0] + 0.055 * s, HEAD[1] - 0.125, HEAD[2] + 0.255], [0.08, 0.065, 0.075]), 0.05]), // muzzle
  [ellipsoid([HEAD[0], HEAD[1] - 0.2, HEAD[2] + 0.215], [0.07, 0.05, 0.065]), 0.05],                                  // chin
];
const ears = [ear(1), ear(-1)];
// each leg and its paw
const legs = LEGS.map(([top, foot, ra, rb]) => {
  const shin = roundCone(top, foot, ra, rb), paw = ellipsoid([foot[0], 0.055, foot[2] + 0.06], [rb + 0.012, 0.062, rb + 0.04]);
  return near([(top[0] + foot[0]) / 2, 0.3, (top[2] + foot[2]) / 2], 0.36, (x, y, z) => smin(shin(x, y, z), paw(x, y, z), 0.06));
});
const TAIL_N = 40, tailPts = TAIL.getSpacedPoints(TAIL_N).map(v => v.toArray()), tailR = t => 0.085 - 0.035 * t;
const tailSegs = tailPts.slice(1).map((b, i) => roundCone(tailPts[i], b, tailR(i / TAIL_N), tailR((i + 1) / TAIL_N)));

// The whole field. With `out`, also each region's own distance (for the shader's weights) and the tail parameter.
function cat(x, y, z, out) {
  let body = smin(smin(chest(x, y, z), rump(x, y, z), 0.25), belly(x, y, z), 0.2);
  body = smin(smin(body, haunch[0](x, y, z), 0.12), haunch[1](x, y, z), 0.12);
  body = smin(body, neck(x, y, z), 0.18);
  let head = Math.hypot(x - HEAD[0], y - HEAD[1] - 0.12, z - HEAD[2]) - 0.5, cup = Infinity;
  if (head < 0.3) {
    head = skull(x, y, z);
    for (const [f, k] of face) head = smin(head, f(x, y, z), k);
    for (const e of ears) { const r = e(x, y, z); if (typeof r === 'number') { head = smin(head, r, 0.06); continue; } head = smin(head, r[0], 0.06); cup = Math.min(cup, r[1]); }
  }
  let leg = Infinity;
  for (const l of legs) leg = Math.min(leg, l(x, y, z));
  let tail = Infinity, ti = 0;
  if (Math.hypot(x + 0.2, y - 1.25, z + 1.05) < 0.95) for (let i = 0; i < TAIL_N; i++) { const d = tailSegs[i](x, y, z); if (d < tail) { tail = d; ti = i; } }
  else tail = Math.hypot(x + 0.2, y - 1.25, z + 1.05) - 0.65;
  let d = smin(smin(smin(body, head, 0.16), leg, 0.1), tail, 0.07);
  d = smax(d, -y, 0.03);   // flat soles
  if (out) Object.assign(out, { body, head, leg, tail, cup, t: ti / TAIL_N });
  return d;
}

// How deep a surface point sits in its part: how far in along the normal the field keeps falling at full rate, that is
// how far that normal still leads back to this point as the nearest on the surface (for a ball, its center; for a limb,
// its axis). Rounding the cat into w pushes its skin inward along the normals, and a point can go no farther than this.
const DSTEP = 0.02;
function depthIn(f, x, y, z, nx, ny, nz) {
  let t = 0, g = -f(x, y, z);
  while (t < 0.7) {
    const next = -f(x - nx * (t + DSTEP), y - ny * (t + DSTEP), z - nz * (t + DSTEP));
    if (next - g < 0.5 * DSTEP) return t + DSTEP / 2;   // falling at less than half rate: past the middle
    t += DSTEP; g = next;
  }
  return t;
}

/* ---------- surface nets ---------- */
// Samples f on a grid from lo, n[i] nodes along axis i, one vertex per cell the surface crosses (the mean of its edge
// crossings, then pulled onto the surface), one quad per crossed grid edge. Closed when f > 0 on the grid's border.
function surfaceNets(f, lo, n) {
  const [nx, ny, nz] = n, V = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  // first every 4th node: a block of 4×4×4 cells whose corners are all well away from the surface needs no more
  const B = 4, far = 1.1 * B * STEP * Math.sqrt(3), [bx, by, bz] = n.map(m => Math.ceil((m - 1) / B) + 1), C = new Float32Array(bx * by * bz);
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) C[i + bx * (j + by * k)] = f(lo[0] + i * B * STEP, lo[1] + j * B * STEP, lo[2] + k * B * STEP);
  const skip = (i, j, k) => {   // the sign of the block's field if it is clear of the surface, else 0
    let s = 0;
    for (let b = 0; b < 8; b++) {
      const v = C[i + (b & 1) + bx * (j + (b >> 1 & 1) + by * (k + (b >> 2)))];
      if (Math.abs(v) < far || (s && Math.sign(v) !== s)) return 0;
      s = Math.sign(v);
    }
    return s;
  };
  for (let K = 0; K < bz - 1; K++) for (let J = 0; J < by - 1; J++) for (let I = 0; I < bx - 1; I++) {
    const s = skip(I, J, K);
    const end = (m, b, last) => Math.min(m - 1, b * B + B - (b < last ? 1 : 0));   // a block owns its far face only at the end
    for (let k = K * B; k <= end(nz, K, bz - 2); k++) for (let j = J * B; j <= end(ny, J, by - 2); j++) for (let i = I * B; i <= end(nx, I, bx - 2); i++)
      V[id(i, j, k)] = s ? s * far : f(lo[0] + i * STEP, lo[1] + j * STEP, lo[2] + k * STEP);
  }
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k), cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const pos = [], c = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let b = 0; b < 8; b++) { c[b] = V[id(i + (b & 1), j + (b >> 1 & 1), k + (b >> 2))]; if (c[b] < 0) mask |= 1 << b; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of EDGES) {
      if ((c[a] < 0) === (c[b] < 0)) continue;
      const t = c[a] / (c[a] - c[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; m++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / m) * STEP, lo[1] + (j + sy / m) * STEP, lo[2] + (k + sz / m) * STEP);
  }
  const index = [], quad = (a, b, cc, d, flip) => {
    if (flip) [b, d] = [d, b];
    const d2 = (p, q) => (pos[3 * p] - pos[3 * q]) ** 2 + (pos[3 * p + 1] - pos[3 * q + 1]) ** 2 + (pos[3 * p + 2] - pos[3 * q + 2]) ** 2;
    if (d2(a, cc) < d2(b, d)) index.push(a, b, cc, a, cc, d); else index.push(a, b, d, b, cc, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v = V[id(i, j, k)] < 0;
    // each grid edge from (i, j, k) along x, y, z, and the four cells around it, counterclockwise seen from its +end
    if (v !== V[id(i + 1, j, k)] < 0) quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)], !v);
    if (v !== V[id(i, j + 1, k)] < 0) quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], cell[cid(i, j, k - 1)], !v);
    if (v !== V[id(i, j, k + 1)] < 0) quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)], !v);
  }
  // pull each vertex onto the surface along the gradient (from four samples on a tetrahedron)
  const e = STEP / 2, T = [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]];
  for (let p = 0; p < pos.length; p += 3) {
    const x = pos[p], y = pos[p + 1], z = pos[p + 2];
    let gx = 0, gy = 0, gz = 0, d = 0;
    for (const [a, b, c] of T) { const v = f(x + a * e, y + b * e, z + c * e); gx += a * v; gy += b * v; gz += c * v; d += v / 4; }
    const gl = Math.hypot(gx, gy, gz) || 1, s = Math.max(-STEP, Math.min(STEP, d * 4 * e / gl));   // |∇f| = |g| / 4e
    pos[p] = x - gx / gl * s; pos[p + 1] = y - gy / gl * s; pos[p + 2] = z - gz / gl * s;
  }
  return { pos, index };
}

// where a ray from the front at (x, y) first meets the fur
function front(x, y) {
  let z = 2;
  for (let i = 0; i < 200 && z > 0; i++) { const d = cat(x, y, z); if (d < 1e-4) break; z -= Math.max(d, 1e-3); }
  return z;
}

// the left eye's center, bulging a little out of the face
const EYE = [...EYE_XY, front(...EYE_XY) - EYE_R[2] * 0.4];
LAND.eye = at(EYE);

export function buildCat() {
  const parts = [];
  // tag a piece built in design units, then move it into cat units; `field` is its own distance field, for `depth`,
  // or a number for a piece too thin to need one
  const add = (geo, part, field, anchor = [0, 0, 0], region = [0, 0, 0, 0]) => {
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    const n = geo.getAttribute('position').count, P = geo.getAttribute('position'), N = geo.getAttribute('normal');
    const depth = Array.from({ length: n }, (_, i) => SC * (typeof field === 'number' ? field
      : depthIn(field, P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i))));
    geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
    geo.scale(SC, SC, SC).translate(0, -HEIGHT / 2, -ZC * SC);
    geo.setAttribute('part', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    const anc = typeof anchor === 'function' ? anchor : () => anchor, reg = typeof region === 'function' ? region : () => region;
    geo.setAttribute('anchor', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, i) => anc(i)).flat(), 3));
    geo.setAttribute('region', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, i) => reg(i)).flat(), 4));
    parts.push(geo);
  };
  const ball = (seg = 24, rings = 16) => new THREE.SphereGeometry(1, seg, rings);
  const sides = f => { f(1); f(-1); };   // its left (+x) and its right (−x)

  // the fur
  const lo = [-0.62, -0.06, -1.32], hi = [0.62, 1.82, 1.2];
  const { pos, index } = surfaceNets(cat, lo, lo.map((l, i) => Math.ceil((hi[i] - l) / STEP) + 1));
  const fur = new THREE.BufferGeometry();
  fur.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fur.setIndex(index);
  fur.computeVertexNormals();   // as Shadow does, so the ears' thin edges shade the same in every view
  // each region's weight falls off with how much farther it is than the nearest one; the hollow of an ear, which is
  // also on the head, by how far it is from the hollow
  const o = {}, reg = [], tt = [], W = 0.035;
  for (let p = 0; p < pos.length; p += 3) {
    cat(pos[p], pos[p + 1], pos[p + 2], o);
    const ds = [o.body, o.head, o.leg, o.tail], m = Math.min(...ds), w = ds.map(d => Math.exp(-(d - m) / W));
    const sum = w.reduce((a, b) => a + b), inner = Math.exp(-Math.max(o.cup, 0) / 0.01), rest = (1 - inner) / sum;
    reg.push(w[1] * rest, w[2] * rest, w[3] * rest, inner);
    tt.push([o.t, 0, 0]);
  }
  add(fur, PART.FUR, (x, y, z) => cat(x, y, z), i => tt[i], i => reg.slice(4 * i, 4 * i + 4));

  // eyes, bulging a little out of the face, and a nose on the bridge of the muzzle
  sides(s => {
    const c = [EYE[0] * s, EYE[1], EYE[2]], g = ball(28, 20).scale(...EYE_R), eye = ellipsoid([0, 0, 0], EYE_R);
    const cs = Math.cos(0.3 * s), sn = Math.sin(0.3 * s);   // turned 0.3 about y: undo that to measure in its own frame
    g.rotateY(0.3 * s).translate(...c);
    add(g, PART.EYE, (x, y, z) => { const dx = x - c[0], dz = z - c[2]; return eye(dx * cs - dz * sn, y - c[1], dx * sn + dz * cs); }, at(c));
  });
  const ny = HEAD[1] - 0.06, nose = [0, ny, front(0, ny) - 0.012], NOSE_R = [0.048, 0.03, 0.03];
  add(new THREE.SphereGeometry(1, 20, 14).scale(...NOSE_R).translate(...nose), PART.NOSE, ellipsoid(nose, NOSE_R), at(nose));
  // whiskers, from the muzzle pads, drooping a little
  sides(s => [-0.02, 0.012, 0.042].forEach((dy, i) => {
    const y0 = HEAD[1] - 0.115 + dy * 0.5, a = new THREE.Vector3(0.1 * s, y0, front(0.1 * s, y0) - 0.01);
    const b = new THREE.Vector3(0.42 * s, y0 + dy * 2.4 - 0.03, a.z - 0.1 - i * 0.04);
    const g = new THREE.CylinderGeometry(0.0022, 0.004, a.distanceTo(b), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    add(g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()), PART.WHISKER, 0.003);
  }));

  const g = mergeBufferGeometries(parts);
  g.setAttribute('catPos', g.getAttribute('position').clone());
  g.setAttribute('shade', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill([0, 0, 0, 1]).flat(), 4));
  g.computeBoundingSphere();
  return g;
}
