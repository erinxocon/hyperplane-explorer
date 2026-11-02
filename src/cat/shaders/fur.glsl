// The fur's coat, painted per pixel (fur.js explains it). fur.js puts the model's landmarks ahead of this as constants:
// HEAD, HEAD_R, EYE, CHEST, EYE_R, BODY_Y, BACK_Y, LEG_SPLIT, FEET, TOE, SOCK.
uniform vec3 cDark, cBase, cLight, cCream, cWhite, cIris, cPupil, cNose, cEar;
varying vec3 vCat, vAnchor; varying float vPart, vCatW; varying vec4 vShade, vRegion;
const vec3 WDIR = vec3(0.62, -0.47, 0.63);   // which way w moves the noise, along no axis so no pattern just slides
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.1) + 0.0625 * vnoise(p * 8.3); }
// 1 on a stripe: the top w of each period of sin(phase), softly edged
float band(float phase, float w) { return smoothstep(1.0 - w - 0.08, 1.0 - w + 0.08, 0.5 + 0.5 * sin(phase)); }
// two turned lattices for the fine grain, so neither grid shows
const mat3 SKEW = mat3(0.8, 0.36, -0.48, -0.6, 0.48, -0.64, 0.0, 0.8, 0.6), SKEW2 = mat3(0.36, -0.8, 0.48, 0.93, 0.36, -0.07, -0.12, 0.48, 0.87);
float within(float x, float a, float b, float e) { return smoothstep(a - e, a + e, x) * (1.0 - smoothstep(b - e, b + e, x)); }

vec3 eyeColor(vec3 q, vec3 anc) {   // a pale iris, a big round pupil, a dark rim, heavy upper lids, a highlight
  float side = sign(anc.x);
  vec3 fwd = normalize(vec3(side * 0.3, 0.0, 1.0)), ex = normalize(cross(vec3(0.0, 1.0, 0.0), fwd)), ey = cross(fwd, ex);
  vec3 d = normalize(q - anc);
  vec2 uv = vec2(dot(d, ex), dot(d, ey));
  float out_ = uv.x * side, r = length(uv), front = step(0.0, dot(d, fwd));
  vec3 col = mix(cIris * 1.08, cIris * 0.72, smoothstep(0.2, 0.62, r));
  col = mix(col, cPupil, 1.0 - smoothstep(0.4, 0.44, length(uv * vec2(1.0, 0.92))));
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.055, 0.085, length(uv - vec2(-0.17 * side, 0.22))));
  col = mix(col, cPupil, smoothstep(0.63, 0.68, r));                   // the dark rim
  float lid = 0.6 - 0.1 * out_;                                         // drooping toward the outer corner
  col = mix(col, cPupil, smoothstep(lid - 0.07, lid - 0.02, uv.y));
  col = mix(col, cBase, smoothstep(lid + 0.01, lid + 0.05, uv.y));
  return mix(cPupil, col, front);
}

