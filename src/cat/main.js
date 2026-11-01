// 4D spinning cat: the OIIA meme cat, round in w, spinning in 4D in front of a 4D TV that plays "OIIA OIIA" from
// YouTube. You walk their world on the walker (walk.js) the explorer uses: your frame and controls, the View / Move /
// Rotate panel and the loop are its, and the cat and the TV are two entries of its world, each drawn in your display
// frame V (volume view turns it). The cat is as round in w as it is in 3D (model.js); Slice and Stack cut
// it with roundCutter, and Shadow draws three of its layers in w. The TV is a 3D shape
// thickened along w, cut with thickSlice, an affine map plus a slab (both in slice4d.js). Shadow projects each from an
// eye ana of it.
// The TV's picture is the YouTube player itself, laid on the screen by CSS3DRenderer through the same 4D maps: cut to
// the part of the screen inside your slice, or projected in Shadow. Its layer is above the canvas, so no 3D object is
// ever drawn over it.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { add, mul, dot, rot, mm, mv } from '../math4d.js';
import { tesseract } from '../shapes/shapes.js';
import { createWalker } from '../walk.js';
import { roomEnvironment } from '../environment.js';
import { $, reduceMotion, press, onButton } from '../utils.js';
import { tok, depthShade, depthTint, tubeMatrix, knobMatrix } from '../scenery.js';
import { fmt, drawRulerRow, stackOffs } from '../hud.js';
import { buildCat, HEIGHT } from './model.js';
import { furMaterial } from './fur.js';
import { inView, thickSlice, screenSlice, screenShadow, roundCutter, roundRange, roundLayer } from './slice4d.js';
import { buildTV, TV } from './tv.js';
import { SPINS, FACE } from './spins.js';
import './cat.css';

const FLOOR_Y = -2.4, EYE_CAT = 4, EYE_TV = 4.5, ANT = 0.3;
// Both face where you start (FACE, in spins.js): their own +z points along world −z.
const CAT_AT = [0, FLOOR_Y + HEIGHT / 2 + 0.02, 5, 0], TV_AT = [0, 0.9, 9.5, 0];
const DEFAULT_VIDEO = '2TBTJL46rg8';   // "OIIA OIIA (Spinning Cat)" by W&W, from the W&W - Topic channel
const VIDEO = (new URLSearchParams(location.search).get('v') || '').match(/^[\w-]{11}$/)?.[0] || DEFAULT_VIDEO;
// The spins (SPINS) are in spins.js.
const SPIN_DESC = {
  y: '<b>3D</b> spins it around y, in the x–z plane: the meme spin. Nothing leaves your slice, so standing level with it you see the whole cat.',
  w: '<b>Through w</b> turns it in the x–w plane. Its side swings out of your slice, so you see a band of it around its middle, stretched sideways. A quarter turn on, your slice cuts it lengthwise down the middle: its side view, filled out by its roundness in w. Half a turn on, it comes back mirrored: its tail curls the other way and the white sock is on its other front paw.',
  both: '<b>Both</b> is the meme spin plus a turn through w at a third of the speed, so it keeps flipping into its mirror image.',
  pass: '<b>Pass through</b> keeps the meme spin and moves the cat along w, through your slice and out the other side. It is round in w, so it grows from nothing: first the middle of its body, then its head, legs, tail, eyes and ears, and its whiskers last. Then it shrinks away the same way, and comes back from the other side.',
  double: '<b>Double</b> turns it in the x–z and y–w planes at once, at the same rate. No point of the cat stays still, which no 3D spin can do.',
  opposite: '<b>Opposite</b> is Double with its y–w turn run backwards. The two are mirror images of each other, and no turning makes one into the other: in 4D, double rotations at equal rates come in two hands, like left and right. Nothing in 3D works like this.',
  knot: '<b>2 : 3</b> turns x–z three times while y–w turns twice, so it takes all three turns to come back. Most points of the cat run along a path shaped like a trefoil knot. In 4D any knot can be untied, so it is only knot-shaped.',
  tumble: '<b>Tumble</b> turns it in three planes at once: x–z three times, y–w twice and x–y once, all in the three turns of the loop. Every 4D rotation is at most two plane turns at a moment, so the planes themselves keep changing: it tumbles like a spinning coin, and its pose never settles into a steady spin.',
  wobble: '<b>Wobble</b> is the meme spin with a slow roll through z–w and w–x, so the cat swings through three axes at once, x, z and w. It leans in and out of your slice while it spins.',
  flip: '<b>Somersault</b> turns it in the y–w plane, so its height tips into w. A quarter turn on, your slice cuts it level through its middle, filled out up and down by its roundness in w. Half a turn on it is upside down and mirrored, a pose no 3D turn can reach.',
};
const VIEW_DESC = {
  slice: '<b>Slice</b> is what a 3D being in your hyperplane sees. The cat is as round in w as it is in 3D: about 1.1 through its body, 0.7 through its head and 0.25 through a leg. The TV is a box 1.4 thick. Level with their middles you see both whole. Step ana or kata and the cat thins, its whiskers, ears, tail and legs going first, while the TV stays whole until you leave it. Its coat is patterned in 4D, so its stripes slide as you go. Tilt your slice into ana, or turn the cat through w, and you see the cat stretched and the TV as a band, with flat faces where your slice cuts through it. The picture on the TV is cut the same way: swing sideways into ana (U, O) and it narrows to a band; step ana or kata to slide the band across.',
  stack: '<b>Stack</b> cuts the cat and the TV with three parallel hyperplanes each, a quarter of their extent along ana apart, kata on the left, laid side by side. The sideways gaps are only for display. The picture shows on the middle TV.',
  shadow: '<b>Shadow</b> is a 4D perspective projection from an eye ana of each object. The cat shows three of its layers in w: its middle, and see-through thinner ones kata and ana of it. The TV’s 4D box shows as a box in a box joined at the corners, and its screen, a rectangle times the thickness, as a frustum; the picture sits on its middle layer. Parts further kata are smaller, dimmer and bluer, parts nearer the eye bigger, brighter and warmer.',
};

