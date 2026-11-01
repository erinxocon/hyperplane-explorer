// Hyperplane Explorer: a 3D slice (or stack, or shadow) of a 4D world. This is the page: the scene, the panel, the views,
// jumps and the frame loop, with its state (you, the display frame, the view) in state.js beside it. The shapes it shows
// are shapes/ (world.js lists them) and the Rubik's cube rubik/; like every shared module, they take what they need
// from the page as arguments. See CLAUDE.md for the model and conventions before changing anything here.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { add, mul, dot, lerp, ease, rot, mm, slerp } from '../math4d.js';
import { bindControls } from '../viewer.js';
import { you, S, VOL, VIEW, frame, updateFrame, redraw, takeRedraw } from './state.js';
import { $, reduceMotion, createRenderer, press, onButton, VIEW_KEYS, cameraTween } from '../utils.js';
import { tok, createFloor, createMarker } from '../scenery.js';
import { createReadout, createCompass, drawRulerRow, stackLabels, placeStackTags } from '../hud.js';
import { createWorld } from '../shapes/world.js';
import { local } from '../shapes/draw.js';
import { createPuzzle } from '../rubik/puzzle.js';
import '../styles.css';

const FLOOR_Y = -2.4;

function main() {
  const view = $('view');
  let spinT = 0, jump = null;

  /* ---------- three.js scene ---------- */
  const BG = new THREE.Color(tok('--ground'));
  const renderer = createRenderer(view, 'the 3D slice');
  if (!renderer) return;
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 16, 42);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 200);
  camera.position.set(0, 3.4, 6.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.2, -4.5);
  controls.enableDamping = true;
  controls.maxDistance = 40; controls.minDistance = 1.5;
  controls.update();
  const cam = cameraTween(camera, controls), CAM0 = new THREE.Vector3(0, 3.4, 6.2);
  let orbited = false;   // once the camera has been moved, by hand or by a tween, resizing leaves it alone
  controls.addEventListener('start', () => { orbited = true; });

  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a2230, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(4, 9, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb8a6ff, 0.25); fill.position.set(-6, 2, -4); scene.add(fill);

  // the floor, the 4D hyperplane y = FLOOR_Y cut by your slice, and you at the origin of the slice
  const floor = createFloor(BG, [9, 30, -4]);
  scene.add(floor.mesh, createMarker());

  // the shapes (shapes/world.js), each with build(V, ctx) to redraw it, and the Rubik's cube (rubik/)
  const WORLD = createWorld(scene, BG);
  const puzzle = createPuzzle(WORLD.find(o => o.puzzle), {
    frame, mode: () => VIEW.mode, volOn: () => VOL.on, redraw, S, startJump, setVolume, frameOn,
  });
  WORLD.find(o => o.puzzle).build = puzzle.rebuild;

  // redraw every shape for your display frame, with the 4D spin (Spin checkbox) when it is on
  function rebuild() {
    const V = updateFrame();
    const ctx = { mode: VIEW.mode, labels: stackLabels(VOL.on), spinM: spinT ? mm(rot(0, 3, spinT * 0.37), rot(1, 2, spinT * 0.23)) : null };
    for (const o of WORLD) o.build(V, ctx);
    floor.update(V, FLOOR_Y);
    updatePanel(V);
  }

  /* ---------- panel ---------- */
  const ruler = $('ruler');
  const EYE_ON = '<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  let savedHidden = [];
  try { savedHidden = JSON.parse(localStorage.getItem('hw-hidden') || '[]'); } catch (_) {}
  const saveHidden = () => { try { localStorage.setItem('hw-hidden', JSON.stringify(WORLD.filter(o => o.hidden).map(o => o.name))); } catch (_) {} };
  function setHidden(o, hidden) {
    o.hidden = hidden;
    o.group.visible = !hidden;
    o.eye.setAttribute('aria-pressed', String(!hidden));
    o.eye.setAttribute('aria-label', (hidden ? 'Show ' : 'Hide ') + o.name);
    o.eye.title = (hidden ? 'Show ' : 'Hide ') + o.name;
    o.wrap.classList.toggle('hidden-shape', hidden);
    syncSolo();
  }
  // the Rubik's panel's "Only the cube" button, which hides or shows every other shape
  function syncSolo() {
    const b = $('rk-solo');
    if (!b || WORLD.some(w => !w.eye)) return;
    const solo = WORLD.every(w => w.puzzle ? !w.hidden : w.hidden);
    b.setAttribute('aria-pressed', String(solo));
    b.textContent = solo ? 'Show all shapes' : 'Only the cube';
  }
  WORLD.forEach((o, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'shape-row';
    const eye = document.createElement('button');
    eye.className = 'eye'; eye.type = 'button'; eye.id = 'vis-' + i;
    eye.innerHTML = EYE_ON + EYE_OFF;
    eye.addEventListener('click', () => { setHidden(o, !o.hidden); saveHidden(); });
    wrap.appendChild(eye);
    o.eye = eye; o.wrap = wrap;
    const b = document.createElement('button');
    b.className = 'row-btn'; b.id = 'row-' + i; b.type = 'button';
    b.innerHTML = `<span class="nm"><span class="dot" style="background:${o.color}"></span>${o.name}</span><span class="track"><span class="bar" style="background:${o.color}"></span></span>`;
    b.addEventListener('click', () => {
      const c = o.focus ?? (o.range[0] + o.range[1]) / 2;
      startJump({ from: S.P.slice(), to: add(S.P, mul(frame().A, c)), t: 0 });
    });
    o.row = b; o.barEl = b.querySelector('.bar');
    wrap.appendChild(b);
    ruler.appendChild(wrap);
    setHidden(o, savedHidden.includes(o.name));
  });
  $('show-all').addEventListener('click', () => { WORLD.forEach(o => setHidden(o, false)); saveHidden(); });
  $('hide-all').addEventListener('click', () => { WORLD.forEach(o => setHidden(o, true)); saveHidden(); });
  $('rk-solo').addEventListener('click', () => {
    const others = WORLD.filter(w => !w.puzzle), showingOthers = others.some(w => !w.hidden);
    others.forEach(w => setHidden(w, showingOthers));
    WORLD.filter(w => w.puzzle).forEach(w => setHidden(w, false));
    saveHidden();
  });

  const earthState = $('earth-state'), mobiusState = $('mobius-state'), readout = createReadout();
  function updatePanel(V) {
    readout(V, S.P);
    const earth = WORLD.find(o => o.globe);
    earthState.textContent = earth.state;
    earthState.classList.toggle('on', earth.state === 'sliced open');
    const mobius = WORLD.find(o => o.disks);
    mobiusState.textContent = mobius.state;
    mobiusState.classList.toggle('on', mobius.state === 'Möbius strip');
    for (const o of WORLD) drawRulerRow(o.row, o.barEl, o.range, VOL.on, 'Intersects your slice');
  }

  /* ---------- input ---------- */
  // the movement keys and on-screen keys (viewer.js), acting on S; views and volume view have their own keys here
  const keys = bindControls({ act: (code, amount) => { you.act(code, amount); redraw(); } });
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (VIEW_KEYS[e.code]) setMode(VIEW_KEYS[e.code]);
    else if (e.code === 'KeyV') { if (!e.repeat) setVolume(!VOL.on); }
  });
  const spinBox = $('spin');
  spinBox.addEventListener('change', redraw);
  $('reset').addEventListener('click', () => { you.reset(); jump = null; redraw(); });

  /* ---------- views and camera ---------- */
  // turn the camera to 4D point `center` (followed as you move), from a set direction, `scale` times the usual distance
  function frameOn(center, scale, dur = 0.9) {
    orbited = true;
    cam.go(() => {
      const lc = local(frame(), center), at = new THREE.Vector3(lc.x, lc.y - 0.2, lc.z);
      return [at, at.clone().add((VIEW.mode === 'stack' ? new THREE.Vector3(0, 2.3, 5.6) : new THREE.Vector3(1.9, 2.2, 5.2)).multiplyScalar(scale))];
    }, dur);
  }
  const VIEW_DESC = {
    slice: '<b>Slice</b> shows what a 3D being living in your hyperplane would see: each shape cut by your slice, and only what the slice crosses. A slice takes away one dimension: 4D solids show as solids, the 3D Klein bottle and the 4D Möbius strip as surfaces, and the Klein bottle, a surface, as curves drawn as thin tubes.',
    stack: '<b>Stack</b> cuts every shape with three parallel slices spaced along ana and lays them side by side, kata on the left, ana on the right, like CT scans of a 4D object. Shapes appear whether or not your own slice crosses them, so ones that differ only in w overlap; use the eye toggles to separate them.',
    shadow: '<b>Shadow</b> is a 4D perspective projection along ana: what a 4D eye ana of each shape would see on its 3D retina. Parts further kata shrink toward the middle. Polytopes become the classic nested wireframes and the glome shows a Clifford torus between two linked circles; on both, edges further kata are dimmer and bluer and edges nearer the eye brighter and warmer. Earth shows its two w-caps joined like a drawn cylinder, with the cap nearer the eye see-through. The Klein bottle’s shadow has to pass through itself, though the bottle in 4D does not. The 3D Klein bottle shows some of its spheres and the path of their poles. The 4D Möbius strip shows a ring of its disks; the bright line runs along their top edges and comes back along the bottom. Shapes that differ only in w, like the tesseract, glome and 16-cell, land on the same spot; use the eye toggles to pull them apart.',
  };
  const VOL_DESC = ' <b>Volume view is on:</b> your slice lies level, so here ana means down and kata means up.';
  function setMode(m) {
    if (m !== VIEW.mode && (m === 'stack' || VIEW.mode === 'stack')) { orbited = true; cam.dolly(m === 'stack' ? 1.5 : 1 / 1.5); }
    VIEW.mode = m;
    press('view-mode', m);
    $('view-desc').innerHTML = VIEW_DESC[m] + (VOL.on ? VOL_DESC : '');
    puzzle.explain(m);
    redraw();
  }
  onButton('view-mode', b => setMode(b.dataset.v));
  const volBox = $('volume'), rulerNote = $('ruler-note'), RULER_NOTE = rulerNote.innerHTML;
  function setVolume(on) {
    VOL.on = on;
    volBox.checked = on;
    $('ax-lo').textContent = on ? '6 above' : 'kata −6';
    $('ax-hi').textContent = on ? '6 below' : '+6 ana';
    rulerNote.innerHTML = on ? 'Volume view slices level, so each bar is a shape’s extent in height, above to the left. Bars crossing the line intersect your slice. Tap a name to move your slice to that shape’s height; use the eye to show or hide it.' : RULER_NOTE;
    setMode(VIEW.mode);
    puzzle.updatePanel();   // Face this layer reads differently in volume view
  }
  volBox.addEventListener('change', () => setVolume(volBox.checked));
  setMode('slice'); syncSolo();

  /* ---------- jumps ---------- */
  // A jump moves you from `from` to `to`, optionally turning your slice: `turn` is one plane rotation (Face this layer),
  // `frame` a whole new frame (Diagonal view). With reduced motion it lands at once, and so does a frame exactly 180°
  // away, which has no single shortest path (slerp gives none).
  const frameMat = f => [...f.R, 0, 1, 0, 0, ...f.F, ...f.A];
  // rotate x in the plane spanned by orthonormal u, v by angle a (u tips toward v)
  const planeRot = (x, u, v, a) => {
    const xu = dot(x, u), xv = dot(x, v), c = Math.cos(a) - 1, s = Math.sin(a);
    return add(x, add(mul(u, c * xu - s * xv), mul(v, c * xv + s * xu)));
  };
  const snapFrame = () => { for (const k of ['R', 'U', 'F', 'A']) S[k] = S[k].map(x => Math.abs(x) < 1e-9 ? 0 : Math.abs(Math.abs(x) - 1) < 1e-9 ? Math.sign(x) : x); };
  function startJump(j) {
    jump = j;
    j.instant = reduceMotion || (j.frame && !slerp(frameMat(j.frame.from), frameMat(j.frame.to), 0.5));
    if (j.instant) stepJump(0);
  }
  function stepJump(dt) {
    jump.t = jump.instant ? 1 : Math.min(1, jump.t + dt / (jump.dur || 0.6));
    const e = ease(jump.t);
    S.P = lerp(jump.from, jump.to, e);
    if (jump.frame) {
      const { from, to } = jump.frame;
      const M = slerp(frameMat(from), frameMat(to), e);
      if (M) { S.R = M.slice(0, 4); S.F = M.slice(8, 12); S.A = M.slice(12, 16); } // rows are R, U, F, A
      else for (const k of ['R', 'F', 'A']) S[k] = lerp(from[k], to[k], e);
      you.orthonormalize();
      if (jump.t >= 1) { S.R = to.R; S.F = to.F; S.A = to.A; }
    }
    if (jump.turn) {
      const T = jump.turn;
      for (const k of ['R', 'F', 'A']) S[k] = planeRot(T[k], T.A, T.v, T.theta * e);
      if (jump.t >= 1) { you.orthonormalize(); snapFrame(); }
    }
    redraw();
    if (jump.t >= 1) jump = null;
  }

  /* ---------- loop ---------- */
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!orbited) { // pull back on narrow screens so the whole scene fits
      const k = Math.max(1, 1.3 / camera.aspect);
      camera.position.copy(controls.target).add(CAM0.clone().sub(controls.target).multiplyScalar(k));
      controls.update();
    }
  }
  new ResizeObserver(resize).observe(view);
  resize();

  const stackTags = $('stack-tags'), drawCompass = createCompass($('compass'));
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    keys.apply(dt);
    if (jump && (jump.turn || jump.frame) && keys.held().some(c => c.startsWith('rot'))) jump = null; // manual rotation cancels a turn
    if (jump) stepJump(dt);
    const volT = VOL.t;
    you.step(dt, reduceMotion);   // volume view's tween, one second each way
    if (VOL.t !== volT) redraw();
    if (puzzle.step(dt)) redraw();
    if (spinBox.checked) { spinT += dt; redraw(); }
    if (takeRedraw()) rebuild();
    cam.step(dt);
    controls.update();
    camera.updateMatrixWorld();
    // label the stack of whichever visible shape sits closest to where you're looking
    const V = frame();
    let tagged = null, best = Infinity;
    if (VIEW.mode === 'stack') for (const o of WORLD) {
      if (o.hidden || !o.stackInfo) continue;
      const at = local(V, o.center), dist = at.distanceTo(controls.target);
      if (dist < best) { best = dist; tagged = { o, at }; }
    }
    placeStackTags(stackTags, view, camera, tagged?.at, tagged?.o.stackInfo);
    for (const o of WORLD) o.tick?.(camera, dt, reduceMotion);
    drawCompass(V, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

main();
