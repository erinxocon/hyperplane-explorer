// The 4D Möbius strip (a solid Klein bottle, Möbius strip × interval), embedded: o.disks = [{ c, M }] (shapes.js), each
// disk c + M·(a, b), a² + b² ≤ 1. The hyperplane P + off·A meets a disk in the chord α a + β b = δ, with α = M[0]·A,
// β = M[1]·A and δ = off − (c − P)·A, and a slice is the ribbon of those chords. Where it crosses every disk it is a
// Möbius strip: after one lap the chord comes back reversed. Otherwise it breaks into ribbons that narrow to a point
// where the chord vanishes. o.state says which, and o.focus is the middle of the offsets that cut a Möbius strip.
// Shadow draws 16 of the disks as see-through cards and the path of each card's top point (b = 1) as tubes: after one
// lap the top comes back at the bottom, so the line takes two laps to close.
import * as THREE from 'three';
import { add, sub, mul, dot, lerp } from '../math4d.js';
import { stackOffs } from '../hud.js';
import { local, orientOf, clearGroup, setGeo, projector, shadeAt, ridge, WHITE, addTubes, drawTubes, placeFibers, fiberExtent, fiberHalf, fiberReach } from './draw.js';

const diskPoint = (f, a, b) => add(f.c, add(mul(f.M[0], a), mul(f.M[1], b)));

