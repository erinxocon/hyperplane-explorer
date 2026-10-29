// Geometry for the 4D chess page, built from three.js primitives: the pieces, and the stand that holds one 3D board.
// Pieces stand on y = 0 and face −z, away from white's side.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAWN, KNIGHT, BISHOP, UNICORN, ROOK, QUEEN, KING } from './rules.js';

const lathe = pts => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 32);
const ball = (r, y, x = 0, z = 0) => new THREE.SphereGeometry(r, 20, 14).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const merge = parts => mergeBufferGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
const BASE = [[0, 0], [0.27, 0], [0.28, 0.025], [0.27, 0.06], [0.2, 0.085]];
const ring = (n, r, y, part) => Array.from({ length: n }, (_, k) => { const a = (k + 0.5) * 2 * Math.PI / n; return part(r * Math.cos(a), y, r * Math.sin(a)); });

// A horse's head in side view (forward, up), extruded and turned so forward is −z.
function head() {
  const pts = [[-0.16, 0.12], [0.15, 0.12], [0.12, 0.26], [0.24, 0.38], [0.25, 0.47], [0.13, 0.58], [0.08, 0.71], [0, 0.62], [-0.12, 0.55], [-0.2, 0.32]];
  const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 });
  return g.translate(0, 0, -0.07).rotateY(Math.PI / 2);
}
const SHORT_BASE = lathe([...BASE, [0.18, 0.12], [0.16, 0.15], [0, 0.15]]);

export const PIECE_GEOMETRY = {
  [PAWN]: merge([lathe([...BASE, [0.13, 0.13], [0.085, 0.3], [0.13, 0.33], [0.07, 0.36], [0, 0.36]]), ball(0.11, 0.44)]),
  [ROOK]: merge([lathe([...BASE, [0.17, 0.14], [0.16, 0.46], [0.23, 0.5], [0.23, 0.6], [0, 0.6]]), ...ring(4, 0.18, 0.64, (x, y, z) => box(0.1, 0.09, 0.1, x, y, z))]),
  [BISHOP]: merge([lathe([...BASE, [0.13, 0.15], [0.08, 0.4], [0.15, 0.43], [0.09, 0.46], [0.13, 0.53], [0.12, 0.6], [0.06, 0.68], [0, 0.7]]), ball(0.045, 0.73)]),
  [QUEEN]: merge([lathe([...BASE, [0.16, 0.15], [0.1, 0.52], [0.17, 0.56], [0.12, 0.6], [0.19, 0.74], [0.15, 0.75], [0, 0.72]]), ball(0.06, 0.8), ...ring(8, 0.17, 0.76, (x, y, z) => ball(0.03, y, x, z))]),
  [KING]: merge([lathe([...BASE, [0.17, 0.15], [0.11, 0.56], [0.18, 0.6], [0.13, 0.64], [0.18, 0.78], [0, 0.8]]), box(0.055, 0.22, 0.055, 0, 0.9, 0), box(0.17, 0.055, 0.055, 0, 0.93, 0)]),
  [KNIGHT]: merge([SHORT_BASE, head()]),
  // the unicorn is the knight's head with a horn on the forehead
  [UNICORN]: merge([SHORT_BASE, head(), new THREE.ConeGeometry(0.035, 0.3, 12).translate(0, 0.15, 0).rotateX(-0.55).translate(0, 0.6, -0.12)]),
};

// One stand, styled after tri-dimensional chess: a chrome column at the back left with an arm out to each of four
// glass plates. Each plate is `level` above the one below and set back by `stagger`. The column stands on a foot at
// STAND.foot; tiles and pieces are placed separately. Two meshes, chrome and glass, so it costs two draw calls.
export const STAND = { colX: -2.7, foot: -1.15 };
export function buildStand({ level, stagger, chrome, glass }) {
  const metal = [], panes = [], colZ = -1.5 * stagger, x0 = STAND.colX;
  const rod = (a, b, r) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    metal.push(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 16).applyQuaternion(q).translate(...a.clone().add(b).multiplyScalar(0.5).toArray()));
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  rod(V(x0, STAND.foot, colZ), V(x0, 3 * level + 0.35, colZ), 0.075);
  metal.push(new THREE.SphereGeometry(0.13, 20, 14).translate(x0, 3 * level + 0.38, colZ));
  metal.push(new THREE.CylinderGeometry(0.62, 0.75, 0.14, 40).translate(x0, STAND.foot, colZ));
  for (let u = 0; u < 4; u++) {
    const y = u * level - 0.09, z = -u * stagger;
    panes.push(new THREE.BoxGeometry(4.2, 0.035, 4.2).translate(0, y, z));
    for (const [w, d, x, dz] of [[4.32, 0.06, 0, 2.13], [4.32, 0.06, 0, -2.13], [0.06, 4.32, 2.13, 0], [0.06, 4.32, -2.13, 0]]) metal.push(new THREE.BoxGeometry(w, 0.07, d).translate(x, y, z + dz));
    rod(V(x0, y, colZ), V(-2.13, y, z), 0.045);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(metal), chrome), new THREE.Mesh(merge(panes), glass));
  return g;
}

// The plain alternative to the stand: the outline of each of the four levels and the four corner posts, as lines.
export function buildFrame({ level, line }) {
  const h = 2.13, y0 = -0.09, corners = [[-h, -h], [h, -h], [h, h], [-h, h]], p = [];
  for (let u = 0; u < 4; u++) corners.forEach(([x, z], k) => { const [x1, z1] = corners[(k + 1) % 4]; p.push(x, y0 + u * level, z, x1, y0 + u * level, z1); });
  for (const [x, z] of corners) p.push(x, y0, z, x, y0 + 3 * level, z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Group().add(new THREE.LineSegments(g, line));
}
