// The glome (3-sphere, solid): every cut is a ball, radius √(r² − d²) at distance d. Shadow draws its wireframe from an
// eye 1.6 radii ana: the Clifford torus (η = 45°) and the two great circles it separates, which are Hopf-linked.
import * as THREE from 'three';
import { add, sub, mul, dot, mv } from '../math4d.js';
import { stackOffs } from '../hud.js';
import { local, setGeo, projector, shadeAt, WHITE } from './draw.js';

const SEGS = (() => {
  const segs = [], N = 48, P = (eta, a, b) => [Math.cos(eta) * Math.cos(a), Math.cos(eta) * Math.sin(a), Math.sin(eta) * Math.cos(b), Math.sin(eta) * Math.sin(b)];
  const circle = (f, core) => { for (let i = 0; i < N; i++) segs.push([f(2 * Math.PI * i / N), f(2 * Math.PI * (i + 1) / N), core]); };
  for (let j = 0; j < 14; j++) { const c = 2 * Math.PI * j / 14; circle(t => P(Math.PI / 4, t, c), false); circle(t => P(Math.PI / 4, c, t), false); }
  circle(t => P(0, t, 0), true); circle(t => P(Math.PI / 2, 0, t), true);
  return segs;
})();
const BALL = new THREE.SphereGeometry(1, 56, 36);

export function setupGlome(o) {
  o.balls = [0, 1, 2].map(() => { const b = new THREE.Mesh(BALL, o.mat); o.group.add(b); return b; });
  o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  o.group.add(o.wire);
  o.build = (V, { mode, labels, spinM }) => {
    const d = dot(sub(o.center, V.P), V.A), rr = o.radius;
    o.range = [d - rr, d + rr];
    const setBall = (b, off, shift) => {
      const dd = d - off; b.visible = Math.abs(dd) < rr;
      if (b.visible) { b.scale.setScalar(Math.sqrt(rr * rr - dd * dd)); b.position.copy(local(V, o.center)); b.position.x += shift; }
    };
    o.balls.forEach(b => { b.visible = false; }); o.wire.visible = false;
    if (mode === 'slice') setBall(o.balls[1], 0, 0);
    else if (mode === 'stack') {
      const spacing = 2 * rr + 0.6;
      stackOffs(o.range).forEach((off, i) => setBall(o.balls[i], off, (i - 1) * spacing));
      o.stackInfo = { spacing, bottom: -rr - 0.35, labels };
    } else shadow(V, spinM);
  };

  function shadow(V, spinM) {
    const proj = projector(V, o.center, 1.6 * o.radius), pos = [], col = [];
    const pt = u => proj(add(o.center, mul(spinM ? mv(spinM, u) : u, o.radius)));
    for (const [u0, u1, core] of SEGS) for (const P of [pt(u0), pt(u1)]) {
      pos.push(P.p.x, P.p.y, P.p.z);
      const c = shadeAt(o, (P.a / o.radius + 1) / 2);
      if (core) c.lerp(WHITE, 0.45);
      col.push(c.r, c.g, c.b);
    }
    setGeo(o.wire, { position: pos, color: col });
    o.wire.visible = true;
  }
}