vec3 furColor(vec3 q, vec4 reg, float tailT, float w) {
  vec3 qn = q + w * WDIR;   // where the noise is read: 4D, as the point moved by its own w
  float n = fbm(qn * 4.5), j = 2.0 * (n - 0.5), tick = 0.5 * (vnoise(SKEW * qn * 70.0) + vnoise(SKEW2 * qn * 70.0)), streak = vnoise(qn * vec3(30.0, 260.0, 30.0));
  vec3 col = mix(cBase, cLight, smoothstep(0.35, 0.85, 0.75 * n + 0.3 * tick));
  float wHead = reg.x, wLeg = reg.y, wTail = reg.z, wEar = reg.w, wBody = max(0.0, 1.0 - wHead - wLeg - wTail - wEar);
  vec3 u = (q - HEAD) / HEAD_R;                // the head, as a unit ball
  float ax = abs(q.x), aux = abs(u.x);

  // body: a dark spine line, thin mackerel stripes running down the flanks, faint necklaces, a pale bib and belly
  float spine = (1.0 - smoothstep(0.04, 0.1, ax + 0.03 * j)) * smoothstep(BACK_Y - 0.3, BACK_Y - 0.12, q.y);
  float mack = band((q.z + 0.3 * (BACK_Y - q.y)) * 34.0 + 30.0 * w + 1.1 * sin(q.y * 9.0 + q.x * 6.0) + 2.4 * j, 0.24);
  mack *= smoothstep(BODY_Y - 0.32, BODY_Y - 0.02, q.y) * (0.45 + 0.55 * smoothstep(0.3, 0.6, fbm(qn * 9.0 + 3.0)));
  float bibMask = 1.0 - smoothstep(0.5, 1.0, length((q - CHEST) / vec3(0.2, 0.4, 0.3)));
  float necklace = 0.4 * band(length(q - HEAD) * 30.0 + 20.0 * w + j, 0.24) * within(length(q - HEAD), 0.42, 0.7, 0.05) * bibMask;
  float darkBody = max(max(spine, mack * (1.0 - 0.8 * bibMask)), necklace);
  float creamBody = 0.6 * bibMask * (1.0 - necklace) + 0.45 * smoothstep(BODY_Y - 0.2, BODY_Y - 0.42, q.y);

  // head: forehead lines running back over the crown, cheek stripes, a line from each eye, pale rims, a white muzzle
  float fore = band(u.x * 22.0 + 16.0 * w + 0.5 * j, 0.22) * smoothstep(0.32, 0.55, u.y) * (1.0 - smoothstep(0.55, 0.75, aux));
  float cheek = band((u.y - 0.35 * u.z) * 18.0 + 14.0 * w + 0.6 * j, 0.22) * smoothstep(0.6, 0.85, aux) * within(u.y, -0.6, 0.05, 0.1);
  vec3 e = vec3(abs(q.x), q.y, q.z) - EYE;
  float liner = (1.0 - smoothstep(0.008, 0.016, abs(e.y + 0.3 * max(e.x, 0.0) + 0.01))) * within(e.x, EYE_R * 0.8, EYE_R * 1.5, 0.015) * step(e.z, 0.02);
  float rim = 1.0 - smoothstep(1.05, 1.35, length(e / vec3(EYE_R, EYE_R, EYE_R * 1.4)));
  float muzzle = smoothstep(0.55, 0.75, u.z) * (1.0 - smoothstep(-0.32, -0.18, u.y)) * (1.0 - smoothstep(0.42, 0.55, aux));
  float chin = (1.0 - smoothstep(-0.62, -0.5, u.y)) * smoothstep(0.1, 0.4, u.z);
  float back = smoothstep(0.75, 1.15, u.y) * (1.0 - smoothstep(0.0, 0.4, u.z + 0.2));   // the backs of the ears are darker
  float darkHead = max(max(fore, cheek), max(liner, 0.55 * back)) * (1.0 - muzzle);
  float creamHead = max(0.5 * rim * (1.0 - liner), max(muzzle, chin));
  // the mouth: a short line down from the nose and two curves out from it
  float mouthY = HEAD.y - HEAD_R.y * 0.62, mx = abs(q.x);
  float mouth = (1.0 - smoothstep(0.004, 0.008, mx)) * within(q.y, mouthY, HEAD.y - HEAD_R.y * 0.33, 0.004);
  mouth = max(mouth, (1.0 - smoothstep(0.004, 0.008, abs(q.y - mouthY + 0.6 * mx - 10.0 * mx * mx))) * (1.0 - smoothstep(0.05, 0.065, mx)));
  mouth *= smoothstep(0.6, 0.8, u.z);

  // legs: faint bars, white toes (higher on the left front's sock); tail: rings and a dark tip
  float darkLeg = 0.65 * band(q.y * 30.0 + 30.0 * w + j, 0.3) * smoothstep(0.08, 0.16, ax - 0.1);
  float white = 1.0 - smoothstep(-0.02, 0.02, q.y - FEET - mix(TOE, SOCK, step(0.0, q.x) * step(LEG_SPLIT, q.z)) + 0.03 * j);
  float darkTail = max(band(tailT * 24.0 + 40.0 * w + j, 0.4), smoothstep(0.84, 0.95, tailT));

  float dark = wBody * darkBody + wHead * darkHead + wLeg * darkLeg + wTail * darkTail;
  float cream = wBody * creamBody + wHead * creamHead;
  col = mix(col, cDark, clamp(dark, 0.0, 1.0) * 0.85);
  col = mix(col, mix(cCream, cWhite, wHead * muzzle), clamp(cream, 0.0, 1.0));
  col = mix(col, cWhite, wLeg * white);
  col = mix(col, cDark, 0.75 * wHead * mouth);
  col = mix(col, mix(cEar * 0.85, cCream, 0.35 * smoothstep(0.5, 0.9, streak)), wEar);   // pink, with pale tufts
  return col * (0.9 + 0.2 * tick);
}

vec3 catColor(vec3 q, float part, vec3 anc, vec4 reg, float w) {
  if (part > 2.5) return cWhite;                                             // whiskers
  if (part > 1.5) return mix(cNose * 0.62, cNose, smoothstep(-0.6, 0.2, (q.y - anc.y) / 0.034));   // nose, darker below
  if (part > 0.5) return eyeColor(q, anc);
  return furColor(q, reg, anc.x, w);
}
