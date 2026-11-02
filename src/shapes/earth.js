// Earth: a 3D ball (layered) times a short w-interval, ball(radius) × [−thick, thick]. Slice and Stack draw it per pixel:
// a box proxy whose shader casts each pixel's ray through the slice, maps it to 4D (X − C = Q + p.x·R + p.y·U − p.z·F)
// and intersects the layered ball in xyz with the slab |w| ≤ h; where the slab clips first, the flat face shows the
// interior. Shadow draws its two w-caps (sphere meshes projected from 4D) joined by lines through w, like a drawn
// cylinder. o.state says how your slice meets it, for the panel.
import * as THREE from 'three';
import { add, sub, mul, dot } from '../math4d.js';
import { stackOffs } from '../hud.js';
import { local, projector } from './draw.js';
import GLOBE_VS from '../explorer/shaders/globe.vert.glsl?raw';
import GLOBE_FS from '../explorer/shaders/globe.frag.glsl?raw';
import SURF_VS from '../explorer/shaders/earth-cap.vert.glsl?raw';
import SURF_FS from '../explorer/shaders/earth-cap.frag.glsl?raw';
import EARTH_GLSL from '../explorer/shaders/earth-surface.glsl?raw';
import landMaskUrl from '../assets/land-mask.png';
import { GPU } from '../utils.js';

// On WebGPURenderer the shaders are the TSL ones, and a uniform is a TSL node, which has .value just the same.
const TSL = GPU ? await import('three/tsl') : null;
const globeTSL = GPU ? await import('../explorer/shaders/globe.tsl.js') : null, capTSL = GPU ? await import('../explorer/shaders/earth-cap.tsl.js') : null;
const param = TSL ? TSL.uniform : value => ({ value });

// directions of the lines joining the caps in Shadow
const LINKS = [];
for (const lat of [-0.75, 0, 0.75]) for (let j = 0; j < 8; j++) { const lon = j * Math.PI / 4; LINKS.push([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]); }

