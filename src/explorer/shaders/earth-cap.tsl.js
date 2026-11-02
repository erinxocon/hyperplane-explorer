// An end cap of Earth in Shadow (see earth-cap.frag.glsl) in TSL: the surface by the sphere's own direction aDir, lit by
// the direction from the projected center.
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, dot, max, normalize, positionGeometry, uniform, vec3 } from 'three/tsl';
import { display, earthSurface } from './earth-surface.tsl.js';

// u is the planet's shared uniforms; material.uniforms has this cap's own
export function earthCapMaterial(u, land) {
  const uAlpha = uniform(1), uCenter = uniform(new THREE.Vector3());
  const vDir = normalize(attribute('aDir', 'vec3'));
  const vN = normalize(positionGeometry.sub(uCenter).toVarying());
  const light = max(dot(vN, u.uLight), 0).mul(0.8).add(0.35);
  const mat = new MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  mat.colorNode = display(earthSurface(land, vDir, u.uSpin).mul(light));
  mat.opacityNode = uAlpha;
  mat.uniforms = { uAlpha, uCenter };
  return mat;
}
