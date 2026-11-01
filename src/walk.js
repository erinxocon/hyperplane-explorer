// The walker: a stage (stage.js) for pages where you walk a 4D world (the explorer, the Rubik's cube). It adds the floor
// and you, holds your state (you, the display frame V, volume view), draws the View / Move / Rotate panel and the
// overlay (nav.js), and runs the frame loop: keys, jumps, redrawing the world once when something changed, the compass
// and the Stack labels. A page brings its world, a list of entries each with build(V, ctx) (see shapes/world.js), and
// its own sections of the panel, and hooks into the loop through run(). The walker is also the `ctx` the Rubik's cube
// takes (frame, mode, volOn, redraw, S, startJump, setVolume, frameOn). See CLAUDE.md, "Core model": controls and
// frame ops act on S; drawing reads V.
import * as THREE from 'three';
import { add, mul, dot, lerp, ease, slerp } from './math4d.js';
import { createViewer, bindControls } from './viewer.js';
import { $, reduceMotion } from './utils.js';
import { createFloor, createMarker } from './scenery.js';
import { createReadout, createCompass, stackLabels, placeStackTags } from './hud.js';
import { local } from './shapes/draw.js';
import { createStage } from './stage.js';
import { viewOverlay, NAV_HTML, FRAME_HTML } from './nav.js';

