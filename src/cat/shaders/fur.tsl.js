// The fur (see fur.glsl, whose comments explain the coat) in TSL: a lit standard material painted per pixel from the
// cat's own coordinates. WGSL refuses a smoothstep with its edges reversed, so those are written 1 − smoothstep.
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs, attribute, clamp, cross, dot, float, floor, Fn, fract, If, length, mat3, max, mix, normalize, sign, sin, smoothstep, step, vec2, vec3,
} from 'three/tsl';

const f = (name, inputs, type, fn) => Fn(fn).setLayout({ name, type, inputs: Object.entries(inputs).map(([n, t]) => ({ name: n, type: t })) });
const under = (a, b, x) => smoothstep(a, b, x).oneMinus();   // 1 below a, 0 above b

const hash3 = f('hash3', { p: 'vec3' }, 'float', ([p]) => {
  const q = fract(p.mul(0.3183099).add(vec3(0.71, 0.113, 0.419))).mul(17).toVar();
  return fract(q.x.mul(q.y).mul(q.z).mul(q.x.add(q.y).add(q.z)));
});
const vnoise = f('vnoise', { x: 'vec3' }, 'float', ([x]) => {
  const i = floor(x).toVar(), t = fract(x).toVar(), s = t.mul(t).mul(t.mul(-2).add(3)).toVar();
  const at = (a, b, c) => hash3(i.add(vec3(a, b, c)));
  return mix(mix(mix(at(0, 0, 0), at(1, 0, 0), s.x), mix(at(0, 1, 0), at(1, 1, 0), s.x), s.y),
    mix(mix(at(0, 0, 1), at(1, 0, 1), s.x), mix(at(0, 1, 1), at(1, 1, 1), s.x), s.y), s.z);
});
const fbm = f('fbm', { p: 'vec3' }, 'float', ([p]) =>
  vnoise(p).mul(0.5).add(vnoise(p.mul(2.03)).mul(0.25)).add(vnoise(p.mul(4.1)).mul(0.125)).add(vnoise(p.mul(8.3)).mul(0.0625)));
const band = f('band', { phase: 'float', width: 'float' }, 'float', ([phase, width]) =>
  smoothstep(width.oneMinus().sub(0.08), width.oneMinus().add(0.08), sin(phase).mul(0.5).add(0.5)));
const within = f('within', { x: 'float', a: 'float', b: 'float', e: 'float' }, 'float', ([x, a, b, e]) =>
  smoothstep(a.sub(e), a.add(e), x).mul(under(b.sub(e), b.add(e), x)));

const SKEW = mat3(0.8, 0.36, -0.48, -0.6, 0.48, -0.64, 0, 0.8, 0.6), SKEW2 = mat3(0.36, -0.8, 0.48, 0.93, 0.36, -0.07, -0.12, 0.48, 0.87);
const WDIR = vec3(0.62, -0.47, 0.63);

