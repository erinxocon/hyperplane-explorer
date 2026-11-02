// What the explorer's shapes share for drawing (see CLAUDE.md, "Core model"): scene coordinates, cutting edges with your
// hyperplane and hulling the cut, Shadow's projection and depth shading, tubes, and placing a shape in the world.
// Everything that draws or measures takes your display frame V.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { add, sub, mul, dot, lerp, mm, mv } from '../math4d.js';
import { depthShade, tubeMatrix, knobMatrix } from '../scenery.js';

// 4D point X in scene coordinates: ((X−P)·R, (X−P)·U, −(X−P)·F), so the scene origin is you
export const local = (V, X) => { const d = sub(X, V.P); return new THREE.Vector3(dot(d, V.R), dot(d, V.U), -dot(d, V.F)); };

// a shape's orientation, turned by the 4D spin (the panel's Spin checkbox) when it is on
export const orientOf = (o, spinM) => (spinM ? mm(spinM, o.orient) : o.orient);
// vertices in a shape's own coordinates, placed in the world by its orientation M, scale and center
export const placeVerts = (o, verts, M) => verts.map(v => add(o.center, mul(mv(M, v), o.scale)));
// how far ana of you each of W lies: [min, max]
export const rangeOf = (V, W) => { const dA = W.map(v => dot(sub(v, V.P), V.A)); return [Math.min(...dA), Math.max(...dA)]; };

export function clearGroup(g) {
  for (const c of [...g.children]) {
    c.traverse(n => { if (n.geometry) n.geometry.dispose(); });
    g.remove(c);
  }
}
// Replace a mesh's geometry with one built from flat xyz arrays, e.g. { position, color }, and an optional index.
export const setGeo = (mesh, attrs, index) => {
  mesh.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  for (const [name, arr] of Object.entries(attrs)) geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, 3));
  if (index) geo.setIndex(index);
  return (mesh.geometry = geo);
};

/* ---------- sectioning ---------- */
// Where the edges of W cross the hyperplane P + off·A, in scene coordinates (vertices on it count once), and each
// vertex's signed distance dA from it.
export function sectionPoints(V, W, edges, off = 0) {
  const dA = W.map(v => dot(sub(v, V.P), V.A) - off);
  const pts = [], EPS = 1e-9;
  const push = X => { const p = local(V, X); if (!pts.some(q => q.distanceToSquared(p) < 1e-10)) pts.push(p); };
  W.forEach((v, i) => { if (Math.abs(dA[i]) < EPS) push(v); });
  for (const [i, j] of edges) {
    const a = dA[i], b = dA[j];
    if ((a < -EPS && b > EPS) || (a > EPS && b < -EPS)) push(lerp(W[i], W[j], a / (a - b)));
  }
  return { pts, dA };
}
// The cross-section of a convex polytope: the hull of its section points, classified as a point, a segment or a solid
// (a flat polygon counts as a thin solid), with its edges.
export function sectionGeometry(pts) {
  if (!pts.length) return null;
  const p0 = pts[0];
  const argmax = f => { let bi = 0, bv = -1; pts.forEach((p, i) => { const v = f(p); if (v > bv) { bv = v; bi = i; } }); return [bi, bv]; };
  const [i1, d1] = argmax(p => p.distanceTo(p0));
  if (d1 < 1e-5) return { kind: 'point', ends: [p0] };
  const dir = pts[i1].clone().sub(p0).normalize();
  const offLine = p => { const v = p.clone().sub(p0); return v.sub(dir.clone().multiplyScalar(v.dot(dir))).length(); };
  const [i2, d2] = argmax(offLine);
  if (d2 < 1e-5) {
    let lo = p0, hi = p0, mn = 0, mx = 0;
    pts.forEach(p => { const t = p.clone().sub(p0).dot(dir); if (t < mn) { mn = t; lo = p; } if (t > mx) { mx = t; hi = p; } });
    return { kind: 'segment', ends: [lo, hi] };
  }
  const n = new THREE.Vector3().subVectors(pts[i1], p0).cross(new THREE.Vector3().subVectors(pts[i2], p0)).normalize();
  const [, d3] = argmax(p => Math.abs(p.clone().sub(p0).dot(n)));
  if (d3 >= 1e-4) {
    try { const geo = new ConvexGeometry(pts); return { kind: 'solid', geo, edges: new THREE.EdgesGeometry(geo, 1) }; }
    catch (e) { /* fall through to a flat polygon */ }
  }
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const v = new THREE.Vector3().crossVectors(n, dir);
  const ring = pts.map(p => { const d = p.clone().sub(c); return { p, a: Math.atan2(d.dot(v), d.dot(dir)) }; }).sort((a, b) => a.a - b.a).map(e => e.p);
  const tri = [], line = [];
  ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; tri.push(c, p, q); line.push(p, q); });
  const geo = new THREE.BufferGeometry().setFromPoints(tri); geo.computeVertexNormals();
  return { kind: 'solid', geo, edges: new THREE.BufferGeometry().setFromPoints(line) };
}
// add a cross-section to `target` in o's materials
export function addSection(target, o, g) {
  if (!g) return;
  if (g.kind === 'solid') { target.add(new THREE.Mesh(g.geo, o.mat)); target.add(new THREE.LineSegments(g.edges, o.lineMat)); return; }
  if (g.kind === 'segment') target.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g.ends), o.lineMat));
  target.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(g.ends), o.ptMat));
}

