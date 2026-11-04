// Shadow's projection of a layer of the cat, per vertex (slice4d.js explains the normal; shadowVertex there is the same
// math in JS, and is what the unit tests check). Takes position and catW as the layer's 4D point; sets where it lands,
// its normal and its depth tint.
uniform mat4 uG;
uniform vec3 uAt, uKata, uAna;
uniform float uEye, uHalf, uTint;
attribute vec3 biA, biB;   // the vertex's bivector: e01 e02 e03, and e12 e13 e23
vec4 shadowQ;
float shadowK;
vec3 shadowNormal(vec4 p) {
  shadowQ = uG * p;
  float gap = uEye - shadowQ.w;
  shadowK = uEye / max(0.3 * uEye, gap);
  float slope = gap > 0.3 * uEye ? shadowK / uEye : 0.0;
  vec3 c0 = uG[0].xyz + slope * shadowQ.xyz * uG[0].w, c1 = uG[1].xyz + slope * shadowQ.xyz * uG[1].w;
  vec3 c2 = uG[2].xyz + slope * shadowQ.xyz * uG[2].w, c3 = uG[3].xyz + slope * shadowQ.xyz * uG[3].w;
  vec3 n = biA.x * cross(c0, c1) + biA.y * cross(c0, c2) + biA.z * cross(c0, c3) + biB.x * cross(c1, c2) + biB.y * cross(c1, c3) + biB.z * cross(c2, c3);
  return dot(n, n) < 1e-12 ? vec3(0.0, 0.0, 1.0) : n;   // a vertex with no triangles of its own isn't drawn
}
// dim and tinted kata, bright and tinted ana: color·a + rgb, as in depthTint (scenery.js)
vec4 shadowShade() {
  float t = clamp((shadowQ.w / uHalf + 1.0) / 2.0, 0.0, 1.0), lum = 0.55 + 0.6 * t, m = uTint * abs(2.0 * t - 1.0);
  return vec4((t >= 0.5 ? uAna : uKata) * m * lum, (1.0 - m) * lum);
}