const VOL_DESC = ' <b>Volume view is on:</b> your slice lies level, so here ana means down and kata means up.';
// Put the shared markup in the page (at #view, #nav and #nav-frame), then make the stage and the floor. Options: viewDesc
// (the page's text for each view, shown under the View buttons), hint (added to the line at the bottom of the view),
// floorY, floor (its extent [half-width, far, near z]), position and target (the camera at the start), fog [near, far],
// lights (intensities of the hemisphere light, the sun and the fill; no fill light if 0). Returns null, with a note in
// the view, without WebGL.
export function createWalker({ viewDesc = {}, hint = '', floorY = -2.4, floor: floorSize = [9, 30, -4], what = 'the 3D slice',
  position = [0, 3.4, 6.2], target = [0, -0.2, -4.5], fog = [16, 42], lights = {} } = {}) {
  const { hemi = 0.75, sun: sunLight = 0.85, fill: fillLight = 0.25 } = lights;
  $('view').insertAdjacentHTML('beforeend', viewOverlay(hint));
  $('nav').outerHTML = NAV_HTML;
  $('nav-frame').outerHTML = FRAME_HTML;

  let hooks = {};
  const stage = createStage({
    what, viewDesc, fog, mode: 'slice', position, target,
    onMode(m, prev) {
      if (m !== prev && (m === 'stack' || prev === 'stack')) { stage.orbited = true; stage.cam.dolly(m === 'stack' ? 1.5 : 1 / 1.5); }
      redraw();
      hooks.mode?.(m);
    },
    onResize() {
      if (!stage.orbited) pullBack();
      hooks.resize?.();
    },
  });
  function pullBack() {   // on narrow screens, pull the camera back so the whole scene fits
    const k = Math.max(1, 1.3 / stage.camera.aspect);
    stage.camera.position.copy(stage.controls.target).add(new THREE.Vector3(...position).sub(stage.controls.target).multiplyScalar(k));
    stage.controls.update();
  }
  if (!stage) return null;
  const { scene, BG, camera, controls, cam, view } = stage;

  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a2230, hemi));
  const sun = new THREE.DirectionalLight(0xffffff, sunLight); sun.position.set(4, 9, 6); scene.add(sun);
  if (fillLight) { const fill = new THREE.DirectionalLight(0xb8a6ff, fillLight); fill.position.set(-6, 2, -4); scene.add(fill); }

  // the floor, the 4D hyperplane y = floorY cut by your slice, and you at the origin of the slice
  const floor = createFloor(BG, floorSize);
  scene.add(floor.mesh, createMarker());

  /* ---------- state ---------- */
  // you: S, your frame (it keeps its identity for the page's life; reset refills it), and VOL, volume view's tween
  const you = createViewer(), S = you.S, VOL = you.vol;
  stage.note = () => (VOL.on ? VOL_DESC : '');
  // V shares P, R and F with S. Volume view turns it 90° in the U–A plane (U → A, A → −U), so the slice lies level, w
  // shows as up and your own frame, with U locked to world y, is never touched. It is set once per redraw.
  let V = S, dirty = true, jump = null, world = [];
  const frame = () => V;
  const redraw = () => { dirty = true; };

  /* ---------- views and camera ---------- */
  // turn the camera to 4D point `center` (followed as you move), from a set direction, `scale` times the usual distance
  function frameOn(center, scale, dur = 0.9) {
    stage.orbited = true;
    cam.go(() => {
      const lc = local(frame(), center), at = new THREE.Vector3(lc.x, lc.y - 0.2, lc.z);
      return [at, at.clone().add((stage.mode() === 'stack' ? new THREE.Vector3(0, 2.3, 5.6) : new THREE.Vector3(1.9, 2.2, 5.2)).multiplyScalar(scale))];
    }, dur);
  }
  const volBox = $('volume');
  function setVolume(on) {
    VOL.on = on;
    volBox.checked = on;
    stage.setMode(stage.mode());   // the description and the page's mode hook change with volume view
    hooks.volume?.(on);
  }

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

  /* ---------- the world and the loop ---------- */
  const readout = createReadout();
  // redraw every entry of the world for your display frame
  function rebuild() {
    V = you.frame();
    const ctx = { mode: stage.mode(), labels: stackLabels(VOL.on), spinM: hooks.spinM?.() ?? null };
    for (const o of world) o.build(V, ctx);
    floor.update(V, floorY);
    readout(V, S.P);
    hooks.update?.(V);
  }

  // Start the page: `list` is its world (entries with build(V, ctx), range, stackInfo, optional tick(camera, dt,
  // reduceMotion)). hooks, all optional: mode(m) after the view changes, volume(on) after volume view does, spinM() the
  // 4D spin matrix or null, tick(dt) each frame before drawing (call redraw() if it changed the world), update(V) after
  // every redraw of the world, resize() after the canvas is resized, after(dt) each frame once the camera has settled, just
  // before drawing.
  function run(list, h = {}) {
    world = list; hooks = h;
    // the movement keys and on-screen keys (viewer.js), acting on S; the view keys are the stage's, V is here
    const keys = bindControls({ act: (code, amount) => { you.act(code, amount); redraw(); } });
    window.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyV' && !e.repeat) setVolume(!VOL.on);
    });
    $('reset')?.addEventListener('click', () => { you.reset(); jump = null; redraw(); });
    volBox.addEventListener('change', () => setVolume(volBox.checked));
    stage.setMode('slice');

    const stackTags = $('stack-tags'), drawCompass = createCompass($('compass'));
    stage.start({
      before(dt) {
        keys.apply(dt);
        if (jump && (jump.turn || jump.frame) && keys.held().some(c => c.startsWith('rot'))) jump = null; // manual rotation cancels a turn
        if (jump) stepJump(dt);
        const volT = VOL.t;
        you.step(dt, reduceMotion);   // volume view's tween, one second each way
        if (VOL.t !== volT) redraw();
        hooks.tick?.(dt);
        if (dirty) { dirty = false; rebuild(); }
      },
      after(dt) {
        // label the stack of whichever visible shape sits closest to where you're looking
        let tagged = null, best = Infinity;
        if (stage.mode() === 'stack') for (const o of world) {
          if (o.hidden || !o.stackInfo) continue;
          const at = local(V, o.center), dist = at.distanceTo(controls.target);
          if (dist < best) { best = dist; tagged = { o, at }; }
        }
        placeStackTags(stackTags, view, camera, tagged?.at, tagged?.o.stackInfo);
        for (const o of world) o.tick?.(camera, dt, reduceMotion);
        drawCompass(V, camera);
        hooks.after?.(dt);
      },
    });
  }

  return { scene, BG, renderer: stage.renderer, camera, controls, view, S, VOL, run, frame, redraw, startJump, setVolume, frameOn, mode: stage.mode, volOn: () => VOL.on };
}
