// Pure 4D math for the cat page: where a thick object sits in your view, how your hyperplane cuts it, and where the
// TV's screen goes in each view. No three.js here, so it runs in Node (tests/unit/cat.test.js).
import { sub, mm, mv } from '../math4d.js';

// Your display frame as a matrix with rows R, U, −F, A: it takes X − P to scene coordinates (x, y, z) followed by how
// far ana of your slice X is. (−F because the camera looks down −z, as in local() in the explorer.)
export const frameMatrix = V => [...V.R, ...V.U, ...V.F.map(v => -v), ...V.A];

// An object with center C and orientation M (its own axes as columns, in world coordinates) as you see it: G = Q·M
// takes its own coordinates to yours, and `at` is its center in yours.
export function inView(V, C, M) {
  const Q = frameMatrix(V);
  return { G: mm(Q, M), at: mv(Q, sub(C, V.P)) };
}

// Slicing a thickened 3D object (the cat, the TV): its 3D shape times [−h, h] along its own w, as you see it through G
// (row-major 4×4), cut by the hyperplane at `off` ana of its center. A point (p, s) of it lands there when
// a·p + b·s = off, where (a, b) is G's w row; so s = (off − a·p)/b, and the cut shows the shape moved by the 3×3
// linear map L = M − c·aᵀ/b plus a shift c·off/b (M is G's top-left 3×3 and c its w column), clipped to the slab
// |off − a·p| ≤ h·|b|. det L = 1/b, so the cut is a mirror image exactly when b < 0.
// Edge-on (b = 0) the cut is a cross-section of the shape times the thickness. A tiny b gives that limit, still as a
// map plus a slab, so it is drawn the same way: the slab is thin and L stretches it back to the full thickness.
const EDGE = 1e-2;
export function thickSlice(G, h, off = 0) {
  const a = [G[12], G[13], G[14]], c = [G[3], G[7], G[11]];
  const b = Math.abs(G[15]) < EDGE ? (G[15] < 0 ? -EDGE : EDGE) : G[15];
  const L = [0, 1, 2].flatMap(i => [0, 1, 2].map(j => G[i * 4 + j] - c[i] * a[j] / b));
  const shift = c.map(v => v * off / b);
  const na = Math.hypot(...a);
  // Keep n·p + d ≥ 0 for each plane (the three.js convention): a·p ≥ off − h|b| and a·p ≤ off + h|b|. With a = 0 the
  // whole shape is in the slab or none of it is; `empty` says the cut misses the shape.
  const empty = na < 1e-9 && Math.abs(off) > h * Math.abs(b);
  const clip = empty ? [{ n: [0, 0, 0], d: -1 }] : na < 1e-9 ? [] : [
    { n: a.map(v => v / na), d: (h * Math.abs(b) - off) / na },
    { n: a.map(v => -v / na), d: (h * Math.abs(b) + off) / na },
  ];
  return { L, shift, clip, b, empty };
}

// The part of a w × h rectangle (centered, y up) where n·p + d ≥ 0 for each 2D plane { n, d }: a convex polygon,
// counterclockwise, or [] when the planes miss it. Sutherland–Hodgman, one plane at a time.
export function clipRect(w, h, planes) {
  let poly = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  for (const { n, d } of planes) {
    const f = p => n[0] * p[0] + n[1] * p[1] + d, out = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    });
    if (out.length < 3) return [];
    poly = out;
  }
  return poly;
}

// The TV's screen in your view, as a row-major 4×4 taking its own pixels (x right, y up, from its center; z = 0) to
// the scene. scr: { center (in the TV's own coordinates), px (the size of a pixel), w, h (in pixels) }.
// Slice: the thick screen cut at `off`, an affine map, plus `poly`, the pixels inside the slab (see clipRect).
export function screenSlice(G, at, h, off, scr) {
  const s = thickSlice(G, h, off - at[3]), { L, shift } = s, c = scr.center, px = scr.px;
  const Lc = i => L[i * 3] * c[0] + L[i * 3 + 1] * c[1] + L[i * 3 + 2] * c[2];
  const m = [0, 1, 2].flatMap(i => [L[i * 3] * px, L[i * 3 + 1] * px, L[i * 3 + 2] * px, at[i] + shift[i] + Lc(i)]).concat([0, 0, 0, 1]);
  const planes = s.clip.map(({ n, d }) => ({ n: [n[0] * px, n[1] * px], d: n[0] * c[0] + n[1] * c[1] + n[2] * c[2] + d }));
  return { m, poly: clipRect(scr.w, scr.h, planes), b: s.b };
}

