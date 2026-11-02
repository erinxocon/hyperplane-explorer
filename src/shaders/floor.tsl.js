// The floor (see floor.frag.glsl) in TSL: the 4D hyperplane y = floorY cut by your slice, checkered on world (x, z, w).
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { uniform, positionWorld, vec2, vec3, floor, mod, mix, abs, fract, max, smoothstep, length } from 'three/tsl';
import * as THREE from 'three';

// colors: { cA, cB, cW, cBg } as THREE.Colors, fade: [from, to, center z]. material.uniforms has what changes.
export function floorMaterial({ cA, cB, cW, cBg }, fade) {
  const uP = uniform(new THREE.Vector4()), uR = uniform(new THREE.Vector4()), uU = uniform(new THREE.Vector4()), uF = uniform(new THREE.Vector4());
  const uFade = uniform(new THREE.Vector3(...fade)), pos = positionWorld;
  const X = uP.add(uR.mul(pos.x)).add(uU.mul(pos.y)).sub(uF.mul(pos.z));
  const q = floor(vec3(X.x, X.z, X.w));
  const tiles = mix(uniform(cA), uniform(cB), mod(q.x.add(q.y).add(q.z), 2));
  const grad = length(vec2(uR.w, uF.w));      // tilted into w: mark where the floor crosses integer w
  const wl = abs(fract(X.w.add(0.5)).sub(0.5)).div(max(grad, 1e-3));
  const lines = smoothstep(0, 0.07, wl).oneMinus().mul(smoothstep(0.02, 0.12, grad)).mul(0.9);
  const col = mix(tiles, uniform(cW), lines);
  const away = smoothstep(uFade.x, uFade.y, length(pos.xz.sub(vec2(0, uFade.z)))).oneMinus();
  const mat = new MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = mix(uniform(cBg), col, away);
  mat.uniforms = { uP, uR, uU, uF };
  return mat;
}
