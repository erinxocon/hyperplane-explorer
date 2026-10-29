// The fur shader: a standard (lit) material whose color is painted per pixel from the cat's own coordinates, so the
// pattern stays on the cat however it is cut, turned or projected. Brown mackerel tabby, like the meme cat: dark
// stripes ringing the body, legs and tail, a dark line down the spine, the lines of a tabby's forehead and cheeks,
// a cream muzzle, chest and eye rims, white toes, green-gold eyes. Value noise breaks the stripes up and adds grain.
// Reads the attributes set in model.js; `shade` is Shadow's tint (color·a + rgb).
import * as THREE from 'three';

const FUR = /* glsl */ `
uniform vec3 cDark, cBase, cLight, cCream, cWhite, cIris, cPupil, cNose, cEar;
varying vec3 vCat, vAnchor; varying float vPart; varying vec4 vShade;
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.1) + 0.0625 * vnoise(p * 8.3); }
// 1 on a stripe: the top w of each period of sin(phase), softly edged
float band(float phase, float w) { return smoothstep(1.0 - w - 0.1, 1.0 - w + 0.1, 0.5 + 0.5 * sin(phase)); }
vec3 furColor(vec3 q, float part, vec3 anc) {
  float n = fbm(q * 5.0), grain = vnoise(q * 70.0), j = 2.2 * (n - 0.5);
  if (part > 4.5 && part < 5.5) {          // eye: a big round-ish pupil in a green-gold iris, a dark rim, a highlight
    vec3 d = normalize(q - anc), fwd = normalize(vec3(sign(anc.x) * 0.3, 0.06, 1.0));
    vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), fwd)), ey = cross(fwd, ex);
    vec2 uv = vec2(dot(d, ex), dot(d, ey));
    float r = length(uv), front = step(0.0, dot(d, fwd));
    vec3 col = mix(cPupil * 1.4, mix(cIris, cIris * 0.65, smoothstep(0.25, 0.6, r)), front * (1.0 - smoothstep(0.6, 0.66, r)));
    col = mix(col, cPupil, front * (1.0 - smoothstep(0.27, 0.31, length(uv * vec2(1.15, 0.95)))));
    return mix(col, vec3(1.0), front * (1.0 - smoothstep(0.07, 0.1, length(uv - vec2(-0.17, 0.2)))));
  }
  if (part > 5.5 && part < 6.5) return cNose;
  if (part > 6.5 && part < 7.5) return cWhite;
  if (part > 7.5) return cCream * (0.9 + 0.15 * grain);
  if (part > 3.5) return cEar * (0.85 + 0.2 * n);
  vec3 col = mix(cBase, cLight, smoothstep(0.42, 0.72, n)), rel = q - anc;
  float dark = 0.0, cream = 0.0;
  if (part < 0.5) {                        // body: rings round the barrel, the spine line, a pale chest and belly
    dark = band(rel.z * 9.5 + 1.1 * sin(rel.y * 3.5 + rel.x * 2.0) + 1.4 * j, 0.32) * smoothstep(-0.35, 0.05, rel.y);
    dark = max(dark, (1.0 - smoothstep(0.06, 0.15, abs(rel.x))) * smoothstep(0.3, 0.48, rel.y));
    cream = smoothstep(0.55, 0.85, rel.z + 0.3 * (n - 0.5)) * (1.0 - smoothstep(-0.05, 0.25, rel.y)) + 0.5 * smoothstep(-0.25, -0.45, rel.y);
  } else if (part < 1.5) {                 // head: forehead lines, crown stripes, cheek bars, pale eye rims and chin
    float fore = band(rel.x * 30.0 + j, 0.3) * smoothstep(0.1, 0.2, rel.y) * smoothstep(-0.05, 0.15, rel.z);
    float crown = band(rel.x * 20.0 + j, 0.36) * smoothstep(0.15, 0.3, rel.y) * (1.0 - smoothstep(-0.05, 0.1, rel.z));
    float cheek = band(rel.y * 32.0 - abs(rel.x) * 6.0 + j, 0.3) * smoothstep(0.17, 0.26, abs(rel.x)) * (1.0 - smoothstep(0.02, 0.1, rel.y)) * smoothstep(-0.2, -0.12, rel.y);
    dark = max(max(fore, crown), cheek);
    float eye = min(distance(rel, vec3(0.185, 0.09, 0.35)), distance(rel, vec3(-0.185, 0.09, 0.35)));
    cream = max(0.45 * (1.0 - smoothstep(0.11, 0.17, eye)), smoothstep(0.15, 0.3, rel.z) * (1.0 - smoothstep(-0.12, -0.04, rel.y)));
  } else if (part < 2.5) {                 // legs: rings, white toes (higher on the sock)
    dark = 0.8 * band(q.y * 13.0 + j, 0.36);
    cream = 1.0 - smoothstep(anc.x - 0.03, anc.x + 0.03, q.y + 0.04 * (n - 0.5));
    return mix(mix(col, cDark, dark * 0.9), cWhite, cream) * (0.88 + 0.24 * grain);
  } else {                                 // tail: rings and a dark tip
    dark = max(band(anc.x * 26.0 + j, 0.42), smoothstep(0.84, 0.95, anc.x));
  }
  col = mix(col, cDark, dark * 0.9);
  return mix(col, cCream, clamp(cream, 0.0, 1.0)) * (0.88 + 0.24 * grain);
}
`;

// colors: { dark, base, light, cream, white, iris, pupil, nose, ear } as CSS color strings
export function furMaterial(colors, params = {}) {
  const uniforms = Object.fromEntries(Object.entries(colors).map(([k, v]) => ['c' + k[0].toUpperCase() + k.slice(1), { value: new THREE.Color(v) }]));
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.6, ...params });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 catPos, anchor; attribute float part; attribute vec4 shade;\nvarying vec3 vCat, vAnchor; varying float vPart; varying vec4 vShade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCat = catPos; vAnchor = anchor; vPart = part; vShade = shade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FUR)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( furColor( vCat, vPart, vAnchor ) * vShade.a + vShade.rgb, opacity );');
  };
  m.customProgramCacheKey = () => 'cat-fur';
  return m;
}
