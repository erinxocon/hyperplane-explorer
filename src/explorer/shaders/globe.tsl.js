// Earth's ray-caster (see globe.frag.glsl) in TSL. Each pixel's ray through the slice is mapped to 4D and intersected
// with the ball in xyz and the slab |w| ≤ h. Everything is computed and then selected, with no branches, because WGSL
// wants fwidth and texture reads outside them. Depth goes through viewZ, so it doesn't depend on the backend's clip
// space.
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs, cameraFar, cameraNear, cameraPosition, cameraViewMatrix, clamp, Discard, dot, float, Fn, fwidth, length, max, min, mix, normalize,
  pow, positionWorld, select, smoothstep, sqrt, uniform, vec2, vec3, vec4, viewZToPerspectiveDepth,
} from 'three/tsl';
import { display, earthSurface } from './earth-surface.tsl.js';

const BIG = 1e9;
const OUTSIDE = vec2(BIG, -BIG), EVERYWHERE = vec2(-BIG, BIG);

const ellipsoid = Fn(([o, d, r]) => {
  const a = dot(d, d), b = dot(o, d), c = dot(o, o).sub(r.mul(r));
  const disc = b.mul(b).sub(a.mul(c)), s = sqrt(max(disc, 0));
  const hit = vec2(b.negate().sub(s).div(a), b.negate().add(s).div(a));
  return select(a.lessThan(1e-10), select(c.lessThanEqual(0), EVERYWHERE, OUTSIDE), select(disc.lessThan(0), OUTSIDE, hit));
}).setLayout({ name: 'ellipsoid', type: 'vec2', inputs: [{ name: 'o', type: 'vec3' }, { name: 'd', type: 'vec3' }, { name: 'r', type: 'float' }] });

const slab = Fn(([o, d, h]) => {
  const t1 = h.negate().sub(o).div(d), t2 = h.sub(o).div(d);
  return select(abs(d).lessThan(1e-8), select(abs(o).lessThanEqual(h), EVERYWHERE, OUTSIDE), vec2(min(t1, t2), max(t1, t2)));
}).setLayout({ name: 'slab', type: 'vec2', inputs: [{ name: 'o', type: 'float' }, { name: 'd', type: 'float' }, { name: 'h', type: 'float' }] });

// the color of the layer at depth-normalized radius r (0 center, 1 surface); `edge` marks the lines between layers
const B = [0.1917, 0.5462, 0.8948, 0.975];
const between = (r, i, a, b) => mix(vec3(...a), vec3(...b), r.sub(i ? B[i - 1] : 0).div(B[i] - (i ? B[i - 1] : 0)));
function layer(r) {
  const fw = max(fwidth(r), 1e-4), near = b => smoothstep(0, fw.mul(1.6), abs(r.sub(b))).oneMinus();
  const edge = max(max(near(B[0]), near(B[1])), max(near(B[2]), near(B[3])));
  const col = select(r.lessThan(B[0]), between(r, 0, [1, 0.97, 0.82], [1, 0.9, 0.6]),
    select(r.lessThan(B[1]), between(r, 1, [1, 0.76, 0.33], [0.98, 0.6, 0.2]),
      select(r.lessThan(B[2]), between(r, 2, [0.93, 0.44, 0.19], [0.8, 0.33, 0.17]),
        select(r.lessThan(B[3]), between(r, 3, [0.76, 0.31, 0.17], [0.62, 0.26, 0.16]), vec3(0.43, 0.36, 0.29)))));
  return { col, edge };
}

// u is the planet's shared uniforms; material.uniforms has this panel's own: its slice (uQ) and sideways shift (uShift)
export function globeMaterial(u, land) {
  const uQ = uniform(new THREE.Vector4()), uShift = uniform(new THREE.Vector3());
  const { uCx, uCy, uCz, uR, uH, uSpin, uLight } = u;
  const ro = cameraPosition, rd = normalize(positionWorld.sub(ro)).toVar();
  const roL = ro.sub(uShift);                                              // undo the stack panel's sideways shift
  const o = uQ.add(uCx.mul(roL.x)).add(uCy.mul(roL.y)).add(uCz.mul(roL.z)).toVar();   // 4D offset from Earth's center at the ray origin
  const d = uCx.mul(rd.x).add(uCy.mul(rd.y)).add(uCz.mul(rd.z)).toVar();   // 4D ray direction
  const E = ellipsoid(o.xyz, d.xyz, uR).toVar(), S = slab(o.w, d.w, uH).toVar();
  const near = max(E.x, S.x).toVar(), t1 = min(E.y, S.y).toVar();
  const inside = near.lessThan(0), t0 = max(near, 0).toVar();
  const p = ro.add(rd.mul(t0)).toVar(), X = o.add(d.mul(t0)).toVar();

  // outer surface: land/ocean by direction from the center in world xyz
  const n = normalize(vec3(dot(uCx.xyz, X.xyz), dot(uCy.xyz, X.xyz), dot(uCz.xyz, X.xyz))).toVar();
  const rim = pow(max(dot(n, rd.negate()), 0).oneMinus(), 3);
  const outer = mix(earthSurface(land, normalize(X.xyz), uSpin).mul(max(dot(n, uLight), 0).mul(0.85).add(0.32)), vec3(0.5, 0.72, 1), rim.mul(0.55));

  // flat cut face from the w-slab: color by depth inside the planet
  const faced = select(inside, rd.negate(), normalize(vec3(uCx.w, uCy.w, uCz.w))).toVar();
  const fn = select(dot(faced, rd).greaterThan(0), faced.negate(), faced).toVar();
  const r = length(X.xyz).div(uR).toVar(), { col, edge } = layer(r);
  const glow = smoothstep(0.3, 0.6, r).oneMinus();                         // cores read as self-lit
  const cut = col.mul(mix(max(dot(fn, uLight), 0).mul(0.55).add(0.55), float(1.05), glow)).mul(edge.mul(0.55).oneMinus());

  const mat = new MeshBasicNodeMaterial({ fog: false, side: THREE.BackSide });
  mat.colorNode = Fn(() => {
    Discard(t0.greaterThan(t1));
    return display(select(inside.not().and(E.x.greaterThanEqual(S.x)), outer, cut));
  })();
  mat.depthNode = clamp(viewZToPerspectiveDepth(cameraViewMatrix.mul(vec4(p, 1)).z, cameraNear, cameraFar), 0, 1);
  mat.uniforms = { uQ, uShift };
  return mat;
}
