// The 4D Rubik's cube on the explorer page: how it is drawn in each view, and its panel. The puzzle itself is cube.js.
// createPuzzle(o, ctx) takes its WORLD entry o (center, pitch, size, group) and what it needs from the page:
//   frame()            the display frame V, which drawing and measuring read
//   local, sectionPoints, sectionGeometry, setGeo   the page's sectioning and geometry helpers
//   mode(), volOn()    the view (slice, stack, shadow) and whether volume view is on
//   reduceMotion, redraw()   whether to animate, and how to ask for a rebuild
//   S, startJump, setVolume, frameOn(center, scale, dur)   for Face this layer and Diagonal view, which move you and
//                      the camera
// and returns { rebuild, step, explain, updatePanel }.
import * as THREE from 'three';
import { add, sub, mul, dot, mv } from '../math4d.js';
import { tesseract } from '../shapes.js';
import { createCube, CELL_COLORS, colOf } from './cube.js';

const AX = 'XYZW', TESS = tesseract();
const CELL_RGB = CELL_COLORS.map(c => new THREE.Color(c));
const PLASTIC = new THREE.Color('#12151c'), PLASTIC_HI = new THREE.Color('#2b2f45');
// Shadow: the eye sits SHADOW_E ana of the puzzle center; each sticker is a little cube STICKER across in its cell
const SHADOW_E = 3.0, STICKER = 0.22, CELL_SHRINK = 0.8;
const EXPLAIN = {
  slice: '<b>Slice.</b> The 3D cross-section your slice cuts through the puzzle. A twist looks like a rigid face turn only when your slice is perpendicular to the layer’s axis. Otherwise pieces cross in and out of your slice and change shape as they go.',
  stack: '<b>Stack.</b> For the cube the three slices sit exactly one layer apart: kata on the left, ana on the right. With a level slice that is all 81 positions at once. Twist in a plane that includes ana, such as X–W, and pieces leave one panel and arrive in the next: a 4D move seen as travel between neighboring 3D worlds.',
  shadow: '<b>Shadow.</b> A 4D perspective projection, the view MagicCube4D uses. Each sticker is a small cube. The eye sits ana of the puzzle, so the kata cell is the small cube in the middle, the six side cells are the shells around it, and the cell nearest the eye is hidden because it would wrap around everything. Hold Pitch forward Ana (I) and the puzzle turns inside out as the middle cell swings to the outside.',
  face: '<b>Face this layer.</b> Ana now points along the layer’s axis, so the layer fills your slice as an ordinary 3×3×3 and all three of its twists are rigid turns. For Y–W twists, pick an X or Z layer. To face a Y layer, switch on Volume view (V) first: it lays your slice level.',
  faceY: '<b>Face this layer.</b> Volume view slices level, so at the layer’s height the whole Y layer fills your slice as an ordinary 3×3×3. Its X–Z, X–W and Z–W twists are rigid turns.',
  diag: '<b>Diagonal view.</b> Ana points along (x + z + w)/√3, the 4D version of cutting a cube corner to corner. The section is a hexagonal prism: ±X, ±Z and ±W stickers on the six walls, ±Y on the top and bottom. Every layer crosses this slice, so every twist changes something you can see, though pieces cut at an angle morph as they turn.',
  mirror: '<b>Mirror via 4D.</b> A half-turn of the whole puzzle in the plane of your right direction and ana. No rotation in 3D can turn an object into its mirror image. A half-turn through a fourth axis does: left and right swap, stickers and all. Halfway through, your slice cuts across the layers it started parallel to. It is exact when your slice passes through the puzzle’s center. Tap again to turn it back.',
  spin: '<b>Double rotation.</b> The whole puzzle turns in the X–Y and Z–W planes at once, at the same rate. Every point moves and no axis stays fixed, which no 3D rotation can do. Turn it off and it stops at the next quarter-turn, where x has become y and z has become w. Try it in Shadow view.',
};

