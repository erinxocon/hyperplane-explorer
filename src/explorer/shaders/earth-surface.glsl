// Earth's surface color in direction v (world xyz) from its center: land or sea from the mask, tilted and turned by
// `spin`, with ice toward the poles. Prepended to globe.frag and earth-cap.frag, which each do their own lighting.
vec3 earthSurface(sampler2D land, vec3 v, float spin) {
  float ct = cos(0.41), st = sin(0.41);
  v = vec3(ct * v.x - st * v.y, st * v.x + ct * v.y, v.z);       // axial tilt
  float lat = asin(clamp(v.y, -1.0, 1.0)), lon = atan(v.x, -v.z) - spin;
  float l = smoothstep(0.35, 0.65, texture2D(land, vec2(fract(lon / 6.2831853 + 0.5), lat / 3.1415927 + 0.5)).r);
  float al = abs(lat);
  vec3 ground = mix(vec3(0.33, 0.47, 0.25), vec3(0.62, 0.55, 0.36), smoothstep(0.25, 0.45, al) * (1.0 - smoothstep(0.55, 0.75, al)));
  vec3 sea = mix(vec3(0.07, 0.24, 0.44), vec3(0.11, 0.33, 0.55), smoothstep(0.0, 1.0, 1.0 - al));
  return mix(mix(sea, ground, l), vec3(0.90, 0.93, 0.96), smoothstep(1.17, 1.27, al));
}