// colors: { dark, base, light, cream, white, iris, pupil, nose, ear } as CSS color strings; LAND: the model's landmarks
function catColorNode(colors, LAND) {
  // constants: they never change, and uniforms inside named functions came out under another material's names
  const c = Object.fromEntries(Object.entries(colors).map(([k, v]) => { const { r, g, b } = new THREE.Color(v); return [k, vec3(r, g, b)]; }));
  const HEAD = vec3(...LAND.head), HEAD_R = vec3(...LAND.headR), EYE = vec3(...LAND.eye.map(Math.abs)), CHEST = vec3(...LAND.chest);
  const { eyeR: EYE_R, bodyY: BODY_Y, backY: BACK_Y, legSplit: LEG_SPLIT, feet: FEET, toe: TOE, sock: SOCK } = LAND;

  const eyeColor = f('eyeColor', { q: 'vec3', anc: 'vec3' }, 'vec3', ([q, anc]) => {
    const side = sign(anc.x).toVar();
    const fwd = normalize(vec3(side.mul(0.3), 0, 1)).toVar(), ex = normalize(cross(vec3(0, 1, 0), fwd)).toVar(), ey = cross(fwd, ex).toVar();
    const d = normalize(q.sub(anc)).toVar(), uv = vec2(dot(d, ex), dot(d, ey)).toVar();
    const out = uv.x.mul(side), r = length(uv).toVar(), front = step(0, dot(d, fwd));
    const col = mix(c.iris.mul(1.08), c.iris.mul(0.72), smoothstep(0.2, 0.62, r)).toVar();
    col.assign(mix(col, c.pupil, under(0.4, 0.44, length(uv.mul(vec2(1, 0.92))))));
    col.assign(mix(col, vec3(1), under(0.055, 0.085, length(uv.sub(vec2(side.mul(-0.17), 0.22))))));
    col.assign(mix(col, c.pupil, smoothstep(0.63, 0.68, r)));                 // the dark rim
    const lid = float(0.6).sub(out.mul(0.1)).toVar();                         // drooping toward the outer corner
    col.assign(mix(col, c.pupil, smoothstep(lid.sub(0.07), lid.sub(0.02), uv.y)));
    col.assign(mix(col, c.base, smoothstep(lid.add(0.01), lid.add(0.05), uv.y)));
    return mix(c.pupil, col, front);
  });

  const furColor = f('furColor', { q: 'vec3', reg: 'vec4', tailT: 'float', w: 'float' }, 'vec3', ([q, reg, tailT, w]) => {
    const qn = q.add(WDIR.mul(w)).toVar();   // where the noise is read: 4D, as the point moved by its own w
    const n = fbm(qn.mul(4.5)).toVar(), j = n.sub(0.5).mul(2).toVar();
    const tick = vnoise(SKEW.mul(qn).mul(70)).add(vnoise(SKEW2.mul(qn).mul(70))).mul(0.5).toVar(), streak = vnoise(qn.mul(vec3(30, 260, 30))).toVar();
    const col = mix(c.base, c.light, smoothstep(0.35, 0.85, n.mul(0.75).add(tick.mul(0.3)))).toVar();
    const wHead = reg.x, wLeg = reg.y, wTail = reg.z, wEar = reg.w, wBody = max(float(1).sub(wHead).sub(wLeg).sub(wTail).sub(wEar), 0);
    const u = q.sub(HEAD).div(HEAD_R).toVar();    // the head, as a unit ball
    const ax = abs(q.x).toVar(), aux = abs(u.x).toVar();
    const fromHead = length(q.sub(HEAD)).toVar();

    // body
    const spine = under(0.04, 0.1, ax.add(j.mul(0.03))).mul(smoothstep(BACK_Y - 0.3, BACK_Y - 0.12, q.y));
    const mackPhase = q.z.add(float(BACK_Y).sub(q.y).mul(0.3)).mul(34).add(w.mul(30)).add(sin(q.y.mul(9).add(q.x.mul(6))).mul(1.1)).add(j.mul(2.4));
    const mack = band(mackPhase, 0.24).mul(smoothstep(BODY_Y - 0.32, BODY_Y - 0.02, q.y)).mul(smoothstep(0.3, 0.6, fbm(qn.mul(9).add(3))).mul(0.55).add(0.45)).toVar();
    const bibMask = under(0.5, 1, length(q.sub(CHEST).div(vec3(0.2, 0.4, 0.3)))).toVar();
    const necklace = band(fromHead.mul(30).add(w.mul(20)).add(j), 0.24).mul(0.4).mul(within(fromHead, 0.42, 0.7, 0.05)).mul(bibMask).toVar();
    const darkBody = max(max(spine, mack.mul(bibMask.mul(0.8).oneMinus())), necklace);
    const creamBody = bibMask.mul(0.6).mul(necklace.oneMinus()).add(under(BODY_Y - 0.42, BODY_Y - 0.2, q.y).mul(0.45));

    // head
    const fore = band(u.x.mul(22).add(w.mul(16)).add(j.mul(0.5)), 0.22).mul(smoothstep(0.32, 0.55, u.y)).mul(under(0.55, 0.75, aux));
    const cheek = band(u.y.sub(u.z.mul(0.35)).mul(18).add(w.mul(14)).add(j.mul(0.6)), 0.22).mul(smoothstep(0.6, 0.85, aux)).mul(within(u.y, -0.6, 0.05, 0.1));
    const e = vec3(ax, q.y, q.z).sub(EYE).toVar();
    const liner = under(0.008, 0.016, abs(e.y.add(max(e.x, 0).mul(0.3)).add(0.01))).mul(within(e.x, EYE_R * 0.8, EYE_R * 1.5, 0.015)).mul(step(e.z, 0.02)).toVar();
    const rim = under(1.05, 1.35, length(e.div(vec3(EYE_R, EYE_R, EYE_R * 1.4))));
    const muzzle = smoothstep(0.55, 0.75, u.z).mul(under(-0.32, -0.18, u.y)).mul(under(0.42, 0.55, aux)).toVar();
    const chin = under(-0.62, -0.5, u.y).mul(smoothstep(0.1, 0.4, u.z));
    const back = smoothstep(0.75, 1.15, u.y).mul(under(0, 0.4, u.z.add(0.2)));   // the backs of the ears are darker
    const darkHead = max(max(fore, cheek), max(liner, back.mul(0.55))).mul(muzzle.oneMinus());
    const creamHead = max(rim.mul(0.5).mul(liner.oneMinus()), max(muzzle, chin));
    // the mouth
    const mouthY = LAND.head[1] - LAND.headR[1] * 0.62;
    const mouthDown = under(0.004, 0.008, ax).mul(within(q.y, mouthY, LAND.head[1] - LAND.headR[1] * 0.33, 0.004));
    const mouthCurve = under(0.004, 0.008, abs(q.y.sub(mouthY).add(ax.mul(0.6)).sub(ax.mul(ax).mul(10)))).mul(under(0.05, 0.065, ax));
    const mouth = max(mouthDown, mouthCurve).mul(smoothstep(0.6, 0.8, u.z));

    // legs and tail
    const darkLeg = band(q.y.mul(30).add(w.mul(30)).add(j), 0.3).mul(0.65).mul(smoothstep(0.08, 0.16, ax.sub(0.1)));
    const toeTop = mix(float(TOE), float(SOCK), step(0, q.x).mul(step(LEG_SPLIT, q.z)));
    const white = under(-0.02, 0.02, q.y.sub(FEET).sub(toeTop).add(j.mul(0.03)));
    const darkTail = max(band(tailT.mul(24).add(w.mul(40)).add(j), 0.4), smoothstep(0.84, 0.95, tailT));

    const dark = wBody.mul(darkBody).add(wHead.mul(darkHead)).add(wLeg.mul(darkLeg)).add(wTail.mul(darkTail));
    const cream = wBody.mul(creamBody).add(wHead.mul(creamHead));
    col.assign(mix(col, c.dark, clamp(dark, 0, 1).mul(0.85)));
    col.assign(mix(col, mix(c.cream, c.white, wHead.mul(muzzle)), clamp(cream, 0, 1)));
    col.assign(mix(col, c.white, wLeg.mul(white)));
    col.assign(mix(col, c.dark, wHead.mul(0.75).mul(mouth)));
    col.assign(mix(col, mix(c.ear.mul(0.85), c.cream, smoothstep(0.5, 0.9, streak).mul(0.35)), wEar));   // pink, with pale tufts
    return col.mul(tick.mul(0.2).add(0.9));
  });

  const catColor = f('catColor', { q: 'vec3', part: 'float', anc: 'vec3', reg: 'vec4', w: 'float' }, 'vec3', ([q, part, anc, reg, w]) => {
    const col = vec3(0).toVar();
    If(part.greaterThan(2.5), () => { col.assign(c.white); })                 // whiskers
      .ElseIf(part.greaterThan(1.5), () => { col.assign(mix(c.nose.mul(0.62), c.nose, smoothstep(-0.6, 0.2, q.y.sub(anc.y).div(0.034)))); })   // nose, darker below
      .ElseIf(part.greaterThan(0.5), () => { col.assign(eyeColor(q, anc)); })
      .Else(() => { col.assign(furColor(q, reg, anc.x, w)); });
    return col;
  });

  const shade = attribute('shade', 'vec4');   // Shadow's tint: color·a + rgb
  return catColor(attribute('catPos', 'vec3'), attribute('part', 'float'), attribute('anchor', 'vec3'), attribute('region', 'vec4'), attribute('catW', 'float'))
    .mul(shade.a).add(shade.rgb);
}

export function furMaterial(colors, LAND, params = {}) {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, envMapIntensity: 0.6, ...params });
  m.colorNode = catColorNode(colors, LAND);
  return m;
}