// Shadow: the screen's middle layer seen from an eye E ana of the TV's center, X ↦ at + E·r/(E − r_w) with r = G·(p, 0).
// Numerator and denominator are both affine in the pixel coordinates, so this is a projective map: a 4×4 whose bottom
// row is not (0, 0, 0, 1). CSS matrix3d draws it as is.
export function screenShadow(G, at, E, scr) {
  const c = scr.center, px = scr.px, r0 = mv(G, [c[0], c[1], c[2], 0]);
  const col = (r, k) => [E * r[0] + at[0] * k, E * r[1] + at[1] * k, E * r[2] + at[2] * k, k];
  const cols = [[px, 0, 0, 0], [0, px, 0, 0], [0, 0, px, 0]].map(e => { const r = mv(G, e); return col(r, -r[3]); });
  cols.push(col(r0, E - r0[3]));
  const D = E - r0[3];
  return [0, 1, 2, 3].flatMap(i => cols.map(cl => cl[i] / D));
}

// The round cat (model.js): as round in w as it is in 3D. A skin point s with outward normal n sits r deep in its part
// (r: how far in along −n the part's middle is). Turned θ into w it goes around a circle of radius r about that middle
// point, to (s − r(1 − cos θ)·n, r sin θ), for |θ| ≤ 90°. So a ball becomes a 4D ball, a round leg a round 4D tube, and
// the two faces of a slab meet in w along a circle. src: { s, n } (xyz per point, its own coordinates), r (per point)
// and tris (corner indices).
const wrap = t => t - 2 * Math.PI * Math.round(t / (2 * Math.PI));

