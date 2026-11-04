// The round cat's cut (roundCutter in slice4d.js explains it) done on the GPU, for real WebGPU only. The source mesh goes
// up once, and a cut is two compute passes and a draw:
// 1. masks: per skin point, which of the 17 steps in θ are ana of your slice, a bit each.
// 2. emit: per skin triangle, the steps whose prism your slice crosses, and for each of those the prism's triangles from
//    the case table (cutCases), each appended as one number: triangle | step << 16 | three edge codes << 20. The append
//    is an atomic add on the indirect draw's instance count.
// 3. the draw: 3 vertices per instance, one instance per triangle. Counting triangles as instances keeps the draw inside
//    the 3-vertex position buffer three wants; an indirect draw that runs past its vertex buffers is skipped without an
//    error in Firefox. The vertex shader takes its item and edge and finds where the cut crosses that edge, the same way
//    the cutter does, from what the source mesh says. The same edge gives the same point in every triangle that has it,
//    so there are no cracks. Winding isn't worked out; the surface is closed and the material is double-sided, with the
//    normal taken as it is, not flipped for back faces.
import * as THREE from 'three';
import { IndirectStorageBufferAttribute, MeshStandardNodeMaterial, StorageBufferAttribute } from 'three/webgpu';
import {
  abs, acos, atan, atomicAdd, atomicStore, cos, dot, float, Fn, If, length, Loop, max, min, mix, PI, round, sin, sqrt, storage,
  transformNormalToView, uint, uniform, varyingProperty, vec3, vec4, vertexIndex, instanceIndex,
} from 'three/tsl';
import { cutCases } from '../slice4d.js';
import { catColorNode } from './fur.tsl.js';

const STEPS = 17, MAX_TRIS = 200_000;   // the most seen over thousands of poses is 87k; beyond this the last is overwritten
const f = (name, inputs, type, fn) => Fn(fn).setLayout({ name, type, inputs: Object.entries(inputs).map(([n, t]) => ({ name: n, type: t })) });
const stepAngle = k => float(k).sub(8).mul(PI).div(16);
const unit = v => v.div(max(length(v), 1e-6));   // a point turned a full 90° with G's w column along w has no normal: zero, not NaN

// where point (base, an, r) crosses between steps lo and hi, whose a are al and ah: the exact root of A + B cos θ + C sin θ if
// one lies between them, else in proportion
const rootOf = f('cutRoot', { base: 'float', an: 'float', r: 'float', gw: 'float', lo: 'float', hi: 'float', al: 'float', ah: 'float' }, 'float', ([base, an, r, gw, lo, hi, al, ah]) => {
  const th = lo.add(hi.sub(lo).mul(al).div(al.sub(ah))).toVar();
  const B = r.mul(an).toVar(), C = r.mul(gw).toVar(), A = base.sub(B).toVar(), rho = sqrt(B.mul(B).add(C.mul(C))).toVar();
  If(rho.greaterThan(1e-9).and(abs(A).lessThanEqual(rho)), () => {
    const phi = atan(C, B).toVar(), al2 = acos(A.negate().div(rho)).toVar(), e = 1e-5;
    const wrap = t => t.sub(PI.mul(2).mul(round(t.div(PI.mul(2)))));
    const r1 = wrap(phi.add(al2)).toVar(), r2 = wrap(phi.sub(al2)).toVar();
    If(r1.greaterThanEqual(lo.sub(e)).and(r1.lessThanEqual(hi.add(e))), () => { th.assign(r1); })
      .ElseIf(r2.greaterThanEqual(lo.sub(e)).and(r2.lessThanEqual(hi.add(e))), () => { th.assign(r2); });
  });
  return th;
});

