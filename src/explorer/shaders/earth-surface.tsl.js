// Earth's surface (see earth-surface.glsl) in TSL: the color in direction v (world xyz) from its center, land or sea
// from the mask, tilted and turned by `spin`, with ice toward the poles. globe.tsl.js and earth-cap.tsl.js do their own
// lighting. Its colors are written for the display, as in the GLSL, so `display` takes them to the linear colors TSL
// expects. WGSL wants textures read outside any branch, so callers mustn't put this inside an If.
import { abs, asin, atan, clamp, cos, fract, mix, sin, smoothstep, sRGBTransferEOTF, texture, vec2, vec3 } from 'three/tsl';

export const display = col => sRGBTransferEOTF(col);

export function earthSurface(land, dir, spin) {
  const ct = cos(0.41), st = sin(0.41);
  const v = vec3(ct.mul(dir.x).sub(st.mul(dir.y)), st.mul(dir.x).add(ct.mul(dir.y)), dir.z);   // axial tilt
  const lat = asin(clamp(v.y, -1, 1)), lon = atan(v.x, v.z.negate()).sub(spin);
  const uv = vec2(fract(lon.div(6.2831853).add(0.5)), lat.div(3.1415927).add(0.5));
  const l = smoothstep(0.35, 0.65, texture(land, uv).level(0).r), al = abs(lat);
  const ground = mix(vec3(0.33, 0.47, 0.25), vec3(0.62, 0.55, 0.36), smoothstep(0.25, 0.45, al).mul(smoothstep(0.55, 0.75, al).oneMinus()));
  const sea = mix(vec3(0.07, 0.24, 0.44), vec3(0.11, 0.33, 0.55), smoothstep(0, 1, al.oneMinus()));
  return mix(mix(sea, ground, l), vec3(0.9, 0.93, 0.96), smoothstep(1.17, 1.27, al));
}
