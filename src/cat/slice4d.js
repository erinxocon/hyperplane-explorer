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