// The source as flat buffers. src: { s, n, r, tris } as roundCutter takes; carry: { anchor, region, part } arrays per point.
export function createGpuCutter(renderer, src, carry) {
  const N = src.r.length, T = src.tris.length / 3;
  const pack4 = fn => { const a = new Float32Array(4 * N); for (let i = 0; i < N; i++) a.set(fn(i), 4 * i); return a; };
  const buf = (array, type, size) => storage(new StorageBufferAttribute(array, size), type, array.length / size).toReadOnly();
  const S = buf(pack4(i => [src.s[3 * i], src.s[3 * i + 1], src.s[3 * i + 2], src.r[i]]), 'vec4', 4);
  const NM = buf(pack4(i => [src.n[3 * i], src.n[3 * i + 1], src.n[3 * i + 2], 0]), 'vec4', 4);
  const ANC = buf(pack4(i => [carry.anchor[3 * i], carry.anchor[3 * i + 1], carry.anchor[3 * i + 2], carry.part[i]]), 'vec4', 4);
  const REG = buf(pack4(i => [carry.region[4 * i], carry.region[4 * i + 1], carry.region[4 * i + 2], carry.region[4 * i + 3]]), 'vec4', 4);
  // each triangle's corners in increasing order, as the cutter has them, so a shared edge is the same edge on both sides
  const corners = new Uint32Array(3 * T);
  for (let t = 0; t < T; t++) corners.set([src.tris[3 * t], src.tris[3 * t + 1], src.tris[3 * t + 2]].sort((x, y) => x - y), 3 * t);
  const CORNER = buf(corners, 'uint', 1);
  const cases = cutCases(), START = buf(cases.start, 'uint', 1), CASE = buf(cases.tris, 'uint', 1);
  const EDGE = buf(Uint32Array.from(cases.EDGES, ([p, q]) => p | (q << 3)), 'uint', 1);
  const maskAttr = new StorageBufferAttribute(new Uint32Array(N), 1), MASK = storage(maskAttr, 'uint', N);   // shared: a cut's passes run in order

  // one cut's own state: its own G and offset, its list of triangles and its draw
  function createCut(fur, LAND) {
    const G = new THREE.Matrix4(), uG = uniform(G), uOff = uniform(0);
    const col = i => uG.element(i), g = vec3(col(0).w, col(1).w, col(2).w), gw = col(3).w, GW = col(3).xyz;
    const linear = v => col(0).xyz.mul(v.x).add(col(1).xyz.mul(v.y)).add(col(2).xyz.mul(v.z));
    const asOf = i => dot(g, S.element(i).xyz).sub(uOff), anOf = i => dot(g, NM.element(i).xyz);
    const aAt = (i, th) => asOf(i).add(S.element(i).w.mul(anOf(i).mul(cos(th).sub(1)).add(gw.mul(sin(th)))));

    const indirect = new IndirectStorageBufferAttribute(new Uint32Array([3, 0, 0, 0]), 1);   // vertices, instances, first vertex, first instance
    const COUNT = storage(indirect, 'uint', 4).toAtomic();
    const itemsAttr = new StorageBufferAttribute(new Uint32Array(MAX_TRIS), 1), ITEMS = storage(itemsAttr, 'uint', MAX_TRIS);

    const reset = Fn(() => { atomicStore(COUNT.element(1), uint(0)); })().compute(1);
    const masks = Fn(() => {
      const i = instanceIndex, as = asOf(i).toVar(), an = anOf(i).toVar(), r = S.element(i).w.toVar(), sign = uint(0).toVar();
      Loop({ start: uint(0), end: uint(STEPS), type: 'uint' }, ({ i: k }) => {
        const th = stepAngle(k).toVar();
        If(as.add(r.mul(an.mul(cos(th).sub(1)).add(gw.mul(sin(th))))).greaterThanEqual(0), () => { sign.assign(sign.bitOr(uint(1).shiftLeft(k))); });
      });
      MASK.element(i).assign(sign);
    })().compute(N, [64]);
    const emit = Fn(() => {
      const t = instanceIndex, m = [0, 1, 2].map(c => MASK.element(CORNER.element(t.mul(3).add(c))).toVar());
      const all = m[0].bitAnd(m[1]).bitAnd(m[2]).toVar(), any = m[0].bitOr(m[1]).bitOr(m[2]).toVar();
      const layers = all.bitAnd(all.shiftRight(uint(1))).bitNot().bitAnd(any.bitOr(any.shiftRight(uint(1)))).bitAnd(uint(0xffff)).toVar();
      If(layers.notEqual(uint(0)), () => {
        Loop({ start: uint(0), end: uint(STEPS - 1), type: 'uint' }, ({ i: step }) => {
          const k = step.toVar();   // the loop inside has a variable of the same name, which hides this one
          If(layers.shiftRight(k).bitAnd(uint(1)).equal(uint(1)), () => {
            const bit = (v, s) => v.shiftRight(s).bitAnd(uint(1));
            const k1 = k.add(uint(1));
            const pos = bit(m[0], k).bitOr(bit(m[1], k).shiftLeft(uint(1))).bitOr(bit(m[2], k).shiftLeft(uint(2)))
              .bitOr(bit(m[0], k1).shiftLeft(uint(3))).bitOr(bit(m[1], k1).shiftLeft(uint(4))).bitOr(bit(m[2], k1).shiftLeft(uint(5))).toVar();
            Loop({ start: START.element(pos), end: START.element(pos.add(uint(1))), type: 'uint' }, ({ i: j }) => {
              const at = min(atomicAdd(COUNT.element(1), uint(1)), uint(MAX_TRIS - 1)).toVar();
              ITEMS.element(at).assign(t.bitOr(k.shiftLeft(uint(16))).bitOr(CASE.element(j).shiftLeft(uint(20))));
            });
          });
        });
      });
    })().compute(T, [64]);

    // corner c of the cut's triangle `n`: where it lands, its normal, its own w, and the skin points and proportion its
    // carried attributes come from. Works in any stage, so a compute pass can check it against the JS cutter.
    const vertexOf = (n, c) => {
      const item = ITEMS.element(n).toVar();
      const tri = item.bitAnd(uint(0xffff)).toVar(), k = item.shiftRight(uint(16)).bitAnd(uint(0xf)).toVar();
      const code = item.shiftRight(uint(20).add(c.mul(uint(4)))).bitAnd(uint(0xf)).toVar(), pq = EDGE.element(code).toVar();
      const p = pq.bitAnd(uint(7)).toVar(), q = pq.shiftRight(uint(3)).toVar();
      const cornerOf = c => CORNER.element(tri.mul(uint(3)).add(c.mod(uint(3))));
      const stepOf = c => k.add(c.greaterThanEqual(uint(3)).select(uint(1), uint(0)));
      // ends: from the lower-numbered corner on a level edge, from the bottom on a slanted one (q ≥ 3 > p when they differ)
      const level = p.lessThan(uint(3)).equal(q.lessThan(uint(3))).toVar(), upright = p.mod(uint(3)).equal(q.mod(uint(3))).toVar();
      const lo = p.mod(uint(3)).lessThan(q.mod(uint(3))).select(p, q).toVar();
      const from = level.select(lo, p).toVar(), to = level.select(lo.equal(p).select(q, p), q).toVar();
      const i = cornerOf(from).toVar(), j = cornerOf(to).toVar(), ki = stepOf(from).toVar(), kj = stepOf(to).toVar();
      const si = S.element(i).toVar(), sj = S.element(j).toVar(), ni = NM.element(i).xyz.toVar(), nj = NM.element(j).xyz.toVar();
      const asi = dot(g, si.xyz).sub(uOff).toVar(), asj = dot(g, sj.xyz).sub(uOff).toVar(), ani = dot(g, ni).toVar(), anj = dot(g, nj).toVar();
      const a = (as, an, r, s) => as.add(r.mul(an.mul(cos(stepAngle(s)).sub(1)).add(gw.mul(sin(stepAngle(s))))));
      const k1 = k.add(uint(1)), ai0 = a(asi, ani, si.w, k).toVar(), ai1 = a(asi, ani, si.w, k1).toVar(), aj0 = a(asj, anj, sj.w, k).toVar(), aj1 = a(asj, anj, sj.w, k1).toVar();
      const pos = vec3(0).toVar(), nrm = vec3(0).toVar(), w = float(0).toVar(), t = float(0).toVar();
      // a slanted edge on a face crossed the simple way runs straight between the two upright crossings
      const snap = upright.not().and(level.not()).and(ai0.greaterThanEqual(0).equal(aj0.greaterThanEqual(0))).and(ai1.greaterThanEqual(0).equal(aj1.greaterThanEqual(0))).and(ai0.greaterThanEqual(0).notEqual(ai1.greaterThanEqual(0))).toVar();
      const G3i = linear(si.xyz).toVar(), G3j = linear(sj.xyz).toVar(), Gni = linear(ni).toVar(), Gnj = linear(nj).toVar();
      If(upright.or(snap), () => {
        const lo2 = stepAngle(k).toVar(), hi2 = stepAngle(k1).toVar();
        const thi = rootOf(asi, ani, si.w, gw, lo2, hi2, ai0, ai1).toVar(), thj = rootOf(asj, anj, sj.w, gw, lo2, hi2, aj0, aj1).toVar();
        t.assign(upright.select(float(0), ai0.div(ai0.sub(aj1))));
        const at = (G3, Gn, r, th) => G3.add(Gn.mul(cos(th).sub(1)).add(GW.mul(sin(th))).mul(r));
        const nr = (Gn, th) => Gn.mul(cos(th)).add(GW.mul(sin(th)));
        pos.assign(mix(at(G3i, Gni, si.w, thi), at(G3j, Gnj, sj.w, thj), t));
        nrm.assign(mix(unit(nr(Gni, thi)), unit(nr(Gnj, thj)), t));
        w.assign(mix(si.w.mul(sin(thi)), sj.w.mul(sin(thj)), t));
      }).Else(() => {
        // skin point, normal, depth and θ in proportion t, found by regula falsi on a(t)
        const th0 = stepAngle(ki).toVar(), th1 = stepAngle(kj).toVar();
        const end = (as, an, r, th) => as.add(r.mul(an.mul(cos(th).sub(1)).add(gw.mul(sin(th)))));
        const f0 = end(asi, ani, si.w, th0).toVar(), f1 = end(asj, anj, sj.w, th1).toVar(), t0 = float(0).toVar(), t1 = float(1).toVar();
        t.assign(f0.div(f0.sub(f1)));
        const aOf = u => {
          const th = mix(th0, th1, u), r = mix(si.w, sj.w, u), ln = max(length(mix(ni, nj, u)), 1e-6);
          return mix(asi, asj, u).add(r.mul(mix(ani, anj, u).div(ln).mul(cos(th).sub(1)).add(gw.mul(sin(th)))));
        };
        for (let it = 0; it < 2; it++) {
          const v = aOf(t).toVar();
          If(v.greaterThanEqual(0).equal(f0.greaterThanEqual(0)), () => { t0.assign(t); f0.assign(v); }).Else(() => { t1.assign(t); f1.assign(v); });
          If(f0.notEqual(f1), () => { t.assign(t0.add(t1.sub(t0).mul(f0).div(f0.sub(f1)))); });
        }
        const th = mix(th0, th1, t).toVar(), r = mix(si.w, sj.w, t).toVar(), gn = mix(Gni, Gnj, t).div(max(length(mix(ni, nj, t)), 1e-6)).toVar();
        pos.assign(mix(G3i, G3j, t).add(gn.mul(cos(th).sub(1)).add(GW.mul(sin(th))).mul(r)));
        nrm.assign(gn.mul(cos(th)).add(GW.mul(sin(th))));
        w.assign(r.mul(sin(th)));
      });
      return { pos, nrm, w, t, i, j, si, sj };
    };

    const vCat = varyingProperty('vec3', 'vCutCat'), vAnc = varyingProperty('vec3', 'vCutAnc'), vPart = varyingProperty('float', 'vCutPart');
    const vReg = varyingProperty('vec4', 'vCutReg'), vW = varyingProperty('float', 'vCutW'), vN = varyingProperty('vec3', 'vCutN');
    const material = new MeshStandardNodeMaterial({ roughness: 0.9, envMapIntensity: 0.6, side: THREE.DoubleSide });
    material.positionNode = Fn(() => {
      const v = vertexOf(instanceIndex, vertexIndex);
      vCat.assign(mix(v.si.xyz, v.sj.xyz, v.t));
      const ai = ANC.element(v.i).toVar(), aj = ANC.element(v.j).toVar();
      vAnc.assign(mix(ai.xyz, aj.xyz, v.t)); vPart.assign(mix(ai.w, aj.w, v.t));
      vReg.assign(mix(REG.element(v.i), REG.element(v.j), v.t));
      vW.assign(v.w); vN.assign(v.nrm);
      return v.pos;
    })();
    material.normalNode = unit(transformNormalToView(vN));
    material.colorNode = catColorNode(fur, LAND, { catPos: vCat, part: vPart, anchor: vAnc, region: vReg, w: vW, shade: vec4(0, 0, 0, 1) });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));   // its place comes from the shader; three wants this to draw
    geometry.setIndirect(indirect);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const passes = [reset, masks, emit];
    return {
      mesh, passes, indirect, itemsAttr, vertexOf,
      // cut again: G is row-major, as the JS cutter takes it
      cut(g4, off) { G.set(...g4); uOff.value = off; renderer.compute(passes); },
    };
  }
  return { createCut, maskAttr };
}