// Your hyperplane, `off` ana of the cat's center as seen through G, cutting the round cat. A point is on the cut when
// a(s, θ) = g·s − off + r(cos θ − 1)·g·n + r sin θ·g_w = 0 (g, g_w: G's w row). The 4D surface is the skin swept through
// θ, sampled here at the same 2K + 1 steps for every point (θ = k·90°/K, k = −K … K): a skin triangle and one step make a
// prism, and the cut goes through the prisms. Where it crosses a prism's three upright edges and nothing else, the cut
// there is one triangle, so a level cut through the middle (θ = 0) is the skin itself. Anywhere else the prism is split
// into three tetrahedra, each cut along a plane (marching tetrahedra), which follows the cut however it is tilted:
// edge-on it runs along θ, and a round part's cut is drawn around through the steps. Prisms are split the same way on
// both sides of every face (by vertex order), and a face crossed the simple way is cut straight on both sides, so there
// are no cracks. Every vertex lies on the 4D surface: on an upright edge at the exact root of a(θ), elsewhere with its
// skin point, normal, depth and θ taken in proportion, the proportion found by regula falsi on a.
// roundCutter(src, carry) prepares one: carry lists per-skin-point attributes ({ array, size }) to carry onto the cut's
// vertices. output() makes a buffer for one cut; cut(G, off, out) fills it and returns it: pos and nrm (xyz per vertex,
// nrm the cut surface's normal: the 4D normal's part along your slice), w (each vertex's own w, r sin θ, for the
// fur's 4D pattern), each carried attribute, and index (wound to face out), nv vertices and ni indices. Its arrays are replaced by bigger ones when they fill up, and out.grown says so.
export function roundCutter(src, carry, K = 8) {
  const { s, n, r: rad, tris } = src, N = rad.length, L = 2 * K + 1;
  const TH = Float64Array.from({ length: L }, (_, k) => (k - K) * Math.PI / 2 / K), COS = TH.map(Math.cos), SIN = TH.map(Math.sin);
  // each triangle's corners in increasing order, and the ids of its edges ab, bc and ac
  const T = new Uint32Array(tris.length), TE = new Uint32Array(tris.length), ids = new Map();
  let E = 0;
  const edge = (u, v) => { let e = ids.get(u * N + v); if (e === undefined) ids.set(u * N + v, e = E++); return e; };
  for (let t = 0; t < tris.length; t += 3) {
    const c = [tris[t], tris[t + 1], tris[t + 2]].sort((x, y) => x - y);
    T.set(c, t);
    TE[t] = edge(c[0], c[1]); TE[t + 1] = edge(c[1], c[2]); TE[t + 2] = edge(c[0], c[2]);
  }
  // A prism's corners: 0, 1, 2 are its triangle's corners a < b < c at step k, and 3, 4, 5 the same at step k + 1. Each
  // quad face is split from its lower-numbered corner at k to the other at k + 1, which gives these three tetrahedra.
  const TETS = [[0, 1, 2, 5], [0, 1, 4, 5], [0, 3, 4, 5]], EDGE_OF = [[-1, 0, 2], [0, -1, 1], [2, 1, -1]];
  // the vertices made so far in this cut, by edge: upright (point, step), level (edge, step) and slanted (edge, step)
  const [UP, LEVEL, SLANT] = [N * (L - 1), E * L, E * (L - 1)].map(m => ({ id: new Int32Array(m), at: new Uint32Array(m) }));
  // per point, this cut: G·s and G·n (xyz), g·s − off and g·n; and a at every step
  const GS = new Float32Array(3 * N), GN = new Float32Array(3 * N), AS = new Float32Array(N), AN = new Float32Array(N), A = new Float32Array(N * L);
  const GW = new Float32Array(3), SIGN = new Uint32Array(N), V = [0, 0, 0], val = new Float64Array(6), NEG = [0, 0, 0, 0], POS = [0, 0, 0, 0];
  const LAYERS = (1 << (L - 1)) - 1;
  let stamp = 0, out = null, t3 = 0, k = 0, gw = 0;

  function output() {
    const o = { nv: 0, ni: 0, cap: 0, icap: 0, grown: true, pos: null, nrm: null, w: null, carried: carry.map(() => null), index: null };
    grow(o, 2 * N, 4 * tris.length);
    return o;
  }
  function grow(o, cap, icap) {
    const more = (a, m) => { const b = new Float32Array(m); if (a) b.set(a); return b; };
    if (cap > o.cap) {
      o.pos = more(o.pos, 3 * cap); o.nrm = more(o.nrm, 3 * cap); o.w = more(o.w, cap);
      o.carried = carry.map((c, j) => more(o.carried[j], c.size * cap));
      o.cap = cap;
    }
    if (icap > o.icap) { const b = new Uint32Array(icap); if (o.index) b.set(o.index); o.index = b; o.icap = icap; }
    o.grown = true;
  }
  const newVertex = () => { if (out.nv === out.cap) grow(out, 2 * out.cap, out.icap); return out.nv++; };
  // finish vertex v: its normal so far in its nrm slot, made unit length
  const unit = v => { const Q = out.nrm, l = Math.hypot(Q[3 * v], Q[3 * v + 1], Q[3 * v + 2]) || 1; Q[3 * v] /= l; Q[3 * v + 1] /= l; Q[3 * v + 2] /= l; };
  // vertex v's carried attributes, t of the way from skin point i to j (or, not fromSkin, from cut vertex i to j)
  function lerpCarry(v, i, j, t, fromSkin) {
    for (let jj = 0; jj < carry.length; jj++) {
      const C = out.carried[jj], S = fromSkin ? carry[jj].array : C, z = carry[jj].size;
      for (let q = 0; q < z; q++) C[z * v + q] = S[z * i + q] + (S[z * j + q] - S[z * i + q]) * t;
    }
  }
  // point i turned θ, exactly
  function vertexAt(i, th) {
    const v = newVertex(), P = out.pos, Q = out.nrm, r = rad[i], c = Math.cos(th), sn = Math.sin(th);
    for (let q = 0; q < 3; q++) {
      P[3 * v + q] = GS[3 * i + q] + r * ((c - 1) * GN[3 * i + q] + sn * GW[q]);
      Q[3 * v + q] = c * GN[3 * i + q] + sn * GW[q];
    }
    out.w[v] = r * sn;
    unit(v);
    lerpCarry(v, i, i, 0, true);
    return v;
  }
  // On the way from point i at step ki to point j at step kj, where the cut crosses: skin point, normal, depth and θ in
  // proportion t, which regula falsi on a(t) finds from its values fi and fj at the ends.
  const lenAt = (i, j, t) => Math.hypot(n[3 * i] + (n[3 * j] - n[3 * i]) * t, n[3 * i + 1] + (n[3 * j + 1] - n[3 * i + 1]) * t, n[3 * i + 2] + (n[3 * j + 2] - n[3 * i + 2]) * t) || 1;
  const thAt = (ki, kj, t) => TH[ki] + (TH[kj] - TH[ki]) * t;
  function aBetween(i, ki, j, kj, t) {
    const th = thAt(ki, kj, t), r = rad[i] + (rad[j] - rad[i]) * t;
    return AS[i] + (AS[j] - AS[i]) * t + r * ((AN[i] + (AN[j] - AN[i]) * t) / lenAt(i, j, t) * (Math.cos(th) - 1) + gw * Math.sin(th));
  }
  function vertexBetween(i, ki, j, kj, fi, fj) {
    let t0 = 0, t1 = 1, f0 = fi, f1 = fj, t = f0 / (f0 - f1);
    for (let it = 0; it < 2; it++) {
      const f = aBetween(i, ki, j, kj, t);
      if ((f >= 0) === (f0 >= 0)) { t0 = t; f0 = f; } else { t1 = t; f1 = f; }
      if (f0 !== f1) t = t0 + (t1 - t0) * f0 / (f0 - f1);
    }
    const v = newVertex(), P = out.pos, Q = out.nrm, th = thAt(ki, kj, t), c = Math.cos(th), sn = Math.sin(th);
    const ln = lenAt(i, j, t), r = rad[i] + (rad[j] - rad[i]) * t;
    for (let q = 0; q < 3; q++) {
      const gs = GS[3 * i + q] + (GS[3 * j + q] - GS[3 * i + q]) * t, gn = (GN[3 * i + q] + (GN[3 * j + q] - GN[3 * i + q]) * t) / ln;
      P[3 * v + q] = gs + r * ((c - 1) * gn + sn * GW[q]);
      Q[3 * v + q] = c * gn + sn * GW[q];
    }
    out.w[v] = r * sn;
    unit(v);
    lerpCarry(v, i, j, t, true);
    return v;
  }
  // t of the way from vertex a to vertex b of the cut
  function vertexMid(a, b, t) {
    const v = newVertex(), P = out.pos, Q = out.nrm;
    for (let q = 0; q < 3; q++) {
      P[3 * v + q] = P[3 * a + q] + (P[3 * b + q] - P[3 * a + q]) * t;
      Q[3 * v + q] = Q[3 * a + q] + (Q[3 * b + q] - Q[3 * a + q]) * t;
    }
    out.w[v] = out.w[a] + (out.w[b] - out.w[a]) * t;
    unit(v);
    lerpCarry(v, a, b, t, false);
    return v;
  }
  const seen = (key, m) => (key.at[m] === stamp ? key.id[m] : -1);
  const keep = (key, m, v) => { key.at[m] = stamp; key.id[m] = v; return v; };
  // where point i's upright edge from step kk to kk + 1 crosses: a(θ) = A0 + B0 cos θ + C0 sin θ, so θ = φ ± acos(−A0/ρ)
  function upright(i, kk) {
    const m = i * (L - 1) + kk, have = seen(UP, m);
    if (have >= 0) return have;
    const c = i * L + kk, lo = TH[kk], hi = TH[kk + 1], B0 = rad[i] * AN[i], C0 = rad[i] * gw, A0 = AS[i] - B0, rho = Math.hypot(B0, C0);
    let th = lo + (hi - lo) * A[c] / (A[c] - A[c + 1]);   // in proportion, if the roots won't do
    if (rho > 1e-12 && Math.abs(A0) <= rho) {
      const phi = Math.atan2(C0, B0), al = Math.acos(-A0 / rho), e = 1e-6;
      for (const root of [wrap(phi + al), wrap(phi - al)]) if (root >= lo - e && root <= hi + e) { th = root; break; }
    }
    return keep(UP, m, vertexAt(i, th));
  }
  // where the edge between prism corners p and q crosses
  function crossing(p, q) {
    const u = p % 3, w = q % 3;
    if (u === w) return upright(V[u], k);
    const e = TE[t3 + EDGE_OF[u][w]], kp = k + (p >= 3), kq = k + (q >= 3);
    if (kp === kq) {   // level: from the lower-numbered corner
      const m = e * L + kp, have = seen(LEVEL, m);
      if (have >= 0) return have;
      const [lo, hi] = u < w ? [p, q] : [q, p];
      return keep(LEVEL, m, vertexBetween(V[lo % 3], kp, V[hi % 3], kp, val[lo], val[hi]));
    }
    // slanted, from the bottom corner (the lower-numbered one) to the top
    const m = e * (L - 1) + k, have = seen(SLANT, m);
    if (have >= 0) return have;
    const [bot, top] = kp < kq ? [p, q] : [q, p], i = V[bot % 3], j = V[top % 3];
    // a face crossed the simple way (on both upright edges, at this step) is cut straight between those two crossings,
    // as the prism beside it may cut it: snap this vertex onto that line so the two sides meet
    const ci = i * L + k, cj = j * L + k;
    if ((A[ci] >= 0) === (A[cj] >= 0) && (A[ci + 1] >= 0) === (A[cj + 1] >= 0) && (A[ci] >= 0) !== (A[ci + 1] >= 0)) {
      return keep(SLANT, m, vertexMid(upright(i, k), upright(j, k), val[bot] / (val[bot] - val[top])));
    }
    return keep(SLANT, m, vertexBetween(i, k, j, k + 1, val[bot], val[top]));
  }
  // a triangle of the cut, wound so its face points the way its corners' normals do
  function triangle(a, b, c) {
    if (a === b || b === c || a === c) return;
    if (out.ni + 3 > out.icap) grow(out, out.cap, 2 * out.icap);
    const P = out.pos, Q = out.nrm;
    const ex = P[3 * b] - P[3 * a], ey = P[3 * b + 1] - P[3 * a + 1], ez = P[3 * b + 2] - P[3 * a + 2];
    const fx = P[3 * c] - P[3 * a], fy = P[3 * c + 1] - P[3 * a + 1], fz = P[3 * c + 2] - P[3 * a + 2];
    const facing = (ey * fz - ez * fy) * (Q[3 * a] + Q[3 * b] + Q[3 * c]) + (ez * fx - ex * fz) * (Q[3 * a + 1] + Q[3 * b + 1] + Q[3 * c + 1])
      + (ex * fy - ey * fx) * (Q[3 * a + 2] + Q[3 * b + 2] + Q[3 * c + 2]);
    const I = out.index;
    I[out.ni++] = a; I[out.ni++] = facing >= 0 ? b : c; I[out.ni++] = facing >= 0 ? c : b;
  }
  // marching tetrahedra: a plane through the crossings of one of the prism's tetrahedra
  function tetrahedron(tet) {
    let nn = 0, np = 0;
    for (const p of tet) if (val[p] < 0) NEG[nn++] = p; else POS[np++] = p;
    if (!nn || !np) return;
    if (nn === 2) {
      const p = NEG[0], q = NEG[1], r = POS[0], w = POS[1], pr = crossing(p, r), pw = crossing(p, w), qw = crossing(q, w), qr = crossing(q, r);
      triangle(pr, pw, qw); triangle(pr, qw, qr);
      return;
    }
    const [one, rest] = nn === 1 ? [NEG[0], POS] : [POS[0], NEG];
    triangle(crossing(one, rest[0]), crossing(one, rest[1]), crossing(one, rest[2]));
  }

  function cut(G, off, o) {
    out = o; stamp++;
    out.nv = out.ni = 0; out.grown = false;
    const g0 = G[12], g1 = G[13], g2 = G[14];
    gw = G[15];
    for (let q = 0; q < 3; q++) GW[q] = G[4 * q + 3];
    for (let i = 0; i < N; i++) {
      const sx = s[3 * i], sy = s[3 * i + 1], sz = s[3 * i + 2], nx = n[3 * i], ny = n[3 * i + 1], nz = n[3 * i + 2], r = rad[i];
      for (let q = 0; q < 3; q++) {
        GS[3 * i + q] = G[4 * q] * sx + G[4 * q + 1] * sy + G[4 * q + 2] * sz;
        GN[3 * i + q] = G[4 * q] * nx + G[4 * q + 1] * ny + G[4 * q + 2] * nz;
      }
      const as = AS[i] = g0 * sx + g1 * sy + g2 * sz - off, an = AN[i] = g0 * nx + g1 * ny + g2 * nz;
      let sign = 0;   // bit k: ana of your slice at step k
      for (let kk = 0, c = i * L; kk < L; kk++, c++) if ((A[c] = as + r * (an * (COS[kk] - 1) + gw * SIN[kk])) >= 0) sign |= 1 << kk;
      SIGN[i] = sign;
    }
    for (t3 = 0; t3 < T.length; t3 += 3) {
      V[0] = T[t3]; V[1] = T[t3 + 1]; V[2] = T[t3 + 2];
      // the steps whose prism has corners on both sides: not all ana (every corner's bit set at k and k + 1) and not all kata
      const all = SIGN[V[0]] & SIGN[V[1]] & SIGN[V[2]], any = SIGN[V[0]] | SIGN[V[1]] | SIGN[V[2]];
      for (let layers = ~(all & (all >>> 1)) & (any | (any >>> 1)) & LAYERS; layers; layers &= layers - 1) {
        k = 31 - Math.clz32(layers & -layers);
        let pos = 0;
        for (let p = 0; p < 6; p++) if ((val[p] = A[V[p % 3] * L + k + (p >= 3)]) >= 0) pos |= 1 << p;
        if (pos === 7 || pos === 56) { triangle(upright(V[0], k), upright(V[1], k), upright(V[2], k)); continue; }   // the simple way
        for (const tet of TETS) tetrahedron(tet);
      }
    }
    return out;
  }
  return { output, cut };
}

