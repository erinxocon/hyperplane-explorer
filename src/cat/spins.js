// The cat's spins and the views made for them, as pure 4D math (no three.js), so tests/unit/cat-views.test.js can
// check them in Node. A spin is a rotation by angle t in the cat's own coordinates; rot(i, j, t) turns axis i toward
// axis j. The page (main.js) turns the cat to face you with FACE, so its own x, y, w are world x, y, w and its z is
// world −z.
import { rot, mm, mv, add } from '../math4d.js';

export const DRIFT = 1.1;   // how far Pass through takes the cat along w
export const FACE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
const fmt = v => { const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); return s.startsWith('-') ? '−' + s.slice(1) : s; };

// R(t) is the rotation and drift(t) the move along w (Pass through). turns: how many turns of t bring it back to the
// start (every spin is back after three, the page's loop). label(degrees, total degrees, drift) is the readout.
// best: the view that shows it best (see BEST).
export const SPINS = {
  y: { R: t => rot(0, 2, t), turns: 1, best: 'level', label: t => `x–z turn ${t}°` },
  w: { R: t => rot(0, 3, t), turns: 1, best: 'front', label: t => `x–w turn ${t}°` },
  both: { R: t => mm(rot(0, 3, t / 3), rot(0, 2, t)), turns: 3, best: 'volume', label: (t, r) => `x–z turn ${t}° · x–w turn ${Math.round(r / 3) % 360}°` },
  pass: { R: t => rot(0, 2, t), drift: t => DRIFT * Math.sin(t / 3), turns: 3, best: 'level', label: (t, r, d) => `x–z turn ${t}° · w ${fmt(d)}` },
  double: { R: t => mm(rot(0, 2, t), rot(1, 3, t)), turns: 1, best: 'shadow', label: t => `x–z and y–w turns ${t}°` },
  opposite: { R: t => mm(rot(0, 2, t), rot(1, 3, -t)), turns: 1, best: 'shadow', label: t => `x–z turn ${t}° · y–w turn ${(360 - t) % 360}°` },
  knot: { R: t => mm(rot(0, 2, t), rot(1, 3, 2 * t / 3)), turns: 3, best: 'shadow', label: (t, r) => `x–z turn ${t}° · y–w turn ${Math.round(2 * r / 3) % 360}°` },
  flip: { R: t => rot(1, 3, t), turns: 1, best: 'front', label: t => `y–w turn ${t}°` },
  tumble: { R: t => mm(mm(rot(0, 2, t), rot(1, 3, 2 * t / 3)), rot(0, 1, t / 3)), turns: 3, best: 'shadow', label: (t, r) => `x–z turn ${t}° · y–w turn ${Math.round(2 * r / 3) % 360}° · x–y turn ${Math.round(r / 3) % 360}°` },
  wobble: { R: t => mm(mm(rot(0, 2, t), rot(2, 3, t / 3)), rot(3, 0, t / 3)), turns: 3, best: 'volume', label: (t, r) => `x–z turn ${t}° · z–w and w–x turns ${Math.round(r / 3) % 360}°` },
};

// The cat's orientation in the world at angle t of spin s, and how far it has moved along w.
export const pose = (s, t) => ({ M: mm(FACE, SPINS[s].R(t)), drift: SPINS[s].drift ? SPINS[s].drift(t) : 0 });

const X = [1, 0, 0, 0], Y = [0, 1, 0, 0], Z = [0, 0, 1, 0], W = [0, 0, 0, 1], neg = v => v.map(c => -c);
// Frames (right, up, forward, ana) used below, all turns of the start frame (x, y, z, w), so none is a mirror image.
export const FRAMES = {
  level: { R: X, U: Y, F: Z, A: W },          // the start: your slice is x, y, z
  front: { R: X, U: Y, F: W, A: neg(Z) },     // pitched a quarter turn into ana: your slice is x, y, w
  side: { R: W, U: Y, F: Z, A: neg(X) },      // swung a quarter turn into ana: your slice is w, y, z
  volume: { R: X, U: W, F: Z, A: neg(Y) },    // the start in volume view: your slice is x, w, z, laid level
};

// The best view for each kind of spin. A spin in one plane, or in planes that all leave one axis alone, stays inside
// any slice that holds those planes, so in that slice it is a plain 3D turn: the cut keeps its shape and just turns.
//   level:  your slice x, y, z holds the x–z turn (3D, Pass through).
//   front:  pitch your slice a quarter turn so it holds x, y and w (it now cuts across z), through the cat's head. It
//           holds the x–w turn (Through w) and the y–w turn (Somersault).
//   volume: volume view at the height of its head: the slice holds x, z and w, which every turn of Both and Wobble
//           stays in.
//   shadow: no slice holds both planes of a double rotation, or the three of Tumble, so Shadow with the trails on.
export const BEST = {
  level: { mode: 'slice', volume: false, frame: 'level' },
  front: { mode: 'slice', volume: false, frame: 'front' },
  volume: { mode: 'slice', volume: true, frame: 'level' },
  shadow: { mode: 'shadow', volume: false, frame: null, trails: true },
};

// The axis cross: four slices through the cat's center, each across one world axis, so each shows the other three.
// k is the axis (0 x, 1 y, 2 z, 3 w); the slice's own frame takes the place of yours for that panel.
export const CROSS = [
  { axis: 'x', frame: FRAMES.side, shows: 'w y z' },
  { axis: 'y', frame: FRAMES.volume, shows: 'x w z, w up' },
  { axis: 'z', frame: FRAMES.front, shows: 'x y w' },
  { axis: 'w', frame: FRAMES.level, shows: 'x y z' },
];

// The film strip: n angles evenly spread over one whole loop of spin s.
export const filmAngles = (s, n) => Array.from({ length: n }, (_, j) => j * SPINS[s].turns * 2 * Math.PI / n);

// The path point p (the cat's own coordinates, on its skin at w = 0) runs along over one loop of spin s: `steps`
// points from the cat's center at rest, in world coordinates. It closes: the point after the last is the first.
export function trail(s, p, steps) {
  const T = SPINS[s].turns * 2 * Math.PI, p4 = [p[0], p[1], p[2], 0];
  return Array.from({ length: steps }, (_, i) => { const { M, drift } = pose(s, i * T / steps); return add(mv(M, p4), [0, 0, 0, drift]); });
}
