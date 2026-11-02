// The fur shader: a standard (lit) material whose color is painted per pixel from the cat's own coordinates, so the
// pattern stays on the cat however it is cut, turned or projected. Ethel's coat: a cool grey-brown mackerel tabby,
// finely ticked, with thin dark stripes running down from a dark spine line, rings on the legs and tail, the lines of
// a tabby's forehead running back over the crown, a dark line from each eye's outer corner, pale eye rims, a white
// muzzle and chin, a pale bib and belly, white toes, pink inside the ears, pale yellow-green eyes under heavy lids.
// Value noise breaks the stripes up and adds grain. The coat is a 4D pattern: the noise is sampled at the point moved
// along WDIR by its own w, and every family of stripes has a w term in its phase, so stepping ana or kata slides the
// stripes and changes the grain. All of that is nothing at w = 0, where the coat is the 3D one; the markings (muzzle,
// bib, toes, sock) stay put. Reads the attributes and landmarks (LAND) from model.js; `shade` is Shadow's tint
// (color·a + rgb).
import * as THREE from 'three';
import { LAND } from './model.js';
import { GPU } from '../utils.js';
import FUR_GLSL from './shaders/fur.glsl?raw';

const furTSL = GPU ? await import('./shaders/fur.tsl.js') : null;

const v3 = a => `vec3(${a.map(x => x.toFixed(4)).join(', ')})`, f1 = x => x.toFixed(4);
const FUR = `
const vec3 HEAD = ${v3(LAND.head)}, HEAD_R = ${v3(LAND.headR)}, EYE = ${v3(LAND.eye.map(Math.abs))}, CHEST = ${v3(LAND.chest)};
const float EYE_R = ${f1(LAND.eyeR)}, BODY_Y = ${f1(LAND.bodyY)}, BACK_Y = ${f1(LAND.backY)}, LEG_SPLIT = ${f1(LAND.legSplit)};
const float FEET = ${f1(LAND.feet)}, TOE = ${f1(LAND.toe)}, SOCK = ${f1(LAND.sock)};
` + FUR_GLSL;

// colors: { dark, base, light, cream, white, iris, pupil, nose, ear } as CSS color strings
export function furMaterial(colors, params = {}) {
  if (furTSL) return furTSL.furMaterial(colors, LAND, params);
  const uniforms = Object.fromEntries(Object.entries(colors).map(([k, v]) => ['c' + k[0].toUpperCase() + k.slice(1), { value: new THREE.Color(v) }]));
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: 0.6, ...params });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 catPos, anchor; attribute float part, catW; attribute vec4 shade, region;\nvarying vec3 vCat, vAnchor; varying float vPart, vCatW; varying vec4 vShade, vRegion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCat = catPos; vAnchor = anchor; vPart = part; vCatW = catW; vShade = shade; vRegion = region;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FUR)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( catColor( vCat, vPart, vAnchor, vRegion, vCatW ) * vShade.a + vShade.rgb, opacity );');
  };
  m.customProgramCacheKey = () => 'cat-fur';
  return m;
}
