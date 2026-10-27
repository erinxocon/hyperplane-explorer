uniform vec4 uQ, uCx, uCy, uCz; uniform float uR, uH, uSpin; uniform mat4 uPV; uniform vec3 uLight, uShift; uniform sampler2D uLand;
varying vec3 vW;
const float BIG = 1e9;
vec2 ellipsoid(vec3 o, vec3 d, float r) {
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - r * r;
  if (a < 1e-10) return c <= 0.0 ? vec2(-BIG, BIG) : vec2(BIG, -BIG);
  float disc = b * b - a * c;
  if (disc < 0.0) return vec2(BIG, -BIG);
  float s = sqrt(disc);
  return vec2((-b - s) / a, (-b + s) / a);
}
vec2 slab(float o, float d, float h) {
  if (abs(d) < 1e-8) return abs(o) <= h ? vec2(-BIG, BIG) : vec2(BIG, -BIG);
  float t1 = (-h - o) / d, t2 = (h - o) / d;
  return vec2(min(t1, t2), max(t1, t2));
}
// r is depth-normalized radius (0 center, 1 surface)
vec3 layer(float r, out float edge) {
  float b[4] = float[4](0.1917, 0.5462, 0.8948, 0.975);
  float fw = max(fwidth(r), 1e-4);
  edge = 0.0;
  for (int i = 0; i < 4; i++) edge = max(edge, 1.0 - smoothstep(0.0, 1.6 * fw, abs(r - b[i])));
  if (r < b[0]) return mix(vec3(1.0, 0.97, 0.82), vec3(1.0, 0.90, 0.60), r / b[0]);
  if (r < b[1]) return mix(vec3(1.0, 0.76, 0.33), vec3(0.98, 0.60, 0.20), (r - b[0]) / (b[1] - b[0]));
  if (r < b[2]) return mix(vec3(0.93, 0.44, 0.19), vec3(0.80, 0.33, 0.17), (r - b[1]) / (b[2] - b[1]));
  if (r < b[3]) return mix(vec3(0.76, 0.31, 0.17), vec3(0.62, 0.26, 0.16), (r - b[2]) / (b[3] - b[2]));
  return vec3(0.43, 0.36, 0.29);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - cameraPosition);
  vec3 roL = ro - uShift;                                // undo the stack panel's sideways shift
  vec4 o = uQ + roL.x * uCx + roL.y * uCy + roL.z * uCz; // 4D offset from Earth's center at the ray origin
  vec4 d = rd.x * uCx + rd.y * uCy + rd.z * uCz;        // 4D ray direction
  vec2 E = ellipsoid(o.xyz, d.xyz, uR);
  vec2 S = slab(o.w, d.w, uH);
  float t0 = max(E.x, S.x), t1 = min(E.y, S.y);
  bool inside = t0 < 0.0;
  t0 = max(t0, 0.0);
  if (t0 > t1) discard;
  vec3 p = ro + t0 * rd;
  vec4 X = o + t0 * d;
  vec3 col, n;
  if (!inside && E.x >= S.x) {
    // outer surface: land/ocean by direction from the center in world xyz
    n = normalize(vec3(dot(uCx.xyz, X.xyz), dot(uCy.xyz, X.xyz), dot(uCz.xyz, X.xyz)));
    vec3 v = normalize(X.xyz);
    float ct = cos(0.41), st = sin(0.41);
    v = vec3(ct * v.x - st * v.y, st * v.x + ct * v.y, v.z);       // axial tilt
    float lat = asin(clamp(v.y, -1.0, 1.0));
    float lon = atan(v.x, -v.z) - uSpin;
    float land = smoothstep(0.35, 0.65, texture2D(uLand, vec2(fract(lon / 6.2831853 + 0.5), lat / 3.1415927 + 0.5)).r);
    float al = abs(lat);
    vec3 ground = mix(vec3(0.33, 0.47, 0.25), vec3(0.62, 0.55, 0.36), smoothstep(0.25, 0.45, al) * (1.0 - smoothstep(0.55, 0.75, al)));
    vec3 sea = mix(vec3(0.07, 0.24, 0.44), vec3(0.11, 0.33, 0.55), smoothstep(0.0, 1.0, 1.0 - al));
    col = mix(sea, ground, land);
    col = mix(col, vec3(0.90, 0.93, 0.96), smoothstep(1.17, 1.27, al));
    float diff = max(dot(n, uLight), 0.0);
    col *= 0.32 + 0.85 * diff;
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col = mix(col, vec3(0.50, 0.72, 1.0), rim * 0.55);
  } else {
    // flat cut face from the w-slab: color by depth inside the planet
    n = inside ? -rd : normalize(vec3(uCx.w, uCy.w, uCz.w));
    if (dot(n, rd) > 0.0) n = -n;
    float r = length(X.xyz) / uR, edge;
    col = layer(r, edge);
    float diff = max(dot(n, uLight), 0.0);
    float glow = 1.0 - smoothstep(0.3, 0.6, r);                       // cores read as self-lit
    col *= mix(0.55 + 0.55 * diff, 1.05, glow);
    col *= 1.0 - 0.55 * edge;
  }
  vec4 clip = uPV * vec4(p, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
