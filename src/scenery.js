// Scene pieces shared by the explorer and the cat page: the 4D floor, your marker, and Shadow's depth shading and tubes.
import * as THREE from 'three';
import { GPU } from './utils.js';
import FLOOR_VS from './shaders/floor.vert.glsl?raw';
import FLOOR_FS from './shaders/floor.frag.glsl?raw';

const floorTSL = GPU ? await import('./shaders/floor.tsl.js') : null;

// A CSS custom property from :root, such as a color token from styles.css.
export const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Floor: the 4D hyperplane y = floorY, cut by your slice. Checker is on world (x, z, w), so the tiles shift as you move
// ana/kata or rotate the slice. It fades out from fade[0] to fade[1] around (0, fade[2]) in the scene's x–z.
export function createFloor(bg, fade) {
  const colors = { cA: new THREE.Color(tok('--floor-a')), cB: new THREE.Color(tok('--floor-b')), cW: new THREE.Color(tok('--floor-w')), cBg: bg };
  const mat = floorTSL ? floorTSL.floorMaterial(colors, fade) : new THREE.ShaderMaterial({
    uniforms: {
      uP: { value: new THREE.Vector4() }, uR: { value: new THREE.Vector4() }, uU: { value: new THREE.Vector4() }, uF: { value: new THREE.Vector4() },
      cA: { value: colors.cA }, cB: { value: colors.cB }, cW: { value: colors.cW }, cBg: { value: bg }, uFade: { value: new THREE.Vector3(...fade) },
    },
    vertexShader: FLOOR_VS,
    fragmentShader: FLOOR_FS,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat);
  mesh.rotation.x = -Math.PI / 2;
  return {
    mesh,
    // the floor stays the plane where world y = floorY; as volume view levels the slice it drops away and hides
    update(V, floorY) {
      const cu = V.U[1], u = mat.uniforms;
      mesh.visible = cu > 0.05;
      mesh.position.y = (floorY - V.P[1]) / Math.max(cu, 0.05);
      u.uP.value.set(...V.P); u.uR.value.set(...V.R); u.uU.value.set(...V.U); u.uF.value.set(...V.F);
    },
  };
}

// You, at the origin of the scene, with your R / U / F axes.
export function createMarker() {
  const me = new THREE.Group();
  me.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc4a7ff, emissive: 0x3a2a66, roughness: 0.4 })));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.9, 0xe0857a, 0.18, 0.1));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0x9bd59b, 0.18, 0.1));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.2, 0x8fb5ff, 0.2, 0.11));
  return me;
}

// Shadow's depth cue: brightness runs dim -> bright with t; the far (kata) end also leans cool and the near (ana) end
// warm. The tint shifts hue only: the result is rescaled to the untinted luma so the brightness cue is kept.
// depthTint(t) gives that tint and how far to lean into it.
export const TINT = 0.3;
let tints = null;   // read on first use, once the page's styles are in
export const depthTint = t => {
  tints ||= [new THREE.Color(tok('--kata')), new THREE.Color(tok('--ana'))];
  return { color: tints[+(t >= 0.5)], amount: TINT * Math.abs(2 * t - 1) };
};
export const luma = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
export function depthShade(out, dim, bright, t) {
  t = Math.min(1, Math.max(0, t));
  out.copy(dim).lerp(bright, t);
  const l0 = luma(out), { color, amount } = depthTint(t);
  out.lerp(color, amount);
  const l1 = luma(out);
  if (l1 > 0) out.multiplyScalar(l0 / l1);
  return out.setRGB(Math.min(1, out.r), Math.min(1, out.g), Math.min(1, out.b));
}

// Instance matrices for a unit open cylinder (height along y) from a to b with radius r, and a unit sphere at p.
// Both return a shared matrix, to be copied straight into an InstancedMesh.
const _o = new THREE.Object3D(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
export function tubeMatrix(a, b, r) {
  const len = a.distanceTo(b);
  _o.position.copy(a).add(b).multiplyScalar(0.5);
  if (len > 1e-6) _o.quaternion.setFromUnitVectors(_up, _v.subVectors(b, a).normalize()); else _o.quaternion.identity();
  _o.scale.set(r, Math.max(len, 1e-4), r); _o.updateMatrix();
  return _o.matrix;
}
export function knobMatrix(p, r) {
  _o.position.copy(p); _o.quaternion.identity(); _o.scale.setScalar(r); _o.updateMatrix();
  return _o.matrix;
}