// How far the round cat reaches along your ana, from its center as seen through G: [lo, hi]. Each skin point sweeps
// a(θ) = g·s − r g·n + B cos θ + C sin θ (B = r g·n, C = r g_w) over |θ| ≤ 90°, whose extremes are where θ = φ (most)
// or φ + π (least) if those are in range, else at the ends, where it is ±C.
export function roundRange(G, src) {
  const { s, n, r: rad } = src, g0 = G[12], g1 = G[13], g2 = G[14], gw = G[15];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < rad.length; i++) {
    const r = rad[i], gn = g0 * n[3 * i] + g1 * n[3 * i + 1] + g2 * n[3 * i + 2], B = r * gn, C = r * gw;
    const base = g0 * s[3 * i] + g1 * s[3 * i + 1] + g2 * s[3 * i + 2] - B, rho = Math.hypot(B, C);
    const most = B >= 0 ? rho : Math.abs(C), least = B <= 0 ? -rho : -Math.abs(C);   // φ is within ±90° exactly when B ≥ 0
    if (base + most > hi) hi = base + most;
    if (base + least < lo) lo = base + least;
  }
  return [lo, hi];
}

// One layer of the round cat, at w: each skin point where it is at that w (xyzw), for the points whose part reaches it
// (r ≥ |w|); the rest stop at their part's middle, at w = ±r.
export function roundLayer(src, w) {
  const { s, n, r: rad } = src, N = rad.length, p = new Float32Array(4 * N);
  for (let i = 0; i < N; i++) {
    const r = rad[i], wi = Math.max(-r, Math.min(r, w)), d = r - Math.sqrt(Math.max(0, r * r - wi * wi));
    for (let q = 0; q < 3; q++) p[4 * i + q] = s[3 * i + q] - d * n[3 * i + q];
    p[4 * i + 3] = wi;
  }
  return p;
}
