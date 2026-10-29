// 4D spinning cat: the OIIA meme cat, thick in w, spinning in 4D in front of a 4D TV that plays "OIIA OIIA" from
// YouTube. You walk their world as in the explorer: viewer.js is your frame and controls, and everything is drawn in
// your display frame V (volume view turns it). The cat and the TV are 3D shapes thickened along w. Slice and Stack cut
// them with thickSlice, an affine map plus a slab (slice4d.js); Shadow projects them from an eye ana of each.
// The TV's picture is the YouTube player itself, laid on the screen by CSS3DRenderer through the same 4D maps: cut to
// the part of the screen inside your slice, or projected in Shadow. Its layer is above the canvas, so no 3D object is
// ever drawn over it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { add, mul, dot, rot, mm, mv } from '../math4d.js';
import { tesseract } from '../shapes.js';
import { createViewer, bindControls } from '../viewer.js';
import { buildCat, HEIGHT } from './model.js';
import { furMaterial } from './fur.js';
import { inView, thickSlice, screenSlice, screenShadow } from './slice4d.js';
import { buildTV, TV } from './tv.js';
import '../styles.css';
import './cat.css';

const FLOOR_Y = -2.4, CAT_W = 0.6, EYE_CAT = 4, EYE_TV = 4.5, ANT = 0.3;   // CAT_W: the cat's half-thickness in w
// Both face where you start: their own +z points along world −z.
const FACE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
const CAT_AT = [0, FLOOR_Y + HEIGHT / 2 + 0.02, 5, 0], TV_AT = [0, 0.9, 9.5, 0];
const DEFAULT_VIDEO = '2TBTJL46rg8';   // "OIIA OIIA (Spinning Cat)" by W&W, from the W&W - Topic channel
const VIDEO = (new URLSearchParams(location.search).get('v') || '').match(/^[\w-]{11}$/)?.[0] || DEFAULT_VIDEO;
// Each spin is a 4D rotation by angle t in the cat's own coordinates; rot(i, j, t) turns axis i toward axis j.
const SPINS = {
  y: { R: t => rot(0, 2, t), label: t => `x–z turn ${t}°` },
  w: { R: t => rot(0, 3, t), label: t => `x–w turn ${t}°` },
  both: { R: t => mm(rot(0, 3, t / 3), rot(0, 2, t)), label: (t, r) => `x–z turn ${t}° · x–w turn ${Math.round(r / 3) % 360}°` },
  double: { R: t => mm(rot(0, 2, t), rot(1, 3, t)), label: t => `x–z and y–w turns ${t}°` },
};
const SPIN_DESC = {
  y: '<b>3D</b> spins it around y, in the x–z plane: the meme spin. Nothing leaves your slice, so standing level with it you see the whole cat.',
  w: '<b>Through w</b> turns it in the x–w plane. Its side swings out of your slice: Slice catches a thinner band of it, stretched, until it is edge-on, and Shadow flattens it. Half a turn on, it comes back mirrored: its tail curls the other way and the white sock is on its other front paw.',
  both: '<b>Both</b> is the meme spin plus a turn through w at a third of the speed, so it keeps flipping into its mirror image.',
  double: '<b>Double</b> turns it in the x–z and y–w planes at once, at the same rate. No point of the cat stays still, which no 3D spin can do.',
};
const VIEW_DESC = {
  slice: '<b>Slice</b> is what a 3D being in your hyperplane sees. The cat is 1.2 thick in w and the TV 1.4, so level with them you see both whole. Tilt your slice into ana, or turn the cat through w, and you see a band of each, stretched, with flat faces where your slice cuts through. The picture on the TV is cut the same way: swing sideways into ana (U, O) and it narrows to a band; step ana or kata to slide the band across.',
  stack: '<b>Stack</b> cuts the cat and the TV with three parallel hyperplanes each, a quarter of their extent along ana apart, kata on the left, laid side by side. The sideways gaps are only for display. The picture shows on the middle TV.',
  shadow: '<b>Shadow</b> is a 4D perspective projection from an eye ana of each object. The TV’s 4D box shows as a box in a box joined at the corners, and its screen, a rectangle times the thickness, as a frustum; the picture sits on its middle layer. Parts further kata are smaller, dimmer and bluer, parts nearer the eye bigger, brighter and warmer.',
};
const VOL_DESC = ' <b>Volume view is on:</b> your slice lies level, so here ana means down and kata means up.';