/* ---------- Shadow ---------- */
// Perspective projection along ana from an eye E ana of C: X ↦ local(C) + (r·R, r·U, −r·F)·k, k = E/(E − r·A), r = X − C.
// Gives the scene point p, how far ana a, and the scale k.
export function projector(V, C, E) {
  const base = local(V, C);
  return X => {
    const r = sub(X, C), a = dot(r, V.A), k = E / Math.max(0.25 * E, E - a);
    return { p: new THREE.Vector3(base.x + dot(r, V.R) * k, base.y + dot(r, V.U) * k, base.z - dot(r, V.F) * k), a, k };
  };
}
const _c = new THREE.Color();
export const WHITE = new THREE.Color(0xffffff);
// o's color at depth t, from 0 (kata, dim) to 1 (ana, bright); returns a shared color
export const shadeAt = (o, t) => depthShade(_c, o.dimCol, o.brightCol, t);
// a bright tube from projected point a to b (as from projector), shaded by their mean depth
export const ridge = (o, a, b) => ({ a: a.p, b: b.p, rr: 0.012 * (a.k + b.k), color: shadeAt(o, ((a.a + b.a) / 2 / o.rad4 + 1) / 2).clone().lerp(WHITE, 0.55) });

/* ---------- tubes ---------- */
export const TUBE = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), KNOB = new THREE.SphereGeometry(1, 12, 8);
// o.tubes and o.knobs: room for n tube segments and n knobs, in one material
export function addTubes(o, n, m = n, mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 })) {
  o.tubes = new THREE.InstancedMesh(TUBE, mat, n);
  o.knobs = new THREE.InstancedMesh(KNOB, mat, m);
  o.tubes.frustumCulled = o.knobs.frustumCulled = false;
  o.group.add(o.tubes, o.knobs);
}
// Draw curves as chains of tubes, each segment { a, b, rr, color }. The meshes have room for many more segments
// than are ever drawn (the Klein bottle's for one per triangle), so only the used part of each buffer is uploaded.
export function drawTubes(o, segs) {
  segs.forEach(({ a, b, rr, color }, n) => {
    o.tubes.setMatrixAt(n, tubeMatrix(a, b, rr));
    o.knobs.setMatrixAt(n, knobMatrix(a, rr));
    o.tubes.setColorAt(n, color); o.knobs.setColorAt(n, color);
  });
  const n = o.tubes.count = o.knobs.count = segs.length;
  if (!n) return;   // nothing drawn; an update range of 0 would make WebGL2 upload the whole buffer
  for (const im of [o.tubes, o.knobs]) for (const [attr, size] of [[im.instanceMatrix, 16], [im.instanceColor, 3]]) {
    if (!attr) continue;
    attr.clearUpdateRanges(); attr.addUpdateRange(0, n * size);
    attr.needsUpdate = true;
  }
}

/* ---------- fibers (the 3D Klein bottle's spheres, the 4D Möbius strip's disks) ---------- */
// a list of fibers { c, M } moved into world coordinates by the object's orientation M, scale and center
export const placeFibers = (o, list, M) => list.map(f => ({ c: add(o.center, mul(mv(M, f.c), o.scale)), M: f.M.map(m => mul(mv(M, m), o.scale)) }));
// each fiber's extent along a unit direction e, measured from `from`: its center's offset ± |Mᵀ e|
export const fiberExtent = (F, e, from) => F.map(f => { const m = dot(sub(f.c, from), e), r = Math.hypot(...f.M.map(v => dot(v, e))); return [m - r, m + r]; });
// a fiber list's half-extent from o's center along unit direction e, for Stack's spacing and labels
export const fiberHalf = (o, F, e) => Math.max(...fiberExtent(F, e, o.center).map(x => Math.max(-x[0], x[1])));
// the farthest a fiber list reaches from the origin, for Shadow's eye distance
export const fiberReach = list => Math.max(...list.map(f => Math.hypot(...f.c) + Math.max(...f.M.map(m => Math.hypot(...m)))));