export function createPuzzle(o, ctx) {
  const cube = createCube(), $ = id => document.getElementById(id);
  o.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  o.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x05070a }));
  o.hiLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc4a7ff }));
  o.group.add(o.mesh, o.lines, o.hiLines);

  /* ---------- drawing ---------- */
  function rebuild() {
    const V = ctx.frame(), mode = ctx.mode(), d = dot(sub(o.center, V.P), V.A);
    const m = 1.5 * o.pitch * V.A.reduce((acc, v) => acc + Math.abs(v), 0);
    o.range = [d - m, d + m];
    const pos = [], nrm = [], col = [], lin = [], hil = [], half = o.size / 2, pieces = cube.placed();
    if (mode === 'stack') o.stackInfo = { spacing: 3 * o.pitch + 0.8, bottom: -1.25, labels: ctx.volOn() ? ['one layer up', 'through center', 'one layer down'] : ['one layer kata', 'through center', 'one layer ana'] };
    if (mode === 'shadow') drawShadow(V, pieces, pos, nrm, col, hil);
    else {
      // slice: your own cut. stack: three cuts one layer apart along ana, centered on the puzzle, side by side.
      const panels = mode === 'stack'
        ? [-1, 0, 1].map(k => ({ off: d + k * o.pitch, shift: k * (3 * o.pitch + 0.8) }))
        : (o.range[0] < 0 && o.range[1] > 0 ? [{ off: 0, shift: 0 }] : []);
      for (const { p, M, sel } of pieces) {
        const W = TESS.verts.map(v => add(o.center, mul(mv(M, add(p.h, mul(v, half))), o.pitch)));
        for (const pn of panels) {
          const { pts, dA } = ctx.sectionPoints(W, TESS.edges, pn.off);
          if (Math.min(...dA) > 0 || Math.max(...dA) < 0) continue;
          const g = ctx.sectionGeometry(pts);
          if (!g || g.kind !== 'solid') continue;
          const pa = g.geo.getAttribute('position'), na = g.geo.getAttribute('normal');
          for (let t = 0; t < pa.count; t += 3) {
            // which facet of this piece does the triangle lie on? map its centroid back to the piece's home frame
            const cx = (pa.getX(t) + pa.getX(t + 1) + pa.getX(t + 2)) / 3, cy = (pa.getY(t) + pa.getY(t + 1) + pa.getY(t + 2)) / 3, cz = (pa.getZ(t) + pa.getZ(t + 1) + pa.getZ(t + 2)) / 3;
            const X = add(add(add(add(V.P, mul(V.R, cx)), mul(V.U, cy)), mul(V.F, -cz)), mul(V.A, pn.off));
            const u = mul(sub(X, o.center), 1 / o.pitch);
            const l = [0, 1, 2, 3].map(k => dot(colOf(M, k), u) - p.h[k]);       // Mᵀu − h
            let ax = 0; for (let k = 1; k < 4; k++) if (Math.abs(l[k]) > Math.abs(l[ax])) ax = k;
            const sg = l[ax] > 0 ? 1 : -1;
            const rgb = p.h[ax] === sg ? CELL_RGB[ax * 2 + (sg > 0)] : (sel ? PLASTIC_HI : PLASTIC);
            for (let k = 0; k < 3; k++) {
              pos.push(pa.getX(t + k) + pn.shift, pa.getY(t + k), pa.getZ(t + k));
              nrm.push(na.getX(t + k), na.getY(t + k), na.getZ(t + k));
              col.push(rgb.r, rgb.g, rgb.b);
            }
          }
          const ea = g.edges.getAttribute('position'), target = sel ? hil : lin;
          for (let k = 0; k < ea.count; k++) target.push(ea.getX(k) + pn.shift, ea.getY(k), ea.getZ(k));
          g.geo.dispose(); g.edges.dispose();
        }
      }
    }
    ctx.setGeo(o.mesh, { position: pos, normal: nrm, color: col });
    ctx.setGeo(o.lines, { position: lin });
    ctx.setGeo(o.hiLines, { position: hil });
  }

  // Shadow: 4D perspective projection along ana. Every sticker is a small 3-cube lying in its cell; the eye sits
  // SHADOW_E ana of the puzzle center, so points further kata shrink toward the middle.
  function drawShadow(V, pieces, pos, nrm, col, hil) {
    const C = o.center, base3 = ctx.local(C);
    const proj = X => {
      const r = sub(X, C), k = SHADOW_E / Math.max(0.35, SHADOW_E - dot(r, V.A));
      return new THREE.Vector3(base3.x + dot(r, V.R) * k, base3.y + dot(r, V.U) * k, base3.z - dot(r, V.F) * k);
    };
    const tmp = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const { p, M, sel } of pieces) for (let i = 0; i < 4; i++) {
      const s = p.h[i]; if (!s) continue;
      if (dot(mul(colOf(M, i), s), V.A) > 0.6) continue;   // the cell facing the eye would wrap around everything
      const rgb = CELL_RGB[i * 2 + (s > 0)];
      const oth = [0, 1, 2, 3].filter(k => k !== i);
      const ctr = p.h.map((v, k) => k === i ? v + s * 0.5 : v * CELL_SHRINK);
      const Q = [];
      for (let b = 0; b < 8; b++) {
        const v = ctr.slice();
        for (let k = 0; k < 3; k++) v[oth[k]] += (b >> k & 1) ? STICKER : -STICKER;
        Q.push(proj(add(C, mul(mv(M, v), o.pitch))));
      }
      const cen = Q.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / 8);
      for (let k = 0; k < 3; k++) {
        const a1 = (k + 1) % 3, a2 = (k + 2) % 3;
        for (const side of [0, 1]) {
          const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => Q[(side << k) | (x << a1) | (y << a2)]);
          e1.subVectors(q[1], q[0]); e2.subVectors(q[2], q[0]);
          const nn = new THREE.Vector3().crossVectors(e1, e2).normalize();
          if (nn.dot(tmp.subVectors(q[0], cen)) < 0) { q.reverse(); nn.negate(); }
          for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(q[j].x, q[j].y, q[j].z); nrm.push(nn.x, nn.y, nn.z); col.push(rgb.r, rgb.g, rgb.b); }
        }
      }
      if (sel) for (let k = 0; k < 3; k++) for (let b = 0; b < 8; b++) if (!(b >> k & 1)) {
        const q0 = Q[b], q1 = Q[b | (1 << k)]; hil.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z);
      }
    }
  }

  /* ---------- panel ---------- */
  const rkState = $('rk-state'), rkPlanes = $('rk-planes'), rkExplain = $('rk-explain'), spinBtn = $('rk-spin');
  const explain = k => { rkExplain.innerHTML = EXPLAIN[k]; };
  function updatePanel() {
    document.querySelectorAll('#rk-axis button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === cube.axis));
    document.querySelectorAll('#rk-val button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === cube.val));
    const goto = $('rk-goto'), yOnly = cube.axis === 1 && !ctx.volOn();
    goto.textContent = yOnly ? 'Slice through layer' : 'Face this layer';
    goto.title = yOnly ? 'Y layers can’t be faced head-on unless volume view (V) lays your slice level'
      : cube.axis === 1 ? 'Move your level slice to this layer’s height'
      : `Turn your slice perpendicular to ${AX[cube.axis]} and move into this layer`;
    const solved = cube.solved();
    rkState.textContent = solved ? (cube.moves ? `solved in ${cube.moves}` : 'solved') : (cube.moves ? `${cube.moves} move${cube.moves === 1 ? '' : 's'}` : 'scrambled');
    rkState.classList.toggle('on', solved && cube.moves > 0);
  }
  // the three twist planes of the selected axis, each with a button either way
  function renderPlanes() {
    const rest = [0, 1, 2, 3].filter(k => k !== cube.axis);
    rkPlanes.innerHTML = [[rest[0], rest[1]], [rest[0], rest[2]], [rest[1], rest[2]]].map(([i, j]) =>
      `<div class="lbl">Twist<code>${AX[i]}–${AX[j]} plane</code></div>` +
      `<button class="key" type="button" id="tw-${AX[i]}${AX[j]}-p" data-i="${i}" data-j="${j}" data-dir="1">${AX[i]}→${AX[j]}</button>` +
      `<button class="key" type="button" id="tw-${AX[i]}${AX[j]}-n" data-i="${i}" data-j="${j}" data-dir="-1">${AX[j]}→${AX[i]}</button>`).join('');
  }
  const updateSpinBtn = () => spinBtn.setAttribute('aria-pressed', String(cube.spin.on));
  const clearTricks = () => { cube.clearTricks(); updateSpinBtn(); ctx.redraw(); };
  rkPlanes.addEventListener('click', e => {
    const b = e.target.closest('button[data-dir]');
    if (b) { cube.twist(+b.dataset.i, +b.dataset.j, +b.dataset.dir); updatePanel(); }
  });
  $('rk-axis').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { cube.axis = +b.dataset.v; renderPlanes(); updatePanel(); ctx.redraw(); }
  });
  $('rk-val').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { cube.val = +b.dataset.v; updatePanel(); ctx.redraw(); }
  });
  $('rk-scramble').addEventListener('click', () => { cube.scramble(); updatePanel(); });
  $('rk-reset').addEventListener('click', () => { cube.reset(); updateSpinBtn(); updatePanel(); ctx.redraw(); });
  spinBtn.addEventListener('click', () => {
    if (!cube.toggleSpin()) return;
    if (cube.spin.on) explain('spin');
    updateSpinBtn();
  });
  $('rk-mirror').addEventListener('click', () => {
    const V = ctx.frame();
    if (cube.startMirror(V.R, V.A)) explain('mirror');
  });
  const frame = dur => ctx.frameOn(o.center, ctx.mode() === 'stack' ? 1.6 : 1, dur);
  // Diagonal view: ana along (x + z + w)/√3, standing back from the puzzle along your forward
  $('rk-diag').addEventListener('click', () => {
    clearTricks();
    if (ctx.volOn()) ctx.setVolume(false);
    explain('diag'); frame(1.3);
    const S = ctx.S, s2 = Math.SQRT2, s3 = Math.sqrt(3), s6 = Math.sqrt(6);
    const to = { R: [1 / s2, 0, -1 / s2, 0], F: [1 / s6, 0, 1 / s6, -2 / s6], A: [1 / s3, 0, 1 / s3, 1 / s3] };
    ctx.startJump({ from: S.P.slice(), to: sub([o.center[0], 0, o.center[2], o.center[3]], mul(to.F, 3.2)), t: 0, dur: 1.3, frame: { from: { R: S.R, F: S.F, A: S.A }, to } });
  });
  // Face this layer: turn ana onto the layer's axis and move into the layer (a Y layer only in volume view, which slices level)
  $('rk-goto').addEventListener('click', () => {
    clearTricks();
    const S = ctx.S, T = o.center.slice();
    T[cube.axis] += cube.val * o.pitch;
    if (ctx.volOn() && cube.axis === 1) {
      explain('faceY'); frame(1.1);
      ctx.startJump({ from: S.P.slice(), to: add(S.P, mul(S.U, T[1] - S.P[1])), t: 0 });
      return;
    }
    if (ctx.volOn()) ctx.setVolume(false);
    explain('face'); frame(1.1);
    let turn = null, Af = S.A;
    if (cube.axis !== 1) {
      // turn ana onto the layer axis (sign chosen for the shorter turn), within the x–z–w subspace
      const ek = [0, 0, 0, 0]; ek[cube.axis] = 1;
      const e = mul(ek, dot(S.A, ek) < 0 ? -1 : 1);
      const c = dot(S.A, e), wv = sub(e, mul(S.A, c)), sn = Math.hypot(...wv);
      if (sn > 1e-6) { turn = { R: S.R, F: S.F, A: S.A, v: mul(wv, 1 / sn), theta: Math.atan2(sn, c) }; Af = e; }
    }
    ctx.startJump({ from: S.P.slice(), to: add(S.P, mul(Af, dot(sub(T, S.P), Af))), t: 0, turn, dur: turn ? 1.1 : 0.6 });
  });
  renderPlanes();
  updatePanel();

  // Advance the cube's animations; true if it needs redrawing.
  function step(dt) {
    const { moved, settled } = cube.step(dt, ctx.reduceMotion);
    if (settled) updatePanel();
    return moved;
  }
  return { rebuild, step, explain, updatePanel };
}