export function setupMobius(o) {
  o.rad4 = fiberReach(o.disks) * o.scale;
  o.ribbon = new THREE.MeshStandardMaterial({ color: o.baseCol, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  o.edgeCol = o.baseCol.clone().lerp(WHITE, 0.6);
  o.dyn = new THREE.Group();
  o.group.add(o.dyn);
  addTubes(o, 3 * (2 * o.disks.length + 16));
  o.cards = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }));
  o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  o.group.add(o.cards, o.wire);
  o.build = (V, { mode, labels, spinM }) => {
    const D = placeFibers(o, o.disks, orientOf(o, spinM)), ea = fiberExtent(D, V.A, V.P);
    o.range = [Math.min(...ea.map(x => x[0])), Math.max(...ea.map(x => x[1]))];
    // the offsets where your slice would cross every disk, cutting a Möbius strip; tapping the name moves there
    const lo = Math.max(...ea.map(x => x[0])), hi = Math.min(...ea.map(x => x[1]));
    o.focus = hi > lo ? (lo + hi) / 2 : null;
    clearGroup(o.dyn);
    o.cards.visible = o.wire.visible = mode === 'shadow';
    if (mode === 'slice') {
      const [kind] = ribbons(V, D, [{ off: 0, shift: 0 }]);
      o.state = kind === 'mobius' ? 'Möbius strip' : !kind ? 'not in slice' : kind === 1 ? 'ribbon' : `${kind} ribbons`;
    } else if (mode === 'stack') {
      const spacing = 2 * fiberHalf(o, D, V.R) + 0.7;
      ribbons(V, D, stackOffs(o.range).map((off, i) => ({ off, shift: (i - 1) * spacing })));
      o.stackInfo = { spacing, bottom: -(fiberHalf(o, D, V.U) + 0.35), labels };
      o.state = 'stacked';
    } else {
      shadow(V, D);
      o.state = 'shadow';
    }
  };

  // one cut: the ribbon, its rulings (every 10th chord) and its edges; `kind` is 'mobius' or how many ribbons
  function ribbonSlice(V, D, off, shift) {
    const K = 6, pos = [], idx = [], rul = [], edge = [];
    const chord = f => {
      const al = dot(f.M[0], V.A), be = dot(f.M[1], V.A), del = off - dot(sub(f.c, V.P), V.A), r2 = al * al + be * be;
      return { al, be, del, r2, has: r2 > 1e-12 && del * del < r2 };
    };
    const at = D.map(chord);
    const put = X => { const p = local(V, X); p.x += shift; pos.push(p.x, p.y, p.z); return p; };
    // the point where the chord shrinks away, between disks i and j, fanned to the chord at `base`; a cap that ends
    // a run winds the other way from one that starts it, so the ribbon stays consistently oriented
    const cap = (i, j, base, ends, end) => {
      const gi = Math.sqrt(at[i].r2) - Math.abs(at[i].del), gj = Math.sqrt(at[j].r2) - Math.abs(at[j].del), t = gi / (gi - gj);
      const f = { c: lerp(D[i].c, D[j].c, t), M: [lerp(D[i].M[0], D[j].M[0], t), lerp(D[i].M[1], D[j].M[1], t)] };
      const { al, be, del, r2 } = chord(f);
      if (r2 < 1e-12) return;
      const tip = put(diskPoint(f, del * al / r2, del * be / r2)), ti = pos.length / 3 - 1;
      for (let k = 0; k < K - 1; k++) end ? idx.push(base + k + 1, base + k, ti) : idx.push(base + k, base + k + 1, ti);
      edge.push([ends[0], tip], [ends[1], tip]);
    };
    let prev = -1, prevEnds = null, runs = 0;
    D.forEach((f, i) => {
      const { al, be, del, r2, has } = at[i];
      if (!has) {
        if (prev >= 0) cap(i - 1, i, prev, prevEnds, true);
        prev = -1; return;
      }
      // the chord: its midpoint m = δ(α, β)/r², then ± along (−β, α) to the rim of the disk
      const ma = del * al / r2, mb = del * be / r2, L = Math.sqrt((1 - del * del / r2) / r2);
      const base = pos.length / 3, pts = [];
      for (let k = 0; k < K; k++) { const sk = (2 * k / (K - 1) - 1) * L; pts.push(put(diskPoint(f, ma - sk * be, mb + sk * al))); }
      const ends = [pts[0], pts[K - 1]];
      if (i % 10 === 0) rul.push(...ends);
      if (prev >= 0) {
        for (let k = 0; k < K - 1; k++) idx.push(prev + k, base + k, base + k + 1, prev + k, base + k + 1, prev + k + 1);
        edge.push([prevEnds[0], ends[0]], [prevEnds[1], ends[1]]);
      } else {
        runs++;
        if (i > 0) cap(i, i - 1, base, ends, false);
      }
      prev = base; prevEnds = ends;
    });
    // the last disk is the first one mirrored, so a ribbon running through both is one ribbon, not two
    const all = at.every(a => a.has), wraps = !all && at[0].has && at[at.length - 1].has;
    let geo = null;
    if (idx.length) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
    }
    return { geo, rul, edge, kind: all ? 'mobius' : runs - (wraps ? 1 : 0) };
  }
  // Slice or Stack panels: the ribbons and their rulings in o.dyn, every edge in one batch of tubes
  function ribbons(V, D, panels) {
    const segs = [];
    const kinds = panels.map(({ off, shift }) => {
      const r = ribbonSlice(V, D, off, shift);
      if (r.geo) o.dyn.add(new THREE.Mesh(r.geo, o.ribbon));
      if (r.rul.length) o.dyn.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(r.rul), o.lineMat));
      for (const [a, b] of r.edge) segs.push({ a, b, rr: 0.022, color: o.edgeCol });
      return r.kind;
    });
    drawTubes(o, segs);
    return kinds;
  }
  function shadow(V, D) {
    const proj = projector(V, o.center, 1.6 * o.rad4), N = D.length - 1, NS = 32;
    const pos = [], col = [], idx = [], lpos = [], lcol = [];
    const shade = P => shadeAt(o, (P.a / o.rad4 + 1) / 2);
    for (let j = 0; j < 16; j++) {
      const f = D[Math.round(j * N / 16)], base = pos.length / 3, rim = [];
      for (let k = 0; k < NS; k++) { const t = 2 * Math.PI * k / NS; rim.push(proj(diskPoint(f, Math.cos(t), Math.sin(t)))); }
      for (const P of [proj(f.c), ...rim]) { const c = shade(P); pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b); }
      for (let k = 0; k < NS; k++) {
        idx.push(base, base + 1 + k, base + 1 + (k + 1) % NS);
        for (const P of [rim[k], rim[(k + 1) % NS]]) { const c = shade(P).lerp(WHITE, 0.3); lpos.push(P.p.x, P.p.y, P.p.z); lcol.push(c.r, c.g, c.b); }
      }
    }
    setGeo(o.cards, { position: pos, color: col }, idx).computeVertexNormals();
    setGeo(o.wire, { position: lpos, color: lcol });
    const segs = [];
    for (const sg of [1, -1]) for (let i = 0; i < N; i++) segs.push(ridge(o, proj(diskPoint(D[i], 0, sg)), proj(diskPoint(D[i + 1], 0, sg))));
    drawTubes(o, segs);
  }
}
