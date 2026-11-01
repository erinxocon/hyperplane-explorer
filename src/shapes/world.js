// The explorer's world: every shape, where it sits in 4D, and its kind, which sets how it is drawn (one module each in
// this folder). createWorld(scene, BG) makes their render objects. Each entry then has
// o.build(V, ctx), which redraws it for your display frame V and ctx = { mode, labels, spinM } (the view, Stack's panel
// labels, the 4D spin or null) and sets o.range (how far it reaches along your ana, for the ruler), o.stackInfo in
// Stack, and for some o.state for the panel. Earth also has o.tick(camera, dt, reduceMotion) for every frame.
import * as THREE from 'three';
import { ident, rot, mm } from '../math4d.js';
import { tesseract, cell16, cell24, cell5, duoprism, cell600, klein, spunKlein, mobius4 } from './shapes.js';
import { WHITE } from './draw.js';
import { setupPolytope } from './polytope.js';
import { setupEarth } from './earth.js';
import { setupGlome } from './glome.js';
import { setupKlein } from './klein.js';
import { setupKlein3D } from './klein3d.js';
import { setupMobius } from './mobius.js';

const WORLD_DEFS = [
  { name: 'Tesseract', color: '#eaa23c', center: [0, 0, 5, 0], scale: 1, shape: tesseract(), orient: ident() },
  { name: '24-cell', color: '#4fc1a6', center: [5.6, 0, 9.5, 0.4], scale: 1.05, shape: cell24(), orient: mm(rot(0, 3, 0.5), rot(1, 2, 0.3)) },
  { name: 'Earth', color: '#5f9fd8', center: [-4.4, 0.2, 7.5, 0], radius: 1.75, thick: 0.3, globe: true },
  { name: '16-cell', color: '#e3728f', center: [0, 0, 5, -3.2], scale: 1.5, shape: cell16(), orient: mm(rot(2, 3, 0.6), rot(0, 1, 0.4)) },
  { name: '5-cell', color: '#7fa9ff', center: [3.0, 0, 12.5, -0.3], scale: 1.35, shape: cell5(), orient: rot(0, 3, 0.3) },
  { name: 'Glome', color: '#f0d26e', center: [0, 0, 5, 3.2], radius: 1.35 },
  { name: '600-cell', color: '#d98ae0', center: [-3.4, 0, 2.2, 3.0], scale: 1.7, shape: cell600(), orient: mm(rot(0, 3, 0.35), rot(1, 2, 0.5)) },
  { name: '6,6-duoprism', color: '#9fd468', center: [-2.6, 0, 11.5, -3.0], scale: 1.35, shape: duoprism(6, 6), orient: rot(1, 3, 0.55) },
  { name: 'Klein bottle', color: '#e8845c', center: [3.2, 0, 6.6, 0.2], scale: 1.1, surface: klein(), orient: mm(rot(0, 3, 0.35), rot(1, 3, 0.4)) },
  { name: '3D Klein bottle', color: '#62d6ea', center: [-2.2, 0, 10.2, 0], scale: 1.2, fibers: spunKlein(), orient: ident() },
  { name: '4D Möbius strip', color: '#7ee0a8', center: [-2.8, -0.6, 2.4, -0.29], scale: 1.25, disks: mobius4(), orient: mm(rot(0, 2, Math.PI / 2), rot(0, 3, 0.233)) },
];

// which module draws an entry
const kindOf = o => (o.globe ? setupEarth : o.radius ? setupGlome : o.disks ? setupMobius : o.fibers ? setupKlein3D : o.surface ? setupKlein : setupPolytope);

export function createWorld(scene, BG) {
  const WORLD = WORLD_DEFS.map(d => ({ ...d }));   // fresh entries, so a second call (a hot reload) starts clean
  for (const o of WORLD) {
    const col = new THREE.Color(o.color);
    o.mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05, flatShading: !o.radius, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    o.lineMat = new THREE.LineBasicMaterial({ color: col.clone().lerp(WHITE, 0.55) });
    o.ptMat = new THREE.PointsMaterial({ color: col.clone().lerp(WHITE, 0.4), size: 7, sizeAttenuation: false });
    // Shadow shades from dim (kata) to bright (ana)
    o.baseCol = col;
    o.dimCol = col.clone().lerp(BG, 0.72);
    o.brightCol = col.clone().lerp(WHITE, 0.3);
    o.group = new THREE.Group();
    scene.add(o.group);
    kindOf(o)(o);
  }
  return WORLD;
}