function main() {
  const view = document.getElementById('view'), $ = id => document.getElementById(id);
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ST = { spin: 'both', mode: 'slice', speed: 1 };
  const you = createViewer(), keys = bindControls(you);
  let want = false, angle = 0, rate = 0, antT = 0;

  /* ---------- scene ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (e) { view.insertAdjacentHTML('beforeend', '<div class="err">WebGL is not available in this browser, so the cat cannot be drawn.</div>'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.localClippingEnabled = true;
  view.prepend(renderer.domElement);
  const BG = new THREE.Color(tok('--ground')), scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 18, 46);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a2230, 0.4));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(4, 9, 6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 200);
  const CAM = { at: new THREE.Vector3(0, -0.4, -7), from: new THREE.Vector3(2.2, 3.4, 5.6) };
  camera.position.copy(CAM.from);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAM.at);
  controls.enableDamping = true;
  controls.maxDistance = 40; controls.minDistance = 1.5;
  let camTween = null;
  controls.addEventListener('start', () => { camTween = null; });

  // Floor: the 4D hyperplane y = FLOOR_Y, cut by your slice, checkered on world (x, z, w), as in the explorer.
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uP: { value: new THREE.Vector4() }, uR: { value: new THREE.Vector4() }, uU: { value: new THREE.Vector4() }, uF: { value: new THREE.Vector4() },
      cA: { value: new THREE.Color('#1a2331') }, cB: { value: new THREE.Color('#222d3e') }, cW: { value: new THREE.Color('#3a3358') }, cBg: { value: BG },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `
      uniform vec4 uP, uR, uU, uF; uniform vec3 cA, cB, cW, cBg; varying vec3 vPos;
      void main(){
        vec4 X = uP + vPos.x * uR + vPos.y * uU + (-vPos.z) * uF;
        vec3 q = floor(vec3(X.x, X.z, X.w));
        vec3 col = mix(cA, cB, mod(q.x + q.y + q.z, 2.0));
        float grad = length(vec2(uR.w, uF.w));      // tilted into w: mark where the floor crosses integer w
        float wl = abs(fract(X.w + 0.5) - 0.5) / max(grad, 1e-3);
        col = mix(col, cW, smoothstep(0.07, 0.0, wl) * smoothstep(0.02, 0.12, grad) * 0.9);
        float fade = 1.0 - smoothstep(10.0, 32.0, length(vPos.xz - vec2(0.0, -6.0)));
        gl_FragColor = vec4(mix(cBg, col, fade), 1.0);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // you, at the origin of the scene, with your R / U / F axes
  const me = new THREE.Group();
  me.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc4a7ff, emissive: 0x3a2a66, roughness: 0.4 })));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.9, 0xe0857a, 0.18, 0.1));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0x9bd59b, 0.18, 0.1));
  me.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.2, 0x8fb5ff, 0.2, 0.11));
  scene.add(me);

  /* ---------- thick bodies: Slice and Stack ---------- */
  // A 3D shape thickened along w, drawn as three panels (Stack uses all three, Slice the middle one). A panel shows
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

  const fur = Object.fromEntries(['dark', 'base', 'light', 'cream', 'white', 'iris', 'pupil', 'nose', 'ear'].map(k => [k, tok('--fur-' + k)]));
  const cat = buildCat(), base = cat.getAttribute('position').array;
  const catPanels = thickBody([{ geo: cat, material: o => furMaterial(fur, o) }], new THREE.Color(tok('--cut')));
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
  const KATA = new THREE.Color(tok('--kata')), ANA = new THREE.Color(tok('--ana'));
  const clamp01 = t => Math.min(1, Math.max(0, t));
  // The cat's middle layer, every vertex turned and projected from an eye EYE_CAT ana of its center, tinted by depth.
  const shadowGeo = cat.clone(), sPos = shadowGeo.getAttribute('position'), sShade = shadowGeo.getAttribute('shade');
  const catShadow = new THREE.Mesh(shadowGeo, furMaterial(fur, { side: THREE.DoubleSide }));
  catShadow.frustumCulled = false;
  scene.add(catShadow);
  function drawCatShadow(G, at) {
    const P = sPos.array, Sh = sShade.array;
    for (let i = 0, j = 0; i < P.length; i += 3, j += 4) {
      const x = base[i], y = base[i + 1], z = base[i + 2];
      const w = G[12] * x + G[13] * y + G[14] * z, k = EYE_CAT / Math.max(0.3 * EYE_CAT, EYE_CAT - w);
      P[i] = at[0] + (G[0] * x + G[1] * y + G[2] * z) * k;
      P[i + 1] = at[1] + (G[4] * x + G[5] * y + G[6] * z) * k;
      P[i + 2] = at[2] + (G[8] * x + G[9] * y + G[10] * z) * k;
      const t = clamp01((w / (HEIGHT / 2) + 1) / 2), lum = 0.55 + 0.6 * t, tint = t < 0.5 ? KATA : ANA, m = 0.3 * Math.abs(2 * t - 1);
      Sh[j] = tint.r * m * lum; Sh[j + 1] = tint.g * m * lum; Sh[j + 2] = tint.b * m * lum; Sh[j + 3] = (1 - m) * lum;
    }
    sPos.needsUpdate = sShade.needsUpdate = true;
    shadowGeo.computeVertexNormals();
  }
  // The TV and the antenna tesseract as tubes, from an eye EYE_TV ana of the TV's center; dim (kata) to bright (ana).
  const TUBE = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), KNOB = new THREE.SphereGeometry(1, 14, 10);
  const wireMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 });
  const instanced = (geo, n) => { const m = new THREE.InstancedMesh(geo, wireMat, n); m.frustumCulled = false; scene.add(m); return m; };
  const tvTubes = instanced(TUBE, tv.wire.edges.length + T4.edges.length), tvKnobs = instanced(KNOB, tv.wire.knobs + T4.verts.length);
  const CHROME = new THREE.Color(tok('--chrome')), DIM = CHROME.clone().lerp(BG, 0.72), BRIGHT = CHROME.clone().lerp(new THREE.Color(0xffffff), 0.3);
  const _c = new THREE.Color(), _o = new THREE.Object3D(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const luma = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const shadeAt = t => {   // brightness runs dim → bright; the far end leans cool and the near end warm, at the same luma
    t = clamp01(t);
    _c.copy(DIM).lerp(BRIGHT, t);
    const l0 = luma(_c);
    _c.lerp(t < 0.5 ? KATA : ANA, 0.3 * Math.abs(2 * t - 1));
    return _c.multiplyScalar(l0 / Math.max(1e-6, luma(_c)));
  };
  const tube = (a, b, r) => {
    _o.position.copy(a).add(b).multiplyScalar(0.5);
    _o.quaternion.setFromUnitVectors(UP, _b.subVectors(b, a).normalize());
    _o.scale.set(r, Math.max(a.distanceTo(b), 1e-4), r);
    _o.updateMatrix();
    return _o.matrix;
  };
  function drawTVShadow(G, at, ant) {
    const RAD = Math.hypot(...TV.half);
    const project = v => { const r = mv(G, v), k = EYE_TV / Math.max(0.25 * EYE_TV, EYE_TV - r[3]); return { p: new THREE.Vector3(at[0] + r[0] * k, at[1] + r[1] * k, at[2] + r[2] * k), a: r[3], k }; };
    const PV = tv.wire.verts.map(project), PA = ant.map(project);
    let n = 0;
    for (const [i, j, r] of tv.wire.edges) { tvTubes.setMatrixAt(n, tube(PV[i].p, PV[j].p, r * (PV[i].k + PV[j].k) / 2)); tvTubes.setColorAt(n++, shadeAt(((PV[i].a + PV[j].a) / 2 / RAD + 1) / 2)); }
    for (const [i, j] of T4.edges) { tvTubes.setMatrixAt(n, tube(PA[i].p, PA[j].p, 0.016 * (PA[i].k + PA[j].k) / 2)); tvTubes.setColorAt(n++, shadeAt(((PA[i].a + PA[j].a) / 2 / RAD + 1) / 2)); }
    n = 0;
    for (const v of [...PV.slice(0, tv.wire.knobs), ...PA]) {
      _o.position.copy(v.p); _o.quaternion.identity(); _o.scale.setScalar((n < tv.wire.knobs ? 0.075 : 0.03) * v.k); _o.updateMatrix();
      tvKnobs.setMatrixAt(n, _o.matrix); tvKnobs.setColorAt(n++, shadeAt((v.a / RAD + 1) / 2));
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

  /* ---------- rebuild: everything, in your display frame ---------- */
  const OBJ = [
    { name: 'Cat', color: tok('--fur-light'), range: [0, 0] },
    { name: '4D TV', color: tok('--chrome'), range: [0, 0] },
  ];
  let mirrored = false;
  function rebuild() {
    const V = you.frame(), mode = ST.mode;
    // the cat: its spin in its own coordinates, then turned to face where you start
    const catM = mm(FACE, SPINS[ST.spin].R(angle)), cv = inView(V, CAT_AT, catM), G = cv.G, at = cv.at;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < base.length; i += 3) { const a = G[12] * base[i] + G[13] * base[i + 1] + G[14] * base[i + 2]; if (a < lo) lo = a; if (a > hi) hi = a; }
    const catSpan = CAT_W * Math.abs(G[15]);
    OBJ[0].range = [at[3] + lo - catSpan, at[3] + hi + catSpan];
    mirrored = G[15] < 0;
    // the TV, and its antenna tesseract spinning in 4D in the TV's own coordinates
    const tvv = inView(V, TV_AT, FACE), TG = tvv.G, tat = tvv.at;
    const S4 = mm(rot(0, 3, antT), rot(1, 2, antT * 0.7));
    const antLocal = T4.verts.map(v => add(tv.antenna, mul(mv(S4, v), ANT)));
    const tvAna = [...tv.wire.verts, ...antLocal].map(v => tat[3] + dot(TG.slice(12, 16), v));
    OBJ[1].range = [Math.min(...tvAna), Math.max(...tvAna)];

    catShadow.visible = tvTubes.visible = tvKnobs.visible = mode === 'shadow';
    if (mode === 'shadow') {
      for (const p of [...catPanels, ...tvPanels]) drawPanel(p, null);
      antCuts.forEach(m => { m.visible = false; });
      drawCatShadow(G, at);
      drawTVShadow(TG, tat, antLocal);
      placeScreen(screenShadow(TG, tat, EYE_TV, scr), null);
    } else {
      // Slice cuts at your own slice; Stack at the middle of each object's extent along ana and a quarter of it either side
      const cuts = (o, spacing) => mode === 'slice' ? [null, { off: 0, x: 0 }, null] : [-1, 0, 1].map(k => {
        const [a, b] = o.range;
        return { off: (a + b) / 2 + k * (b - a) / 4, x: k * spacing };
      });
      const cc = cuts(OBJ[0], 2 * catReach + 0.6), tc = cuts(OBJ[1], 2 * TV.half[0] + 1);
      OBJ[0].stackInfo = { spacing: 2 * catReach + 0.6, bottom: -(HEIGHT / 2 + 0.35) };
      OBJ[1].stackInfo = { spacing: 2 * TV.half[0] + 1, bottom: FLOOR_Y - TV_AT[1] - 0.35 };
      catPanels.forEach((p, i) => drawPanel(p, cc[i] && thickSlice(G, CAT_W, cc[i].off - at[3]), at[0] + (cc[i]?.x || 0), at[1], at[2]));
      tvPanels.forEach((p, i) => drawPanel(p, tc[i] && thickSlice(TG, TV.half[3], tc[i].off - tat[3]), tat[0] + (tc[i]?.x || 0), tat[1], tat[2]));
      const antView = antLocal.map(v => add(tat, mv(TG, v)));
      antCuts.forEach((m, i) => drawAntenna(m, antView, tc[i]));
      const mid = tc[1], s = screenSlice(TG, tat, TV.half[3], mid.off, scr);
      if (mid.x) s.m[3] += mid.x;
      placeScreen(Math.abs(s.b) < 0.12 ? null : s.m, s.poly);   // nearly edge-on: too stretched to show
    }
    const V0 = you.S;
    const cu = V.U[1];   // the floor stays the plane world y = FLOOR_Y; as volume view levels the slice it drops away and hides
    floor.visible = cu > 0.05;
    floor.position.y = (FLOOR_Y - V.P[1]) / Math.max(cu, 0.05);
    floorMat.uniforms.uP.value.set(...V.P);
    floorMat.uniforms.uR.value.set(...V.R);
    floorMat.uniforms.uU.value.set(...V.U);
    floorMat.uniforms.uF.value.set(...V.F);
    updatePanel(V, V0);
  }
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
  const ruler = $('ruler'), RANGE = 6;
  OBJ.forEach(o => {
    const wrap = document.createElement('div'), b = document.createElement('button');
    wrap.className = 'shape-row';
    wrap.append(document.createElement('span'));
    b.className = 'row-btn'; b.type = 'button';
    b.innerHTML = `<span class="nm"><span class="dot" style="background:${o.color}"></span>${o.name}</span><span class="track"><span class="bar" style="background:${o.color}"></span></span>`;
    b.addEventListener('click', () => {   // center your slice on it
      const [lo, hi] = o.range, to = add(you.S.P, mul(you.frame().A, (lo + hi) / 2));
      if (reduceMotion) { you.S.P = to; } else you.jumpTo(to);
    });
    o.row = b; o.bar = b.querySelector('.bar');
    wrap.append(b);
    ruler.append(wrap);
  });
  const mtx = $('mtx'), ROWS = [['R', 'right'], ['U', 'up'], ['F', 'forward'], ['A', 'ana']];
  mtx.innerHTML = '<tr><th></th><th>x</th><th>y</th><th>z</th><th>w</th></tr>' +
    ROWS.map(([k, n]) => `<tr class="${k.toLowerCase()}"><th class="r"><i>${k}</i> ${n}</th>${'<td></td>'.repeat(4)}</tr>`).join('');
  const cells = [...mtx.querySelectorAll('tr')].slice(1).map(tr => [...tr.querySelectorAll('td')]);
  const hud = ['px', 'py', 'pz', 'pw'].map($);
  const fmt = v => { const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); return s.startsWith('-') ? '−' + s.slice(1) : s; };
  function updatePanel(V, S) {
    S.P.forEach((v, i) => { hud[i].textContent = fmt(v); });
    ROWS.forEach(([k], r) => V[k].forEach((v, c) => {
      const td = cells[r][c];
      td.textContent = fmt(v);
      td.style.background = `color-mix(in srgb, ${k === 'A' ? 'var(--accent)' : 'var(--ink)'} ${Math.round(Math.abs(v) * (k === 'A' ? 34 : 24))}%, transparent)`;
    }));
    for (const o of OBJ) {
      const [lo, hi] = o.range, L = Math.max(-RANGE, lo), H = Math.min(RANGE, hi), inSlice = lo < 0 && hi > 0;
      o.bar.hidden = !(H > L);
      if (H > L) { o.bar.style.left = ((L + RANGE) / (2 * RANGE) * 100) + '%'; o.bar.style.width = Math.max(0.8, (H - L) / (2 * RANGE) * 100) + '%'; }
      o.row.classList.toggle('in', inSlice);
      o.row.title = (inSlice ? 'Crosses your slice' : `Lies ${lo >= 0 ? (you.vol.on ? 'below' : 'ana of') : (you.vol.on ? 'above' : 'kata of')} you`) + ' · tap to center your slice on it';
    }
    const deg = Math.round(THREE.MathUtils.radToDeg(angle)) % 360;
    $('hud-turn').textContent = SPINS[ST.spin].label(deg, Math.round(THREE.MathUtils.radToDeg(angle)));
    $('hud-mirror').hidden = !mirrored;
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

  /* ---------- views, spins and keys ---------- */
  const press = (id, v) => { for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
  function dolly(f) {
    const toT = controls.target.clone(), toP = toT.clone().add(camera.position.clone().sub(toT).multiplyScalar(f));
    camTween = { t: 0, dur: reduceMotion ? 0 : 0.7, fromT: toT.clone(), fromP: camera.position.clone(), to: [toT, toP] };
  }
  function setMode(m) {
    if (m !== ST.mode && (m === 'stack' || ST.mode === 'stack')) dolly(m === 'stack' ? 1.5 : 1 / 1.5);
    ST.mode = m;
    press('view-mode', m);
    $('view-desc').innerHTML = VIEW_DESC[m] + (you.vol.on ? VOL_DESC : '');
  }
  function setSpin(s) { ST.spin = s; press('spin', s); $('spin-desc').innerHTML = SPIN_DESC[s]; }
  const volBox = $('volume');
  function setVolume(on) {
    you.vol.on = on;
    if (reduceMotion) you.vol.t = on ? 1 : 0;
    volBox.checked = on;
    $('ax-lo').textContent = on ? '6 above' : 'kata −6';
    $('ax-hi').textContent = on ? '6 below' : '+6 ana';
    setMode(ST.mode);
  }
  volBox.addEventListener('change', () => setVolume(volBox.checked));
  $('spin').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpin(b.dataset.v); });
  $('view-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
  $('speed').addEventListener('input', e => { ST.speed = +e.target.value; });
  $('reset').addEventListener('click', () => you.reset());
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const m = { Digit1: 'slice', Digit2: 'stack', Digit3: 'shadow' }[e.code];
    if (m) setMode(m);
    else if (e.code === 'KeyV') { if (!e.repeat) setVolume(!you.vol.on); }
    else if (e.code === 'Space' && !e.target.closest('button, input')) { e.preventDefault(); setWant(!want); }
  });

  /* ---------- compass ---------- */
  // The four world axes as seen from your orbit camera, each projected into your slice, as in the explorer.
  const compass = $('compass'), cctx = compass.getContext('2d');
  const INK = tok('--ink'), C_FONT = '11px ' + tok('--mono'), C_DOT = tok('--muted');
  const AXES = [['x', 0, INK], ['y', 1, INK], ['z', 2, INK], ['w', 3, tok('--accent')]];
  const _cv = new THREE.Vector3(), _cm = new THREE.Matrix4();
  function drawCompass(V) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(compass.clientWidth * dpr);
    if (compass.width !== size) compass.width = compass.height = size;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, size, size);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = compass.clientWidth / 2, len = mid * 0.62;
    _cm.extractRotation(camera.matrixWorldInverse);
    cctx.font = C_FONT; cctx.textAlign = 'center'; cctx.textBaseline = 'middle'; cctx.lineCap = 'round';
    cctx.fillStyle = C_DOT; cctx.globalAlpha = 0.5; cctx.beginPath(); cctx.arc(mid, mid, 2, 0, 7); cctx.fill();
    const arrows = AXES.map(([name, i, col]) => {
      const e = [0, 0, 0, 0]; e[i] = 1;
      const out = Math.abs(dot(e, V.A));
      _cv.set(dot(e, V.R), dot(e, V.U), -dot(e, V.F)).applyMatrix4(_cm);
      return { name, col, out, x: _cv.x, y: -_cv.y, z: _cv.z };
    }).sort((a, b) => a.z - b.z);
    const stubs = arrows.filter(a => Math.hypot(a.x, a.y) < 0.35).reverse();
    for (const a of arrows) {
      const ex = mid + a.x * len, ey = mid + a.y * len;
      cctx.strokeStyle = cctx.fillStyle = a.col; cctx.globalAlpha = 0.35 + 0.65 * (1 - a.out);
      cctx.lineWidth = 1.6; cctx.setLineDash(a.out > Math.SQRT1_2 ? [3, 3] : []);
      cctx.beginPath(); cctx.moveTo(mid, mid); cctx.lineTo(ex, ey); cctx.stroke(); cctx.setLineDash([]);
      const d = Math.hypot(a.x, a.y), k = stubs.indexOf(a);
      if (k >= 0) { cctx.globalAlpha = 0.85; cctx.fillText(a.name + (a.out > Math.SQRT1_2 ? '⊥' : '·'), mid + (k - (stubs.length - 1) / 2) * 22, mid + 24); }
      else cctx.fillText(a.name, ex + (a.x / d) * 9, ey + (a.y / d) * 9);
    }
    cctx.globalAlpha = 1;
  }

  /* ---------- camera and loop ---------- */
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cssRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(view);
  resize();
  setSpin(ST.spin);
  setMode(ST.mode);
  const stackTags = $('stack-tags'), LABELS = () => you.vol.on ? ['above', 'middle', 'below'] : ['kata side', 'middle', 'ana side'];
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    keys.apply(dt);
    you.step(dt, reduceMotion);
    // about a turn a second while the music plays, easing in and out; the antenna's tesseract never quite stops
    const goal = want ? ST.speed * (reduceMotion ? 0.3 : 1) : 0;
    rate += (goal - rate) * (1 - Math.exp(-dt * 3));
    angle = (angle + rate * 2 * Math.PI * dt) % (6 * Math.PI);   // 3 turns: a whole period of Both
    antT += dt * (reduceMotion ? 0.05 : 0.25) + rate * dt;
    rebuild();
    if (camTween) {
      const ct = camTween;
      ct.t = ct.dur ? Math.min(1, ct.t + dt / ct.dur) : 1;
      controls.target.lerpVectors(ct.fromT, ct.to[0], ease(ct.t));
      camera.position.lerpVectors(ct.fromP, ct.to[1], ease(ct.t));
      if (ct.t >= 1) camTween = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    // label the stack of whichever object sits closest to where you're looking
    let tagged = null, best = Infinity;
    const V = you.frame();
    if (ST.mode === 'stack') for (const [o, C] of [[OBJ[0], CAT_AT], [OBJ[1], TV_AT]]) {
      const c = inView(V, C, FACE).at, p = new THREE.Vector3(c[0], c[1], c[2]), d = p.distanceTo(controls.target);
      if (d < best) { best = d; tagged = { o, p }; }
    }
    stackTags.hidden = !tagged;
    if (tagged) {
      const w = view.clientWidth, h = view.clientHeight, si = tagged.o.stackInfo, labels = LABELS();
      [...stackTags.children].forEach((el, k) => {
        const v = new THREE.Vector3(tagged.p.x + (k - 1) * si.spacing, tagged.p.y + si.bottom, tagged.p.z).project(camera);
        el.textContent = labels[k];
        el.hidden = v.z > 1;
        el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, 0)`;
      });
    }
    drawCompass(V);
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
