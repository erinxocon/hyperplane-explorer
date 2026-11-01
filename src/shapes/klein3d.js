// The 3D Klein bottle S² ×̃ S¹, immersed in R⁴: o.fibers = [{ c, M }] (shapes.js), each fiber the ellipsoid X = c + M p,
// p on the unit sphere. The hyperplane P + off·A meets a fiber in the circle n·p = d, n = Mᵀ A, d = off − (c − P)·A, so
// a slice is the tube through those circles (see-through glass, so the self-crossing shows); where a run of fibers
// ends, the circle shrinks to a point and caps the tube. Shadow draws every 12th fiber sphere as three great circles,
// and the path of its poles p = (±1, 0, 0) as tubes: the glass bottle's two outlines, each turning into the other
// after one lap.
import * as THREE from 'three';
import { add, sub, mul, dot, lerp } from '../math4d.js';
import { stackOffs } from '../hud.js';
import { local, orientOf, clearGroup, setGeo, projector, shadeAt, ridge, addTubes, drawTubes, placeFibers, fiberExtent, fiberHalf, fiberReach } from './draw.js';

const fiberPoint = (f, p) => add(f.c, add(add(mul(f.M[0], p.x), mul(f.M[1], p.y)), mul(f.M[2], p.z)));

export function setupKlein3D(o) {
  o.rad4 = fiberReach(o.fibers) * o.scale;
  o.glass = new THREE.MeshStandardMaterial({ color: o.baseCol, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false });
  o.dyn = new THREE.Group();
  o.group.add(o.dyn);
  addTubes(o, 2 * o.fibers.length);
  o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  o.group.add(o.wire);
  o.build = (V, { mode, labels, spinM }) => {
    const F = placeFibers(o, o.fibers, orientOf(o, spinM)), ea = fiberExtent(F, V.A, V.P);
    o.range = [Math.min(...ea.map(x => x[0])), Math.max(...ea.map(x => x[1]))];
    clearGroup(o.dyn);
    o.wire.visible = o.tubes.visible = o.knobs.visible = mode === 'shadow';
    if (mode === 'slice') addSlice(V, F, 0, 0);
    else if (mode === 'stack') {
      const spacing = 2 * fiberHalf(o, F, V.R) + 0.7;
      stackOffs(o.range).forEach((off, i) => addSlice(V, F, off, (i - 1) * spacing));
      o.stackInfo = { spacing, bottom: -(fiberHalf(o, F, V.U) + 0.35), labels };
    } else shadow(V, F);
  };

  function addSlice(V, F, off, shift) {
    const s = slice(V, F, off, shift);
    if (s) o.dyn.add(new THREE.Mesh(s.geo, o.glass), new THREE.LineSegments(s.lines, o.lineMat));
  }
  function slice(V, F, off, shift) {
    const NT = 40, pos = [], idx = [], ring = [];
    const at = F.map(f => {
      const n = new THREE.Vector3(...f.M.map(m => dot(m, V.A))), d = off - dot(sub(f.c, V.P), V.A);
      return { n, d, g: n.length() - Math.abs(d) };
    });
    const put = X => { const p = local(V, X); pos.push(p.x + shift, p.y, p.z); return pos.length / 3 - 1; };
    // the point where the circle vanishes between fibers i and j, fanned to ring `base`; a cap that ends a run
    // winds the other way from one that starts it, so the whole tube stays consistently oriented
    const cap = (i, j, base, end) => {
      const t = at[i].g / (at[i].g - at[j].g), lp = (a, b) => lerp(a, b, t);
      const n = at[i].n.clone().lerp(at[j].n, t), d = at[i].d + (at[j].d - at[i].d) * t;
      if (n.lengthSq() < 1e-12) return;
      const tip = put(fiberPoint({ c: lp(F[i].c, F[j].c), M: [0, 1, 2].map(k => lp(F[i].M[k], F[j].M[k])) }, n.multiplyScalar(d / n.lengthSq())));
      for (let k = 0; k < NT; k++) { const k1 = (k + 1) % NT; end ? idx.push(base + k1, base + k, tip) : idx.push(base + k, base + k1, tip); }
    };
    let prev = -1, e1 = null;
    const e2 = new THREE.Vector3(), q = new THREE.Vector3();
    F.forEach((f, i) => {
      const { n, d, g } = at[i];
      if (g <= 0 || n.lengthSq() < 1e-12) {
        if (prev >= 0) cap(i - 1, i, prev, true);
        prev = -1; e1 = null; return;
      }
      const nl = n.length(), nh = n.clone().divideScalar(nl), r = Math.sqrt(1 - (d / nl) ** 2);
      // carry the circle's start direction along from the previous fiber so the tube doesn't twist
      if (!e1) e1 = Math.abs(nh.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      e1.addScaledVector(nh, -e1.dot(nh)).normalize(); e2.crossVectors(nh, e1);
      const base = pos.length / 3;
      for (let k = 0; k < NT; k++) {
        const t = 2 * Math.PI * k / NT;
        q.copy(nh).multiplyScalar(d / nl).addScaledVector(e1, r * Math.cos(t)).addScaledVector(e2, r * Math.sin(t));
        put(fiberPoint(f, q));
      }
      if (i % 12 === 0) for (let k = 0; k < NT; k++) ring.push(base + k, base + (k + 1) % NT);
      if (prev >= 0) for (let k = 0; k < NT; k++) { const k1 = (k + 1) % NT; idx.push(prev + k, base + k, base + k1, prev + k, base + k1, prev + k1); }
      else if (i > 0) cap(i, i - 1, base, false);
      prev = base;
    });
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', geo.getAttribute('position')); lines.setIndex(ring);
    return { geo, lines };
  }
  function shadow(V, F) {
    const proj = projector(V, o.center, 1.6 * o.rad4), pos = [], col = [];
    const E = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], N = 48, q = new THREE.Vector3();
    const pt = (f, a, b, t) => proj(fiberPoint(f, q.copy(E[a]).multiplyScalar(Math.cos(t)).addScaledVector(E[b], Math.sin(t))));
    for (let i = 0; i < F.length - 1; i += 12) for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (let k = 0; k < N; k++)
      for (const P of [pt(F[i], a, b, 2 * Math.PI * k / N), pt(F[i], a, b, 2 * Math.PI * (k + 1) / N)]) {
        const c = shadeAt(o, (P.a / o.rad4 + 1) / 2);
        pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b);
      }
    setGeo(o.wire, { position: pos, color: col });
    const segs = [];
    for (const sg of [1, -1]) for (let i = 0; i < F.length - 1; i++) segs.push(ridge(o, proj(fiberPoint(F[i], q.set(sg, 0, 0))), proj(fiberPoint(F[i + 1], q.set(sg, 0, 0)))));
    drawTubes(o, segs);
  }
}
