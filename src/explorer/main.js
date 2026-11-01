// Hyperplane Explorer: a 3D slice (or stack, or shadow) of a 4D world. This is the page: the shapes (shapes/world.js
// lists them) and their panel, on the walker (walk.js) that the walking pages share. Like every shared module, the shapes
// take what they need from the page as arguments. See CLAUDE.md for the model and conventions before changing anything.
import { add, mul, rot, mm } from '../math4d.js';
import { createWalker } from '../walk.js';
import { $ } from '../utils.js';
import { createWorld } from '../shapes/world.js';
import { drawRulerRow } from '../hud.js';

const VIEW_DESC = {
  slice: '<b>Slice</b> shows what a 3D being living in your hyperplane would see: each shape cut by your slice, and only what the slice crosses. A slice takes away one dimension: 4D solids show as solids, the 3D Klein bottle and the 4D Möbius strip as surfaces, and the Klein bottle, a surface, as curves drawn as thin tubes.',
  stack: '<b>Stack</b> cuts every shape with three parallel slices spaced along ana and lays them side by side, kata on the left, ana on the right, like CT scans of a 4D object. Shapes appear whether or not your own slice crosses them, so ones that differ only in w overlap; use the eye toggles to separate them.',
  shadow: '<b>Shadow</b> is a 4D perspective projection along ana: what a 4D eye ana of each shape would see on its 3D retina. Parts further kata shrink toward the middle. Polytopes become the classic nested wireframes and the glome shows a Clifford torus between two linked circles; on both, edges further kata are dimmer and bluer and edges nearer the eye brighter and warmer. Earth shows its two w-caps joined like a drawn cylinder, with the cap nearer the eye see-through. The Klein bottle’s shadow has to pass through itself, though the bottle in 4D does not. The 3D Klein bottle shows some of its spheres and the path of their poles. The 4D Möbius strip shows a ring of its disks; the bright line runs along their top edges and comes back along the bottom. Shapes that differ only in w, like the tesseract, glome and 16-cell, land on the same spot; use the eye toggles to pull them apart.',
};

function main() {
  const walker = createWalker({ viewDesc: VIEW_DESC });
  if (!walker) return;
  const { S, VOL, frame, redraw, startJump } = walker;
  const WORLD = createWorld(walker.scene, walker.BG);

  /* ---------- the shapes panel ---------- */
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

  const earthState = $('earth-state'), mobiusState = $('mobius-state'), rulerNote = $('ruler-note'), RULER_NOTE = rulerNote.innerHTML;
  const spinBox = $('spin');
  let spinT = 0;
  spinBox.addEventListener('change', redraw);

  walker.run(WORLD, {
    // the 4D spin (Spin checkbox) when it is on
    spinM: () => spinT ? mm(rot(0, 3, spinT * 0.37), rot(1, 2, spinT * 0.23)) : null,
    tick(dt) { if (spinBox.checked) { spinT += dt; redraw(); } },
    update() {
      const earth = WORLD.find(o => o.globe);
      earthState.textContent = earth.state;
      earthState.classList.toggle('on', earth.state === 'sliced open');
      const mobius = WORLD.find(o => o.disks);
      mobiusState.textContent = mobius.state;
      mobiusState.classList.toggle('on', mobius.state === 'Möbius strip');
      for (const o of WORLD) drawRulerRow(o.row, o.barEl, o.range, VOL.on, 'Intersects your slice');
    },
    volume(on) {
      $('ax-lo').textContent = on ? '6 above' : 'kata −6';
      $('ax-hi').textContent = on ? '6 below' : '+6 ana';
      rulerNote.innerHTML = on ? 'Volume view slices level, so each bar is a shape’s extent in height, above to the left. Bars crossing the line intersect your slice. Tap a name to move your slice to that shape’s height; use the eye to show or hide it.' : RULER_NOTE;
    },
  });
}

main();
