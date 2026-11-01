// The Klein bottle: a surface embedded in R⁴, o.surface = { verts, tris, grid, nu, nv } (shapes.js). A hyperplane meets
// it in curves, found by marching triangles and drawn as thin tubes. Shadow draws its projected skin, shaded kata → ana,
// with its tube circles every 1/24 turn, and a thicker line along the top of the tube (v = π/2): after one lap it comes
// back underneath (v = −π/2), and it takes a second lap to close.
import * as THREE from 'three';
import { sub, dot, lerp } from '../math4d.js';
import { stackOffs } from '../hud.js';
import { local, orientOf, placeVerts, rangeOf, setGeo, projector, shadeAt, ridge, WHITE, addTubes, drawTubes } from './draw.js';

export function setupKlein(o) {
  o.rad4 = Math.max(...o.surface.verts.map(v => Math.hypot(...v))) * o.scale;
  addTubes(o, 3 * o.surface.tris.length);
  o.skin = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }));
  o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  o.group.add(o.skin, o.wire);
  o.build = (V, { mode, labels, spinM }) => {
    const W = placeVerts(o, o.surface.verts, orientOf(o, spinM));
    o.range = rangeOf(V, W);
    o.skin.visible = o.wire.visible = mode === 'shadow';
    if (mode === 'slice') drawCuts([{ segs: cuts(V, W, 0), shift: 0 }]);
    else if (mode === 'stack') {
      const spacing = 2 * o.rad4 + 0.7;
      drawCuts(stackOffs(o.range).map((off, i) => ({ segs: cuts(V, W, off), shift: (i - 1) * spacing })));
      const half = Math.max(...W.map(v => Math.abs(dot(sub(v, o.center), V.U))));
      o.stackInfo = { spacing, bottom: -(half + 0.35), labels };
    } else shadow(V, W);
  };

  // marching triangles: every mesh triangle the hyperplane P + off·A crosses gives one segment of the curve
  function cuts(V, W, off) {
    const f = W.map(v => dot(sub(v, V.P), V.A) - off), segs = [];
    for (const t of o.surface.tris) {
      const ends = [];
      for (let e = 0; e < 3; e++) {
        const i = t[e], j = t[(e + 1) % 3];
        if ((f[i] >= 0) !== (f[j] >= 0)) ends.push(local(V, lerp(W[i], W[j], f[i] / (f[i] - f[j]))));
      }
      if (ends.length === 2) segs.push(ends);
    }
    return segs;
  }
  // the cut curves, each panel's shifted sideways by `shift` (Stack)
  const drawCuts = panels => drawTubes(o, panels.flatMap(({ segs, shift }) =>
    segs.map(([a, b]) => ({ a: a.setX(a.x + shift), b: b.setX(b.x + shift), rr: 0.028, color: o.baseCol }))));
  function shadow(V, W) {
    const PV = W.map(projector(V, o.center, 1.6 * o.rad4));
    const { grid, nu, nv } = o.surface, g = (i, j) => i * (nv + 1) + j, c3 = new THREE.Color();
    const pos = [], col = [], idx = [], lpos = [], lcol = [];
    for (const k of grid) {
      const P = PV[k], c = shadeAt(o, (P.a / o.rad4 + 1) / 2);
      pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) idx.push(g(i, j), g(i + 1, j), g(i + 1, j + 1), g(i, j), g(i + 1, j + 1), g(i, j + 1));
    const line = (a, b) => { for (const k of [a, b]) { lpos.push(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]); c3.setRGB(col[3 * k], col[3 * k + 1], col[3 * k + 2]).lerp(WHITE, 0.35); lcol.push(c3.r, c3.g, c3.b); } };
    for (let i = 0; i < nu; i += nu / 24) for (let j = 0; j < nv; j++) line(g(i, j), g(i, j + 1));
    const segs = [];
    for (const j of [nv / 4, 3 * nv / 4]) for (let i = 0; i < nu; i++) segs.push(ridge(o, PV[grid[g(i, j)]], PV[grid[g(i + 1, j)]]));
    drawTubes(o, segs);
    setGeo(o.skin, { position: pos, color: col }, idx).computeVertexNormals();
    setGeo(o.wire, { position: lpos, color: lcol });
  }
}