export function setupEarth(o) {
  const land = new THREE.TextureLoader().load(landMaskUrl);
  land.wrapS = THREE.RepeatWrapping; land.minFilter = THREE.LinearFilter; land.generateMipmaps = false;
  o.uni = {
    uCx: param(new THREE.Vector4()), uCy: param(new THREE.Vector4()), uCz: param(new THREE.Vector4()),
    uR: param(o.radius), uH: param(o.thick), uSpin: param(0), uPV: { value: new THREE.Matrix4() },
    uLight: param(new THREE.Vector3(4, 9, 6).normalize()), uLand: { value: land },
  };
  const box = new THREE.BoxGeometry(2, 2, 2);
  o.proxies = [0, 1, 2].map(() => {
    const px = new THREE.Mesh(box, globeTSL ? globeTSL.globeMaterial(o.uni, land) : new THREE.ShaderMaterial({ uniforms: { ...o.uni, uQ: { value: new THREE.Vector4() }, uShift: { value: new THREE.Vector3() } }, vertexShader: GLOBE_VS, fragmentShader: EARTH_GLSL + GLOBE_FS, side: THREE.BackSide }));
    o.group.add(px); return px;
  });
  o.caps = [0, 1].map(() => {
    const g = new THREE.SphereGeometry(1, 48, 32);
    g.setAttribute('aDir', g.getAttribute('position').clone());
    const mesh = new THREE.Mesh(g, capTSL ? capTSL.earthCapMaterial(o.uni, land) : new THREE.ShaderMaterial({ uniforms: { uLand: o.uni.uLand, uSpin: o.uni.uSpin, uLight: o.uni.uLight, uAlpha: { value: 1 }, uCenter: { value: new THREE.Vector3() } }, vertexShader: SURF_VS, fragmentShader: EARTH_GLSL + SURF_FS, side: THREE.DoubleSide }));
    o.group.add(mesh); return mesh;
  });
  o.links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8fc0ee, transparent: true, opacity: 0.7 }));
  o.group.add(o.links);

  o.build = (V, { mode, labels }) => {
    const q = sub(V.P, o.center), d = -dot(q, V.A);
    const m = o.radius * Math.hypot(V.A[0], V.A[1], V.A[2]) + o.thick * Math.abs(V.A[3]);
    o.range = [d - m, d + m];
    o.uni.uCx.value.set(...V.R); o.uni.uCy.value.set(...V.U); o.uni.uCz.value.set(...mul(V.F, -1));
    // a proxy shows the slice through P + off·A, shifted sideways by `shift`
    const setProxy = (px, off, shift) => {
      const dd = d - off, br2 = o.radius * o.radius + o.thick * o.thick - dd * dd;
      px.visible = Math.abs(dd) < m && br2 > 0;
      if (!px.visible) return false;
      px.position.copy(local(V, o.center)); px.position.x += shift;
      px.scale.setScalar(Math.sqrt(br2) * 1.02);
      px.material.uniforms.uQ.value.set(...add(q, mul(V.A, off)));
      px.material.uniforms.uShift.value.set(shift, 0, 0);
      return true;
    };
    o.proxies.forEach(px => { px.visible = false; });
    o.caps.forEach(c => { c.visible = false; }); o.links.visible = false;
    if (mode === 'slice') {
      const vis = setProxy(o.proxies[1], 0, 0);
      o.state = !vis ? 'not in slice' : Math.abs(V.A[3]) > 0.9995 ? 'whole globe' : 'sliced open';
    } else if (mode === 'stack') {
      const spacing = 2 * o.radius + 0.7;
      stackOffs(o.range).forEach((off, i) => setProxy(o.proxies[i], off, (i - 1) * spacing));
      o.stackInfo = { spacing, bottom: -o.radius - 0.35, labels };
      o.state = Math.abs(V.A[3]) > 0.9995 ? 'stacked, whole' : 'stacked, sliced';
    } else {
      shadow(V);
      o.state = 'shadow';
    }
  };
  // every frame: the camera for the ray-caster's depth, and the planet's spin
  o.tick = (camera, dt, reduceMotion) => {
    o.uni.uPV.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!reduceMotion) o.uni.uSpin.value += dt * 0.12;
  };

  // the two end caps (balls at w = ±h) projected from 4D, the one nearer the eye see-through, joined through w
  function shadow(V) {
    const proj = projector(V, o.center, 1.6 * (o.radius + o.thick));
    const capPt = (n, s) => proj(add(o.center, [n[0] * o.radius, n[1] * o.radius, n[2] * o.radius, s * o.thick]));
    const aOf = s => s * o.thick * V.A[3];
    const near = aOf(1) >= aOf(-1) ? 1 : -1;
    [1, -1].forEach((s, i) => {
      const cap = o.caps[i], dir = cap.geometry.getAttribute('aDir'), pa = cap.geometry.getAttribute('position');
      for (let k = 0; k < pa.count; k++) { const P = capPt([dir.getX(k), dir.getY(k), dir.getZ(k)], s).p; pa.setXYZ(k, P.x, P.y, P.z); }
      pa.needsUpdate = true; cap.geometry.computeBoundingSphere();
      const isNear = s === near && Math.abs(V.A[3]) > 1e-3;
      cap.material.uniforms.uCenter.value.copy(capPt([0, 0, 0], s).p);
      cap.material.uniforms.uAlpha.value = isNear ? 0.22 : 1;
      cap.material.transparent = isNear; cap.material.depthWrite = !isNear;
      cap.renderOrder = isNear ? 2 : 0;
      cap.visible = true;
    });
    const pts = [];
    for (const n of LINKS) pts.push(capPt(n, -1).p, capPt(n, 1).p);
    o.links.geometry.dispose(); o.links.geometry = new THREE.BufferGeometry().setFromPoints(pts); o.links.visible = true;
  }
}
