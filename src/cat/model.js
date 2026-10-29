// The cat from the OIIA OIIA meme: a chubby brown tabby standing on all four legs, facing you. Three.js primitives,
// merged into one indexed geometry. Each vertex also carries what the fur shader (fur.js) paints from: `part` (which
// piece it is), `anchor` (the point or value that piece's pattern is measured from), `catPos` (its own position, kept
// when Shadow moves `position`) and `shade` (Shadow's depth tint; none here).
// It faces +z with y up and its left side toward +x, centered on its middle so 4D turns spin it in place; its feet
// are at y = −HEIGHT / 2. Two things are only on one side, so a mirror image is easy to spot: its tail curls to its
// right, and its left front paw has a white sock.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HEIGHT = 2;
export const PART = { BODY: 0, HEAD: 1, LEG: 2, TAIL: 3, EAR: 4, EYE: 5, NOSE: 6, WHISKER: 7, MUZZLE: 8 };
const ZC = 0.13;   // the middle of the cat front to back, from the back of its rump to the tip of its nose

export function buildCat() {
  const parts = [], O = new THREE.Vector3(0, -HEIGHT / 2, -ZC);
  // add a piece built with its feet at y = 0: place it, tag it, and move it so the cat's middle is the origin
  const add = (geo, part, anchor = [0, 0, 0], { at = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) => {
    geo.deleteAttribute('uv');
    geo.scale(...scale).rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...at).translate(O.x, O.y, O.z);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('part', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    const anc = typeof anchor === 'function' ? anchor : () => anchor;
    geo.setAttribute('anchor', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, i) => anc(i)).flat(), 3));
    parts.push(geo);
  };
  const pt = p => [p[0] + O.x, p[1] + O.y, p[2] + O.z];   // an anchor point, moved like the pieces
  const ball = (seg = 24, rings = 16) => new THREE.SphereGeometry(1, seg, rings);
  const sides = f => { f(1); f(-1); };                    // its left (+x) and its right (−x)

  // body: a chubby loaf, with a neck into the head
  const body = [0, 0.92, -0.1];
  add(ball(40, 28), PART.BODY, pt(body), { at: body, scale: [0.6, 0.55, 0.95] });
  add(ball(28, 20), PART.BODY, pt(body), { at: [0, 1.13, 0.62], scale: [0.4, 0.4, 0.36] });
  // head, wide in the cheeks; a cream muzzle and chin, a nose
  const head = [0, 1.36, 0.9];
  add(ball(36, 26), PART.HEAD, pt(head), { at: head, scale: [0.5, 0.44, 0.42] });
  sides(s => add(ball(), PART.HEAD, pt(head), { at: [0.21 * s, 1.25, 1.02], scale: [0.23, 0.19, 0.22] }));
  sides(s => add(ball(), PART.MUZZLE, pt(head), { at: [0.085 * s, 1.21, 1.24], scale: [0.105, 0.1, 0.1] }));
  add(ball(), PART.MUZZLE, pt(head), { at: [0, 1.11, 1.17], scale: [0.085, 0.08, 0.085] });
  add(ball(16, 12), PART.NOSE, pt(head), { at: [0, 1.31, 1.31], scale: [0.055, 0.04, 0.035] });
  // eyes: the shader draws the iris and pupil about each eye's center
  sides(s => { const c = [0.185 * s, 1.45, 1.25]; add(ball(24, 18), PART.EYE, pt(c), { at: c, scale: [0.1, 0.095, 0.07] }); });
  // ears: furry outsides, pink insides
  sides(s => {
    add(new THREE.ConeGeometry(0.17, 0.34, 20), PART.HEAD, pt(head), { at: [0.27 * s, 1.76, 0.82], rot: [-0.15, 0, -0.4 * s] });
    add(new THREE.ConeGeometry(0.115, 0.25, 20), PART.EAR, pt(head), { at: [0.265 * s, 1.745, 0.875], rot: [-0.15, 0, -0.4 * s] });
  });
  // whiskers
  sides(s => [-0.03, 0.01, 0.05].forEach((dy, i) => {
    const a = new THREE.Vector3(0.13 * s, 1.22, 1.3), b = new THREE.Vector3(0.6 * s, 1.22 + dy * 3, 1.22 - i * 0.04);
    const g = new THREE.CylinderGeometry(0.006, 0.006, a.distanceTo(b), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    add(g, PART.WHISKER, [0, 0, 0], { at: a.clone().add(b).multiplyScalar(0.5).toArray() });
  }));
  // legs and paws, white toes; the anchor's x is how high the white goes (the left front leg wears a sock)
  for (const [x, z, r, sock] of [[0.29, 0.5, 0.13, true], [-0.29, 0.5, 0.13, false], [0.32, -0.72, 0.15, false], [-0.32, -0.72, 0.15, false]]) {
    const white = [(sock ? 0.34 : 0.1) + O.y, 0, 0];
    add(new THREE.CylinderGeometry(r, r - 0.015, 0.62, 18), PART.LEG, white, { at: [x, 0.3, z] });
    add(ball(20, 12), PART.LEG, white, { at: [x, 0.06, z + 0.06], scale: [r + 0.005, 0.07, r + 0.045] });
  }
  // tail: up behind, curling to its right (−x), thinning to a dark tip; the anchor's x runs 0 → 1 along it
  const path = new THREE.CatmullRomCurve3([[0, 1.05, -0.95], [-0.04, 1.28, -1.25], [-0.14, 1.62, -1.4], [-0.34, 1.9, -1.33], [-0.52, 2, -1.12]].map(p => new THREE.Vector3(...p)));
  const SEG = 48, RAD = 10, tail = new THREE.TubeGeometry(path, SEG, 0.085, RAD, false), tp = tail.getAttribute('position'), c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < tp.count; i++) {
    const t = Math.floor(i / (RAD + 1)) / SEG;
    path.getPointAt(t, c);
    v.fromBufferAttribute(tp, i).sub(c).multiplyScalar(1 - 0.4 * t).add(c);
    tp.setXYZ(i, v.x, v.y, v.z);
  }
  tail.computeVertexNormals();
  add(tail, PART.TAIL, i => [Math.floor(i / (RAD + 1)) / SEG, 0, 0]);
  add(ball(14, 10), PART.TAIL, [1, 0, 0], { at: path.getPointAt(1).toArray(), scale: [0.052, 0.052, 0.052] });

  const g = mergeBufferGeometries(parts);
  g.setAttribute('catPos', g.getAttribute('position').clone());
  g.setAttribute('shade', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill([0, 0, 0, 1]).flat(), 4));
  g.computeBoundingSphere();
  return g;
}