function main() {
  const ST = { spin: 'both', speed: 1 };
  let want = false, angle = 0, rate = 0, antT = 0;

  /* ---------- scene ---------- */
  // you walk it on the walker (walk.js): the scene, floor, camera, your state, the View / Move / Rotate panel and the loop
  const walker = createWalker({
    what: 'the cat', viewDesc: VIEW_DESC, hint: ' · space plays', floorY: FLOOR_Y, floor: [10, 32, -6],
    position: [2.2, 3.4, 5.6], target: [0, -0.4, -7], fog: [18, 46], lights: { hemi: 0.4, sun: 0.7, fill: 0 },
  });
  if (!walker) return;
  const { renderer, scene, BG, camera, view } = walker;
  renderer.localClippingEnabled = true;
  roomEnvironment(renderer, scene);

  /* ---------- Slice and Stack ---------- */
  // The TV: a 3D shape thickened along w, drawn as three panels (Stack uses all three, Slice the middle one). A panel shows
  // every piece through one affine map, clipped to the slab, with the pieces' insides in a flat cut color so a cut
  // reads as a solid face. A mirror-image map turns triangles over, so it uses copies wound the other way round.
  const flip = g => { const f = g.clone(), ix = f.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; return f; };
  function thickBody(pieces, cut) {
    const geos = pieces.map(p => ({ geo: p.geo, flipped: flip(p.geo) }));
    return [-1, 0, 1].map(k => {
      const planes = [new THREE.Plane(), new THREE.Plane()];
      const meshes = pieces.flatMap((p, i) => [
        new THREE.Mesh(p.geo, p.material({ clippingPlanes: planes })),
        new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ color: cut, side: THREE.BackSide, clippingPlanes: planes })),
      ].map(m => { m.matrixAutoUpdate = false; m.userData = geos[i]; scene.add(m); return m; }));
      return { k, planes, meshes };
    });
  }
  const _m = new THREE.Matrix4(), _n = new THREE.Vector3();
  // show panel p as the cut s (from thickSlice), its center at (x, y, z) in the scene; s = null hides it
  function drawPanel(p, s, x, y, z) {
    const show = !!s && !s.empty;
    for (const m of p.meshes) m.visible = show;
    if (!show) return;
    const { L, shift } = s;
    _m.set(L[0], L[1], L[2], x + shift[0], L[3], L[4], L[5], y + shift[1], L[6], L[7], L[8], z + shift[2], 0, 0, 0, 1);
    for (const m of p.meshes) { m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; m.geometry = s.b < 0 ? m.userData.flipped : m.userData.geo; }
    p.planes.forEach((pl, i) => {
      const c = s.clip[i];
      if (c) pl.set(_n.set(...c.n), c.d).applyMatrix4(_m);   // from the shape's own coordinates to the scene
      else pl.set(_n.set(0, 1, 0), 1e9);                     // not turned into w: nothing to cut
    });
  }

  // The cat, round in w (model.js): each skin point's depth, the radius it turns into w with, and a cutter for its cuts
  // (slice4d.js). Three cut meshes, like the TV's panels; each is cut again only when its cut changes.
  const fur = Object.fromEntries(['dark', 'base', 'light', 'cream', 'white', 'iris', 'pupil', 'nose', 'ear'].map(k => [k, tok('--fur-' + k)]));
  const cat = buildCat(), CA = k => cat.getAttribute(k), base = CA('position').array;
  const round = { s: CA('catPos').array, n: CA('normal').array, r: CA('depth').array, tris: cat.index.array };
  const CARRY = ['catPos', 'anchor', 'region', 'part'];
  const cutter = roundCutter(round, CARRY.map(k => ({ array: CA(k).array, size: CA(k).itemSize })));
  const catMat = furMaterial(fur), catCuts = [0, 1, 2].map(() => ({ out: cutter.output(), mesh: null, key: '' }));
  function cutMesh(c) {   // a mesh on c's buffers, made again when they grow
    const o = c.out, g = new THREE.BufferGeometry(), dyn = (a, size) => new THREE.BufferAttribute(a, size).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(o.pos, 3));
    g.setAttribute('normal', dyn(o.nrm, 3));
    g.setAttribute('catW', dyn(o.w, 1));
    CARRY.forEach((k, j) => g.setAttribute(k, dyn(o.carried[j], CA(k).itemSize)));
    g.setAttribute('shade', new THREE.BufferAttribute(new Float32Array(4 * o.cap).map((_, i) => +(i % 4 === 3)), 4));   // no tint
    g.setIndex(dyn(o.index, 1));
    if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = g; }
    else { c.mesh = new THREE.Mesh(g, catMat); c.mesh.frustumCulled = false; scene.add(c.mesh); }
    o.grown = false;
  }
  catCuts.forEach(cutMesh);
  // show cut c of the cat at `off` ana of its center, seen through G, centered at (x, y, z); off = null hides it
  function drawCut(c, G, off, x, y, z) {
    c.mesh.visible = off !== null;
    if (off === null) return;
    c.mesh.position.set(x, y, z);
    const key = G.join() + '|' + off;
    if (key === c.key) return;   // nothing has moved
    c.key = key;
    const o = cutter.cut(G, off, c.out);
    if (o.grown) cutMesh(c);
    const g = c.mesh.geometry;
    g.setDrawRange(0, o.ni);
    if (!o.ni) return;   // nothing to upload (and an update range of 0 would upload everything)
    for (const [name, a] of Object.entries(g.attributes)) if (name !== 'shade') { a.updateRange.count = o.nv * a.itemSize; a.needsUpdate = true; }
    g.index.updateRange.count = o.ni;
    g.index.needsUpdate = true;
  }
  let catReach = 0;   // the farthest the cat reaches from its spin axis, for the Stack's spacing
  for (let i = 0; i < base.length; i += 3) catReach = Math.max(catReach, Math.hypot(base[i], base[i + 2]));

  const tv = buildTV(FLOOR_Y - TV_AT[1]);
  const chromeOpts = { color: new THREE.Color(tok('--chrome')), roughness: 0.18, metalness: 1 };
  const tvPanels = thickBody([
    { geo: tv.pieces.panel, material: o => new THREE.MeshStandardMaterial({ color: new THREE.Color(tok('--tv')), roughness: 0.5, metalness: 0.3, ...o }) },
    { geo: tv.pieces.glass, material: o => new THREE.MeshStandardMaterial({ color: new THREE.Color(tok('--glass')), roughness: 0.15, metalness: 0.2, ...o }) },
    { geo: tv.pieces.chrome, material: o => new THREE.MeshStandardMaterial({ ...chromeOpts, ...o }) },
  ], new THREE.Color(tok('--tv-cut')));
  // the antenna tesseract's cuts, one per panel, rebuilt each frame
  const T4 = tesseract(), antMat = new THREE.MeshStandardMaterial({ ...chromeOpts, flatShading: true });
  const antCuts = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), antMat); scene.add(m); return m; });

  /* ---------- Shadow ---------- */
  // Three of the cat's layers in w: its middle, and see-through ones at w = ±LAYER_W (only the parts that reach that
  // far). Every vertex is projected from an eye EYE_CAT ana of the cat's center and tinted by depth.
  const LAYER_W = 0.25;
  const catLayers = [0, LAYER_W, -LAYER_W].map(w => {
    const g = cat.clone(), ix = cat.index.array, reaches = i => round.r[i] >= Math.abs(w);
    if (w) {
      const keep = [];
      for (let t = 0; t < ix.length; t += 3) if (reaches(ix[t]) && reaches(ix[t + 1]) && reaches(ix[t + 2])) keep.push(ix[t], ix[t + 1], ix[t + 2]);
      g.setIndex(keep);
    }
    const p4 = roundLayer(round, w);
    g.setAttribute('catW', new THREE.Float32BufferAttribute(p4.filter((_, i) => i % 4 === 3), 1));   // for the coat's 4D pattern
    const mesh = new THREE.Mesh(g, furMaterial(fur, w ? { side: THREE.DoubleSide, transparent: true, opacity: 0.3, depthWrite: false } : { side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, p4, pos: g.getAttribute('position'), shade: g.getAttribute('shade') };
  });
  function drawCatShadow({ mesh, p4, pos, shade }, G, at) {
    const P = pos.array, Sh = shade.array;
    for (let i = 0, j = 0; i < P.length; i += 3, j += 4) {
      const x = p4[j], y = p4[j + 1], z = p4[j + 2], w = p4[j + 3];
      const a = G[12] * x + G[13] * y + G[14] * z + G[15] * w, k = EYE_CAT / Math.max(0.3 * EYE_CAT, EYE_CAT - a);
      P[i] = at[0] + (G[0] * x + G[1] * y + G[2] * z + G[3] * w) * k;
      P[i + 1] = at[1] + (G[4] * x + G[5] * y + G[6] * z + G[7] * w) * k;
      P[i + 2] = at[2] + (G[8] * x + G[9] * y + G[10] * z + G[11] * w) * k;
      const t = THREE.MathUtils.clamp((a / (HEIGHT / 2) + 1) / 2, 0, 1), lum = 0.55 + 0.6 * t, { color: tint, amount: m } = depthTint(t);
      Sh[j] = tint.r * m * lum; Sh[j + 1] = tint.g * m * lum; Sh[j + 2] = tint.b * m * lum; Sh[j + 3] = (1 - m) * lum;
    }
    pos.needsUpdate = shade.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
  // The TV and the antenna tesseract as tubes, from an eye EYE_TV ana of the TV's center; dim (kata) to bright (ana).
  const TUBE = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), KNOB = new THREE.SphereGeometry(1, 14, 10);
  const wireMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 });
  const instanced = (geo, n) => { const m = new THREE.InstancedMesh(geo, wireMat, n); m.frustumCulled = false; scene.add(m); return m; };
  const tvTubes = instanced(TUBE, tv.wire.edges.length + T4.edges.length), tvKnobs = instanced(KNOB, tv.wire.knobs + T4.verts.length);
  const CHROME = new THREE.Color(tok('--chrome')), DIM = CHROME.clone().lerp(BG, 0.72), BRIGHT = CHROME.clone().lerp(new THREE.Color(0xffffff), 0.3);
  const _c = new THREE.Color(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const shadeAt = t => depthShade(_c, DIM, BRIGHT, t);   // dim (kata) → bright (ana), as in the explorer
  function drawTVShadow(G, at, ant) {
    const RAD = Math.hypot(...TV.half);
    const project = v => { const r = mv(G, v), k = EYE_TV / Math.max(0.25 * EYE_TV, EYE_TV - r[3]); return { p: new THREE.Vector3(at[0] + r[0] * k, at[1] + r[1] * k, at[2] + r[2] * k), a: r[3], k }; };
    const PV = tv.wire.verts.map(project), PA = ant.map(project);
    let n = 0;
    for (const [i, j, r] of tv.wire.edges) { tvTubes.setMatrixAt(n, tubeMatrix(PV[i].p, PV[j].p, r * (PV[i].k + PV[j].k) / 2)); tvTubes.setColorAt(n++, shadeAt(((PV[i].a + PV[j].a) / 2 / RAD + 1) / 2)); }
    for (const [i, j] of T4.edges) { tvTubes.setMatrixAt(n, tubeMatrix(PA[i].p, PA[j].p, 0.016 * (PA[i].k + PA[j].k) / 2)); tvTubes.setColorAt(n++, shadeAt(((PA[i].a + PA[j].a) / 2 / RAD + 1) / 2)); }
    n = 0;
    for (const v of [...PV.slice(0, tv.wire.knobs), ...PA]) {
      tvKnobs.setMatrixAt(n, knobMatrix(v.p, (n < tv.wire.knobs ? 0.075 : 0.03) * v.k)); tvKnobs.setColorAt(n++, shadeAt((v.a / RAD + 1) / 2));
    }
    for (const im of [tvTubes, tvKnobs]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }

  /* ---------- the picture: the YouTube player, on its own layer above the canvas ---------- */
  const cssScene = new THREE.Scene(), cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'css3d';
  view.append(cssRenderer.domElement);
  const screenEl = document.createElement('div');
  screenEl.className = 'tv-screen';
  screenEl.innerHTML = '<div class="no-signal">NO SIGNAL</div><div class="yt"></div>';
  const screen = new CSS3DObject(screenEl);
  screen.matrixAutoUpdate = false;
  cssScene.add(screen);
  const scr = tv.screen, _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let clipCss = '', shown = null;
  // Lay the screen through m (a row-major 4×4 from its pixels to the scene), keeping the pixels in poly (its own
  // coordinates, y up, from the center; null for all of them). Hidden when there is nothing to show or its back faces you.
  function placeScreen(m, poly) {
    let on = !!m && (!poly || poly.length >= 3);
    if (on) {
      screen.matrix.set(...m);
      screen.matrixWorldNeedsUpdate = true;
      // the screen's front: its own +z, wherever the map takes it (a mirror image turns the pixels over, not the front)
      [[0, 0, 0], [40, 0, 0], [0, 40, 0], [0, 0, 40]].forEach(([x, y, z], i) => _p[i].set(x, y, z).applyMatrix4(screen.matrix));
      _a.subVectors(_p[1], _p[0]).cross(_b.subVectors(_p[2], _p[0]));
      if (_a.dot(_b.subVectors(_p[3], _p[0])) < 0) _a.negate();
      on = _a.dot(_b.subVectors(camera.position, _p[0])) > 0;
    }
    if (on !== shown) { screenEl.style.visibility = on ? '' : 'hidden'; shown = on; }
    if (!on) return;
    const full = !poly || Math.abs(area(poly) - scr.w * scr.h) < 1;
    const c = full ? '' : `polygon(${poly.map(([x, y]) => `${(x + scr.w / 2).toFixed(1)}px ${(scr.h / 2 - y).toFixed(1)}px`).join(', ')})`;
    if (c !== clipCss) { screenEl.style.clipPath = c; clipCss = c; }
  }
  const area = poly => Math.abs(poly.reduce((s, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return s + x * v - u * y; }, 0)) / 2;

  /* ---------- the world: the cat and the TV, each drawn in your display frame ---------- */
  // Slice cuts at your own slice; Stack at the middle of an object's extent along ana and a quarter of it either side,
  // `spacing` apart sideways
  const cutsOf = (o, mode, spacing) => mode === 'slice' ? [null, { off: 0, x: 0 }, null] : stackOffs(o.range).map((off, i) => ({ off, x: (i - 1) * spacing }));
  let mirrored = false, drift = 0, reach = { key: '', lo: 0, hi: 0 };
  const catObj = {
    name: 'Cat', color: tok('--fur-light'), range: [0, 0], center: CAT_AT,
    build(V, { mode, labels }) {
      const spin = SPINS[ST.spin];
      // its spin in its own coordinates, then turned to face where you start; Pass through also moves it along w
      drift = spin.drift ? spin.drift(angle) : 0;
      catObj.center = [CAT_AT[0], CAT_AT[1], CAT_AT[2], CAT_AT[3] + drift];
      const cv = inView(V, catObj.center, mm(FACE, spin.R(angle))), G = cv.G, at = cv.at;
      const key = G.slice(12).join();   // how far it reaches along your ana depends only on G's w row
      if (key !== reach.key) [reach.lo, reach.hi] = roundRange(G, round), reach.key = key;
      catObj.range = [at[3] + reach.lo, at[3] + reach.hi];
      mirrored = G[15] < 0;
      for (const l of catLayers) l.mesh.visible = mode === 'shadow';
      if (mode === 'shadow') {
        for (const c of catCuts) drawCut(c, G, null);
        for (const l of catLayers) drawCatShadow(l, G, at);
      } else {
        catObj.stackInfo = { spacing: 2 * catReach + 0.6, bottom: -(HEIGHT / 2 + 0.35), labels };
        const cc = cutsOf(catObj, mode, catObj.stackInfo.spacing);
        catCuts.forEach((c, i) => drawCut(c, G, cc[i] ? cc[i].off - at[3] : null, at[0] + (cc[i]?.x || 0), at[1], at[2]));
      }
    },
  };
  const tvObj = {
    name: '4D TV', color: tok('--chrome'), range: [0, 0], center: TV_AT,
    build(V, { mode, labels }) {
      const tvv = inView(V, TV_AT, FACE), TG = tvv.G, tat = tvv.at;
      // its antenna tesseract spins in 4D in the TV's own coordinates
      const S4 = mm(rot(0, 3, antT), rot(1, 2, antT * 0.7));
      const antLocal = T4.verts.map(v => add(tv.antenna, mul(mv(S4, v), ANT)));
      const tvA = TG.slice(12, 16), tvAna = [...tv.wire.verts, ...antLocal].map(v => tat[3] + dot(tvA, v));
      tvObj.range = [Math.min(...tvAna), Math.max(...tvAna)];
      tvTubes.visible = tvKnobs.visible = mode === 'shadow';
      if (mode === 'shadow') {
        for (const p of tvPanels) drawPanel(p, null);
        antCuts.forEach(m => { m.visible = false; });
        drawTVShadow(TG, tat, antLocal);
        placeScreen(screenShadow(TG, tat, EYE_TV, scr), null);
      } else {
        tvObj.stackInfo = { spacing: 2 * TV.half[0] + 1, bottom: FLOOR_Y - TV_AT[1] - 0.35, labels };
        const tc = cutsOf(tvObj, mode, tvObj.stackInfo.spacing);
        tvPanels.forEach((p, i) => drawPanel(p, tc[i] && thickSlice(TG, TV.half[3], tc[i].off - tat[3]), tat[0] + (tc[i]?.x || 0), tat[1], tat[2]));
        const antView = antLocal.map(v => add(tat, mv(TG, v)));
        antCuts.forEach((m, i) => drawAntenna(m, antView, tc[i]));
        const sc = screenSlice(TG, tat, TV.half[3], tc[1].off, scr);   // the middle cut is never shifted sideways
        placeScreen(Math.abs(sc.b) < 0.12 ? null : sc.m, sc.poly);   // nearly edge-on: too stretched to show
      }
    },
  };
  // the antenna tesseract cut at cut.off (ana of you), shifted cut.x sideways: the hull of where its edges cross
  function drawAntenna(m, W, cut) {
    m.geometry.dispose();
    m.geometry = new THREE.BufferGeometry();
    m.visible = false;
    if (!cut) return;
    const pts = [];
    for (const [i, j] of T4.edges) {
      const a = W[i][3] - cut.off, b = W[j][3] - cut.off;
      if ((a < 0) !== (b < 0)) { const t = a / (a - b); pts.push(new THREE.Vector3(...[0, 1, 2].map(k => W[i][k] + t * (W[j][k] - W[i][k]))).add(_a.set(cut.x, 0, 0))); }
    }
    if (pts.length < 4) return;
    try { m.geometry = new ConvexGeometry(pts); m.visible = true; } catch (e) { /* flat or degenerate: skip this frame */ }
  }

  /* ---------- panel ---------- */
  const OBJ = [catObj, tvObj], { S, VOL } = walker;
  const ruler = $('ruler');
  OBJ.forEach(o => {
    const wrap = document.createElement('div'), b = document.createElement('button');
    wrap.className = 'shape-row';
    wrap.append(document.createElement('span'));
    b.className = 'row-btn'; b.type = 'button';
    b.innerHTML = `<span class="nm"><span class="dot" style="background:${o.color}"></span>${o.name}</span><span class="track"><span class="bar" style="background:${o.color}"></span></span>`;
    b.addEventListener('click', () => {   // center your slice on it
      const [lo, hi] = o.range;
      walker.startJump({ from: S.P.slice(), to: add(S.P, mul(walker.frame().A, (lo + hi) / 2)), t: 0 });
    });
    o.row = b; o.bar = b.querySelector('.bar');
    wrap.append(b);
    ruler.append(wrap);
  });
  const hudTurn = $('hud-turn'), hudMirror = $('hud-mirror');
  function updatePanel() {
    for (const o of OBJ) drawRulerRow(o.row, o.bar, o.range, VOL.on, 'Crosses your slice');
    const deg = Math.round(THREE.MathUtils.radToDeg(angle)) % 360;
    hudTurn.textContent = SPINS[ST.spin].label(deg, Math.round(THREE.MathUtils.radToDeg(angle)), drift);
    hudMirror.hidden = !mirrored;
  }

  /* ---------- music ---------- */
  // The cat spins while you want the music on; YouTube's own play and pause buttons count too.
  const playBtn = $('play');
  let player = null;
  function setWant(on, fromPlayer = false) {
    want = on;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.firstChild.textContent = on ? '❚❚ Pause ' : '▶ Play OIIA OIIA ';
    if (!fromPlayer && player && player.playVideo) on ? player.playVideo() : player.pauseVideo();
  }
  if (VIDEO !== DEFAULT_VIDEO) $('music-note').textContent = `Playing YouTube video ${VIDEO} on the 4D TV. The cat spins while it plays.`;
  window.onYouTubeIframeAPIReady = () => {
    player = new window.YT.Player(screenEl.querySelector('.yt'), {
      host: 'https://www.youtube-nocookie.com', videoId: VIDEO, width: scr.w, height: scr.h,
      playerVars: { playsinline: 1, rel: 0, loop: 1, playlist: VIDEO },
      events: {
        onStateChange: e => {
          const st = window.YT.PlayerState;
          if (e.data === st.PLAYING) setWant(true, true);
          else if (e.data === st.PAUSED || e.data === st.ENDED) setWant(false, true);
        },
        onError: e => {
          $('music-note').innerHTML = `YouTube won’t play this video here (error ${Number(e.data) || '?'}), but Play still spins the cat. <a href="https://www.youtube.com/watch?v=${VIDEO}" target="_blank" rel="noopener">Watch it on YouTube ↗</a>`;
        },
      },
    });
  };
  const api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  api.onerror = () => { $('music-note').textContent = 'YouTube didn’t load, so there’s no music, but Play still spins the cat.'; };
  document.head.append(api);
  playBtn.addEventListener('click', () => setWant(!want));

  /* ---------- spins and keys ---------- */
  function setSpin(s) { ST.spin = s; press('spin', s); $('spin-desc').innerHTML = SPIN_DESC[s]; }
  onButton('spin', b => setSpin(b.dataset.v));
  $('speed').addEventListener('input', e => { ST.speed = +e.target.value; });
  // the view buttons and keys, volume view, walking and Reset are the walker's; Space is ours
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space' && !e.target.closest('button, input')) { e.preventDefault(); setWant(!want); }
  });
  setSpin(ST.spin);
  // For the smoke test: stop the cat at a pose, `deg` degrees into spin `spin`.
  window.cat4d = { pose(spin, deg) { setWant(false); setSpin(spin); rate = 0; angle = THREE.MathUtils.degToRad(deg); } };

  walker.run(OBJ, {
    // the picture's layer is the size of the view
    resize() { cssRenderer.setSize(view.clientWidth, view.clientHeight); },
    volume(on) {
      $('ax-lo').textContent = on ? '6 above' : 'kata −6';
      $('ax-hi').textContent = on ? '6 below' : '+6 ana';
    },
    tick(dt) {
      // about a turn a second while the music plays, easing in and out; the antenna's tesseract never quite stops
      const goal = want ? ST.speed * (reduceMotion ? 0.3 : 1) : 0;
      rate += (goal - rate) * (1 - Math.exp(-dt * 3));
      angle = (angle + rate * 2 * Math.PI * dt) % (6 * Math.PI);   // 3 turns: a whole period of Both
      antT += dt * (reduceMotion ? 0.05 : 0.25) + rate * dt;
      walker.redraw();   // it is always moving, or at least its antenna is
    },
    update: updatePanel,
    after() { cssRenderer.render(cssScene, camera); },
  });
}

main();
