// The 4D TV: a cabinet thick in w (in 4D, a stretched tesseract) on two legs, with a small tesseract spinning in 4D on
// its antenna. buildTV gives the page what it draws: the 3D pieces its slices are cut from (with thickSlice, like the
// cat), the 4D edges its shadow is drawn with, where the antenna tesseract sits, and where the screen is. The picture
// is the YouTube player itself, which main.js lays on the screen with CSS3DRenderer.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tesseract } from '../shapes.js';

// The cabinet's half-sizes along its own x, y, z and w; the screen, 16:9, is screenW wide and `px` pixels across.
export const TV = { half: [2.2, 1.4, 0.4, 0.7], screenW: 3.84, px: 640 };
const UP = new THREE.Vector3(0, 1, 0);

// floorY: where the floor is, in the TV's own coordinates (its legs reach down to it)
export function buildTV(floorY) {
  const [hx, hy, hz, hw] = TV.half, sw = TV.screenW, sh = sw * 9 / 16, sy = 0.06, legX = 1.75;
  const rod = (a, b, r) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()));
    return g.translate(...A.add(B).multiplyScalar(0.5).toArray());
  };
  const knob = (p, r, s = [1, 1, 1]) => new THREE.SphereGeometry(r, 14, 10).scale(...s).translate(...p);
  const T = tesseract(), corners = T.verts.slice(0, 8).map(v => [v[0] * hx, v[1] * hy, v[2] * hz]);   // the w = −1 cell: the 3D box
  const chrome = [
    ...T.edges.filter(([i, j]) => j < 8).map(([i, j]) => rod(corners[i], corners[j], 0.05)),
    ...corners.map(p => knob(p, 0.085)),
  ];
  for (const s of [-1, 1]) {
    chrome.push(rod([s * legX, -hy, 0], [s * legX, floorY + 0.04, 0], 0.06), knob([s * legX, floorY + 0.04, 0], 0.22, [1, 0.25, 1]));
    chrome.push(rod([s * 0.2, hy, -0.1], [s * 0.85, hy + 1.3, -0.1], 0.025), knob([s * 0.85, hy + 1.3, -0.1], 0.045));
  }
  // The shadow's 4D edges, each [i, j, radius]: the 4D box, the screen (a rectangle times the thickness), legs, rods.
  const verts = T.verts.map(v => [v[0] * hx, v[1] * hy, v[2] * hz, v[3] * hw]), edges = T.edges.map(([i, j]) => [i, j, 0.04]);
  const s0 = verts.length;
  for (const w of [-hw, hw]) for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) verts.push([x * sw / 2, sy + y * sh / 2, hz + 0.004, w]);
  for (let k = 0; k < 4; k++) edges.push([s0 + k, s0 + (k + 1) % 4, 0.018], [s0 + 4 + k, s0 + 4 + (k + 1) % 4, 0.018], [s0 + k, s0 + 4 + k, 0.018]);
  const line = (a, b, r) => { verts.push([...a, 0], [...b, 0]); edges.push([verts.length - 2, verts.length - 1, r]); };
  for (const s of [-1, 1]) { line([s * legX, -hy, 0], [s * legX, floorY, 0], 0.05); line([s * 0.2, hy, -0.1], [s * 0.85, hy + 1.3, -0.1], 0.022); }
  return {
    pieces: {
      panel: new THREE.BoxGeometry(2 * hx, 2 * hy, 2 * hz),
      glass: new THREE.PlaneGeometry(sw + 0.1, sh + 0.1).translate(0, sy, hz + 0.003),
      chrome: mergeBufferGeometries(chrome),
    },
    wire: { verts, edges, knobs: 16 },   // knobs on the first 16 vertices, the 4D box's corners
    antenna: [0, hy + 0.95, -0.1, 0],
    screen: { center: [0, sy, hz + 0.006], px: sw / TV.px, w: TV.px, h: TV.px * 9 / 16 },
  };
}
