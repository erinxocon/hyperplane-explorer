// The plumbing every page shares (the explorer, chess and the cat): finding elements, reduced motion, the renderer,
// segmented buttons, the view keys, and tweening the orbit camera. Scene pieces are scenery.js and panel pieces hud.js.
import * as THREE from 'three';
import { ease } from './math4d.js';

export const $ = id => document.getElementById(id);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A WebGL renderer, its canvas first in `view`, or null with a note there that `what` can't be drawn without WebGL.
export function createRenderer(view, what) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (e) { view.insertAdjacentHTML('beforeend', `<div class="err">WebGL is not available in this browser, so ${what} cannot be drawn.</div>`); return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  view.prepend(renderer.domElement);
  return renderer;
}
// A segmented control (an element of buttons with data-v): show the one for v as pressed, or call fn(button) on a click.
export const press = (id, v) => { for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
export const onButton = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) fn(b); });
// the keys for the three views
export const VIEW_KEYS = { Digit1: 'slice', Digit2: 'stack', Digit3: 'shadow' };

// Tweens of the orbit camera: go(to, dur) eases it to look at target from position, to = [target, position], or a
// function giving them, which is followed as it changes; dolly(f) moves it f times as far from what it looks at; set(to)
// puts it there at once. go and dolly are instant with reduced motion (on the next step), and orbiting by hand stops
// them. The frame loop calls step(dt).
export function cameraTween(camera, controls) {
  let tw = null;
  controls.addEventListener('start', () => { tw = null; });
  const go = (to, dur) => { tw = { t: 0, dur: reduceMotion ? 0 : dur, fromT: controls.target.clone(), fromP: camera.position.clone(), to: typeof to === 'function' ? to : () => to }; };
  return {
    go,
    set([target, position]) { tw = null; controls.target.copy(target); camera.position.copy(position); },
    dolly(f, dur = 0.7) {
      const t = controls.target.clone();
      go([t, t.clone().add(camera.position.clone().sub(t).multiplyScalar(f))], dur);
    },
    step(dt) {
      if (!tw) return;
      tw.t = tw.dur ? Math.min(1, tw.t + dt / tw.dur) : 1;
      const e = ease(tw.t), [target, position] = tw.to();
      controls.target.lerpVectors(tw.fromT, target, e);
      camera.position.lerpVectors(tw.fromP, position, e);
      if (tw.t >= 1) tw = null;
    },
  };
}
