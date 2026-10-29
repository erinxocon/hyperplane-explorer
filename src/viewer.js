// The viewer: you, a point P with an orthonormal frame R, U, F, A (right, up, forward, ana). U stays world y, so every
// turn happens in the x–z–w subspace and the floor stays a floor. Drawing reads frame(), which volume view turns 90°
// in the U–A plane (U -> A, A -> -U) so your slice lies level; moving and turning act on S. This is the explorer's
// model (see CLAUDE.md), packaged so other pages can share it.
import { add, sub, mul, dot, norm, lerp } from './math4d.js';

export const START = { P: [0, 0, 0, 0], R: [1, 0, 0, 0], U: [0, 1, 0, 0], F: [0, 0, 1, 0], A: [0, 0, 0, 1] };
// The keys, as in the explorer: W/A/S/D move, R/F height, E/Q ana/kata, J/L turn, I/K pitch into ana, U/O swing into ana.
export const KEYS = {
  KeyW: 'move:F:1', KeyS: 'move:F:-1', KeyA: 'move:R:-1', KeyD: 'move:R:1', KeyR: 'move:U:1', KeyF: 'move:U:-1',
  KeyE: 'move:A:1', KeyQ: 'move:A:-1', KeyJ: 'rot:RF:-1', KeyL: 'rot:RF:1', KeyI: 'rot:FA:1', KeyK: 'rot:FA:-1', KeyO: 'rot:RA:1', KeyU: 'rot:RA:-1',
};
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const copy = f => JSON.parse(JSON.stringify(f));

export function createViewer({ speed = 2.4, turn = 1 } = {}) {
  const v = { S: copy(START), vol: { on: false, t: 0 }, jump: null };
  v.orthonormalize = () => {
    const s = v.S;   // U stays world y; Gram-Schmidt F, R, A in the remaining x-z-w subspace
    s.F = norm(s.F);
    s.R = norm(sub(s.R, mul(s.F, dot(s.R, s.F))));
    s.A = sub(s.A, mul(s.F, dot(s.A, s.F)));
    s.A = norm(sub(s.A, mul(s.R, dot(s.A, s.R))));
  };
  v.rotatePlane = (plane, t) => {
    const s = v.S, c = Math.cos(t), sn = Math.sin(t), [p, q] = { RF: ['F', 'R'], FA: ['F', 'A'], RA: ['R', 'A'] }[plane];
    const a = s[p], b = s[q];
    s[p] = add(mul(a, c), mul(b, sn));   // p tips toward q
    s[q] = sub(mul(b, c), mul(a, sn));
    v.orthonormalize();
  };
  v.act = (code, amount) => {
    const [kind, ax, sign] = code.split(':');
    if (kind === 'move') v.S.P = add(v.S.P, mul(v.S[ax], +sign * amount * speed));
    else v.rotatePlane(ax, +sign * amount * turn);
  };
  v.frame = () => {
    if (!v.vol.t) return v.S;
    const th = ease(v.vol.t) * Math.PI / 2, c = Math.cos(th), s = Math.sin(th), S = v.S;
    return { P: S.P, R: S.R, F: S.F, U: add(mul(S.U, c), mul(S.A, s)), A: sub(mul(S.A, c), mul(S.U, s)) };
  };
  v.reset = () => { v.S = copy(START); v.jump = null; };
  v.jumpTo = to => { v.jump = { from: v.S.P.slice(), to, t: 0 }; };
  // Advance a jump and the volume-view tween (one second each way) by dt; `instant` skips the animation.
  v.step = (dt, instant = false) => {
    if (v.jump) {
      const j = v.jump;
      j.t = instant ? 1 : Math.min(1, j.t + dt / 0.6);
      v.S.P = lerp(j.from, j.to, ease(j.t));
      if (j.t >= 1) v.jump = null;
    }
    if (v.vol.t !== +v.vol.on) {
      v.vol.t = instant ? +v.vol.on : v.vol.on ? Math.min(1, v.vol.t + dt) : Math.max(0, v.vol.t - dt);
    }
  };
  return v;
}

// Wire the on-screen keys (.key[data-act], held with the pointer) and the keyboard to a viewer. The frame loop calls
// apply(dt) to act on whatever is held, and to light the keys being pressed.
export function bindControls(v, root = document) {
  const active = new Map(), keyEls = {};
  const press = c => active.set(c, (active.get(c) || 0) + 1);
  const release = c => { const n = (active.get(c) || 0) - 1; n > 0 ? active.set(c, n) : active.delete(c); };
  root.querySelectorAll('.key[data-act]').forEach(btn => {
    const code = btn.dataset.act;
    keyEls[code] = btn;
    let held = false;
    btn.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); held = true; try { btn.setPointerCapture(e.pointerId); } catch (_) {} press(code); v.act(code, 0.06); });
    const up = () => { if (!held) return; held = false; release(code); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, up));
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => { if (e.detail === 0) v.act(code, 0.25); });   // keyboard activation: one step
  });
  const down = new Set();
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const c = KEYS[e.code];
    if (!c) return;
    e.preventDefault();
    if (down.has(e.code)) return;
    down.add(e.code); press(c);
  });
  window.addEventListener('keyup', e => { const c = KEYS[e.code]; if (c && down.delete(e.code)) release(c); });
  window.addEventListener('blur', () => { down.clear(); active.clear(); });
  return {
    apply(dt) {
      for (const c of active.keys()) v.act(c, dt);
      for (const [c, el] of Object.entries(keyEls)) el.classList.toggle('on', active.has(c));
    },
  };
}
