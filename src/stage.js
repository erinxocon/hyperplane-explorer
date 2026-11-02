// The stage: what every 4D page shares, whether you walk its world or not. It makes the renderer, scene, camera and
// orbit controls with their eased moves, runs the frame loop, keeps the resize, and owns the view: Slice, Stack or
// Shadow, with its buttons, its keys (1 · 2 · 3) and its description. What each view means is the page's: it hears
// about a change in onMode and moves its own camera. walk.js adds the viewer, floor and panel for pages where you
// walk the world (the explorer, the Rubik's cube); chess uses the stage alone.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { tok } from './scenery.js';
import { $, createRenderer, press, onButton, VIEW_KEYS, cameraTween } from './utils.js';
import './styles.css';

// Options: what (what can't be drawn without WebGL, for the note), fov/near/far, position and target of the camera at
// the start (else the page frames it), distance [min, max] of the orbit, fog [near, far], mode (the view to start in),
// viewDesc (text for each view, shown under the buttons, plus note(), anything to add), onMode(m, previous) after the
// view is set, onResize() after the canvas is resized. Returns null, with a note in the view, without WebGL.
export function createStage({ what, fov = 52, near = 0.05, far = 200, position, target, distance = [1.5, 40], fog = [16, 42],
  mode = 'slice', viewDesc = {}, onMode, onResize } = {}) {
  const view = $('view');
  const renderer = createRenderer(view, what);
  if (!renderer) return null;
  const BG = new THREE.Color(tok('--ground'));
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, ...fog);
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  if (position) camera.position.set(...position);
  const controls = new OrbitControls(camera, renderer.domElement);
  if (target) controls.target.set(...target);
  controls.enableDamping = true;
  [controls.minDistance, controls.maxDistance] = distance;
  controls.update();
  const stage = {
    renderer, scene, BG, camera, controls, view,
    cam: cameraTween(camera, controls),
    orbited: false,   // once the camera has been moved, by hand or by a tween, a page may leave it alone on resize
    note: () => '',   // text a page adds after the current view's description
  };
  controls.addEventListener('start', () => { stage.orbited = true; });

  /* ---------- the view ---------- */
  let current = mode;
  stage.mode = () => current;
  // show the view's buttons and description (setMode does this too)
  stage.showMode = () => {
    press('view-mode', current);
    const desc = $('view-desc'), text = (viewDesc[current] || '') + stage.note();
    if (desc) { desc.innerHTML = text; desc.hidden = !text; }
  };
  stage.setMode = m => {
    const prev = current;
    current = m;
    stage.showMode();
    onMode?.(m, prev);
  };
  onButton('view-mode', b => stage.setMode(b.dataset.v));
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (VIEW_KEYS[e.code]) stage.setMode(VIEW_KEYS[e.code]);
  });

  /* ---------- size and loop ---------- */
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    onResize?.();
  }
  // Start the page: size the canvas, then each frame call before(dt), step the camera, call after(dt) with the camera
  // settled (to place labels), and draw.
  stage.start = ({ before, after } = {}) => {
    new ResizeObserver(resize).observe(view);
    resize();
    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      before?.(dt);
      stage.cam.step(dt);
      controls.update();
      camera.updateMatrixWorld();
      after?.(dt);
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    // WebGPU's device comes up asynchronously
    if (renderer.isWebGPURenderer) renderer.init().then(() => requestAnimationFrame(tick));
    else requestAnimationFrame(tick);
  };
  return stage;
}
