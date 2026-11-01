// Convex 4-polytopes (tesseract, 16-, 24-, 5- and 600-cell, duoprisms): o.shape = { verts, edges }. Slice hulls where
// the edges cross your hyperplane (exact for a convex polytope); Stack does that for three parallel cuts side by side;
// Shadow draws the edges as tubes projected from an eye 1.6 radii ana of the center, dim (kata) to bright (ana).
import * as THREE from 'three';
import { stackOffs } from '../hud.js';
import { tubeMatrix, knobMatrix } from '../scenery.js';
import { orientOf, placeVerts, rangeOf, clearGroup, sectionPoints, sectionGeometry, addSection, projector, shadeAt, addTubes } from './draw.js';

export function setupPolytope(o) {
  o.dyn = new THREE.Group();
  o.group.add(o.dyn);
  o.rad4 = Math.max(...o.shape.verts.map(v => Math.hypot(...v))) * o.scale;
  addTubes(o, o.shape.edges.length, o.shape.verts.length, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 }));
  o.build = (V, { mode, labels, spinM }) => {
    const W = placeVerts(o, o.shape.verts, orientOf(o, spinM));
    o.range = rangeOf(V, W);
    o.tubes.visible = o.knobs.visible = mode === 'shadow';
    clearGroup(o.dyn);
    if (mode === 'slice') addSection(o.dyn, o, sectionGeometry(sectionPoints(V, W, o.shape.edges).pts));
    else if (mode === 'stack') stack(V, W, labels);
    else wire(V, W);
  };

  // three parallel cuts through the shape, laid side by side, as far apart as the widest needs
  function stack(V, W, labels) {
    const parts = stackOffs(o.range).map(off => sectionGeometry(sectionPoints(V, W, o.shape.edges, off).pts));
    const box = new THREE.Box3();
    let width = 0.8;
    for (const g of parts) {
      if (!g) continue;
      if (g.geo) { g.geo.computeBoundingBox(); box.copy(g.geo.boundingBox); } else box.setFromPoints(g.ends);
      width = Math.max(width, box.max.x - box.min.x);
    }
    const spacing = width + 0.7;
    parts.forEach((g, i) => { if (!g) return; const panel = new THREE.Group(); panel.position.x = (i - 1) * spacing; addSection(panel, o, g); o.dyn.add(panel); });
    o.stackInfo = { spacing, bottom: -(width / 2 + 0.35), labels };
  }
  function wire(V, W) {
    const PV = W.map(projector(V, o.center, 1.6 * o.rad4));
    o.shape.edges.forEach(([i, j], n) => {
      o.tubes.setMatrixAt(n, tubeMatrix(PV[i].p, PV[j].p, 0.018 * (PV[i].k + PV[j].k) / 2));
      o.tubes.setColorAt(n, shadeAt(o, ((PV[i].a + PV[j].a) / 2 / o.rad4 + 1) / 2));
    });
    PV.forEach((v, n) => {
      o.knobs.setMatrixAt(n, knobMatrix(v.p, 0.042 * v.k));
      o.knobs.setColorAt(n, shadeAt(o, (v.a / o.rad4 + 1) / 2));
    });
    for (const im of [o.tubes, o.knobs]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
