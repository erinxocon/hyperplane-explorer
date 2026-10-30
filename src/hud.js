// Panel and overlay pieces shared by the explorer and the cat page: the frame readout, the ana–kata ruler's bars,
// the Stack panel labels and the compass. They read the display frame V (see CLAUDE.md).
import * as THREE from 'three';
import { dot } from './math4d.js';
import { tok } from './scenery.js';

export const fmt = v => { const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); return s.startsWith('-') ? '−' + s.slice(1) : s; };

// The position readout (#px … #pw) and the frame matrix (#mtx): your R, U, F and A as rows, shaded by size.
export function createReadout() {
  const mtx = document.getElementById('mtx'), ROWS = [['R', 'right'], ['U', 'up'], ['F', 'forward'], ['A', 'ana']];
  mtx.innerHTML = '<tr><th></th><th>x</th><th>y</th><th>z</th><th>w</th></tr>' +
    ROWS.map(([k, n]) => `<tr class="${k.toLowerCase()}"><th class="r"><i>${k}</i> ${n}</th>${'<td></td>'.repeat(4)}</tr>`).join('');
  const cells = [...mtx.querySelectorAll('tr')].slice(1).map(tr => [...tr.querySelectorAll('td')]);
  const hud = ['px', 'py', 'pz', 'pw'].map(id => document.getElementById(id));
  return (V, P) => {
    P.forEach((v, i) => { hud[i].textContent = fmt(v); });
    ROWS.forEach(([k], r) => V[k].forEach((v, c) => {
      const td = cells[r][c];
      td.textContent = fmt(v);
      td.style.background = `color-mix(in srgb, ${k === 'A' ? 'var(--accent)' : 'var(--ink)'} ${Math.round(Math.abs(v) * (k === 'A' ? 34 : 24))}%, transparent)`;
    }));
  };
}

// One ruler row: the bar shows the shape's extent [lo, hi] along ana, within ±RULER; the row lights up when it crosses
// your slice, and its title says so (`crossing`) or which side of you it lies.
export const RULER = 6;
export function drawRulerRow(row, bar, [lo, hi], volOn, crossing) {
  const L = Math.max(-RULER, lo), H = Math.min(RULER, hi), inSlice = lo < 0 && hi > 0;
  bar.hidden = !(H > L);
  if (H > L) { bar.style.left = ((L + RULER) / (2 * RULER) * 100) + '%'; bar.style.width = Math.max(0.8, (H - L) / (2 * RULER) * 100) + '%'; }
  row.classList.toggle('in', inSlice);
  const side = lo >= 0 ? (volOn ? 'below' : 'ana of') : (volOn ? 'above' : 'kata of');
  row.title = (inSlice ? crossing : `Lies ${side} you`) + ' · tap to center your slice on it';
}

export const stackLabels = volOn => volOn ? ['above', 'middle', 'below'] : ['kata side', 'middle', 'ana side'];
// Where Stack cuts a shape with extent [lo, hi] along ana: its middle and a quarter of its extent either side.
export const stackOffs = ([lo, hi]) => [-1, 0, 1].map(k => (lo + hi) / 2 + k * (hi - lo) / 4);
// A CSS transform that puts an element's top center at v, a point already projected to normalized device coordinates.
export const toScreen = (v, w, h) => `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, 0)`;
// Label the three Stack panels of a shape centered at `at` (scene coordinates), laid out and labeled as in its
// stackInfo `info` ({ spacing, bottom, labels }); no `at` hides them.
const _t = new THREE.Vector3();
export function placeStackTags(box, view, camera, at, info) {
  box.hidden = !at;
  if (!at) return;
  const w = view.clientWidth, h = view.clientHeight;
  [...box.children].forEach((el, k) => {
    _t.set(at.x + (k - 1) * info.spacing, at.y + info.bottom, at.z).project(camera);
    el.textContent = info.labels[k];
    el.hidden = _t.z > 1;
    el.style.transform = toScreen(_t, w, h);
  });
}

// Compass: the four world axes as seen from your orbit camera. Each axis is projected into your slice, so an arrow
// shrinks as the axis leaves the slice (and as it turns toward the camera). Arrows too short to label get their label
// in a row below instead; level, w lies entirely out of the slice and only shows there, as "w⊥".
export function createCompass(canvas) {
  const cctx = canvas.getContext('2d');
  const INK = tok('--ink'), C_FONT = '11px ' + tok('--mono'), C_DOT = tok('--muted');
  const AXES = [['x', 0, INK], ['y', 1, INK], ['z', 2, INK], ['w', 3, tok('--accent')]];
  const _cv = new THREE.Vector3(), _cm = new THREE.Matrix4();
  return (V, camera) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(canvas.clientWidth * dpr);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, size, size);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = canvas.clientWidth / 2, len = mid * 0.62;
    _cm.extractRotation(camera.matrixWorldInverse);
    cctx.font = C_FONT; cctx.textAlign = 'center'; cctx.textBaseline = 'middle'; cctx.lineCap = 'round';
    cctx.fillStyle = C_DOT; cctx.globalAlpha = 0.5; cctx.beginPath(); cctx.arc(mid, mid, 2, 0, 7); cctx.fill();
    const arrows = AXES.map(([name, i, col]) => {
      const e = [0, 0, 0, 0]; e[i] = 1;
      const out = Math.abs(dot(e, V.A)); // how far this axis points out of the slice
      _cv.set(dot(e, V.R), dot(e, V.U), -dot(e, V.F)).applyMatrix4(_cm);
      return { name, col, out, x: _cv.x, y: -_cv.y, z: _cv.z };
    }).sort((a, b) => a.z - b.z); // draw far arrows first
    const stubs = arrows.filter(a => Math.hypot(a.x, a.y) < 0.35).reverse(); // end-on or out of the slice: label them in a row below
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
  };
}
