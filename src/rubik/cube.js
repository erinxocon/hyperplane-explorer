// The 4D Rubik's cube, 3×3×3×3, as pure data: no three.js or DOM, so it runs in Node (tests/unit/rubik.test.js).
// Each of its 80 pieces is a small tesseract at home position h ∈ {−1, 0, 1}⁴ \ 0 with an integer rotation M, so it is
// now at M·h. A layer is the pieces with round((M·h)[axis]) = val, and a twist turns one 90° in a plane (i, j) that
// leaves out its axis; when the animation ends the turn is baked into M and rounded, so no error builds up. A sticker
// sits on home facet (axis i, sign) when h[i] = sign. O is a whole-puzzle rotation for display (Mirror via 4D and
// Double rotation); once it is an integer matrix and nothing is moving, it is baked into every piece.
import { ident, rot, mm, mv, mul, ease } from '../math4d.js';

// indexed axis·2 + (sign > 0): −X, +X, −Y, +Y, −Z, +Z, −W, +W
export const CELL_COLORS = ['#f08a2c', '#e3443c', '#f2cf35', '#eceee9', '#2f6ee0', '#2fae54', '#e862a8', '#9a62e8'];
export const colOf = (M, i) => [M[i], M[4 + i], M[8 + i], M[12 + i]];
const isIntMat = M => M.every(x => Math.abs(x - Math.round(x)) < 1e-6);
const isIdent = M => M.every((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-9);
// the rotation by a in the plane of orthonormal u, v (u tips toward v)
const planeRotM = (u, v, a) => {
  const c = Math.cos(a) - 1, s = Math.sin(a), M = ident();
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) M[r * 4 + k] += c * (u[r] * u[k] + v[r] * v[k]) + s * (v[r] * u[k] - u[r] * v[k]);
  return M;
};
const spinM = t => mm(rot(0, 1, t), rot(2, 3, t));   // isoclinic: X–Y and Z–W at the same rate
const inLayer = (p, axis, val) => Math.round(mv(p.M, p.h)[axis]) === val;

// Solved up to a whole-puzzle rotation: every sticker that faces one way has the same color.
export function isSolved(pieces) {
  const seen = {};
  for (const p of pieces) for (let i = 0; i < 4; i++) {
    if (!p.h[i]) continue;
    const v = mul(colOf(p.M, i), p.h[i]);
    const k = v.findIndex(x => x !== 0), key = k * 2 + (v[k] > 0), color = i * 2 + (p.h[i] > 0);
    if (seen[key] === undefined) seen[key] = color; else if (seen[key] !== color) return false;
  }
  return true;
}

export function createCube() {
  const pieces = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++)
    if (a || b || c || d) pieces.push({ h: [a, b, c, d], M: ident() });
  // axis, val: the selected layer. queue: twists to come; anim: the one under way. spin: Double rotation, which stops at
  // the next quarter turn (target) once turned off. mirror: Mirror via 4D under way.
  const cube = { pieces, axis: 0, val: 1, queue: [], anim: null, moves: 0, O: ident(), spin: { on: false, stopping: false, t: 0, target: 0 }, mirror: null };

  // twist the selected layer a quarter turn in the i–j plane, i toward j (dir 1) or back (dir −1)
  cube.twist = (i, j, dir) => { cube.queue.push({ axis: cube.axis, val: cube.val, i, j, dir }); cube.moves++; };
  cube.scramble = (n = 24, rand = Math.random) => {
    for (let k = 0; k < n; k++) {
      const axis = Math.floor(rand() * 4), rest = [0, 1, 2, 3].filter(x => x !== axis);
      const a = Math.floor(rand() * 3), b = (a + 1 + Math.floor(rand() * 2)) % 3;
      cube.queue.push({ axis, val: Math.floor(rand() * 3) - 1, i: rest[a], j: rest[b], dir: rand() < 0.5 ? 1 : -1, fast: true });
    }
    cube.moves = 0;
  };
  cube.reset = () => {
    cube.queue.length = 0; cube.anim = null; cube.moves = 0; cube.mirror = null;
    cube.O = ident(); Object.assign(cube.spin, { on: false, stopping: false, t: 0 });
    for (const p of pieces) p.M = ident();
  };
  // stop Mirror and Double rotation where they are, dropping a display rotation that isn't a whole number of quarter turns
  cube.clearTricks = () => {
    Object.assign(cube.spin, { on: false, stopping: false, t: 0 });
    cube.mirror = null;
    if (!isIntMat(cube.O)) cube.O = ident();
  };
  // Double rotation on or off (off: it runs on to the next quarter turn). False when Mirror is under way and it can't.
  cube.toggleSpin = () => {
    const sp = cube.spin;
    if (cube.mirror) return false;
    if (sp.on) { sp.on = false; sp.stopping = true; sp.target = Math.ceil(sp.t / (Math.PI / 2) - 1e-9) * (Math.PI / 2); }
    else { sp.on = true; sp.stopping = false; }
    return true;
  };
  // Mirror via 4D: a half turn of the whole puzzle in the plane of u and v (your right and ana). False if it can't start.
  cube.startMirror = (u, v) => {
    if (cube.mirror || cube.spin.on || cube.spin.stopping) return false;
    cube.mirror = { u: u.slice(), v: v.slice(), base: cube.O.slice(), t: 0 };
    return true;
  };
  cube.solved = () => !cube.anim && !cube.queue.length && isSolved(pieces);
  // Every piece where it is drawn now: its rotation M, with the twist under way and the display rotation, and whether it
  // is in the selected layer.
  cube.placed = () => {
    const an = cube.anim, tw = an && rot(an.move.i, an.move.j, an.angle);
    const O = cube.spin.on || cube.spin.stopping ? mm(spinM(cube.spin.t), cube.O) : cube.O;
    return pieces.map(p => ({ p, M: mm(O, an && inLayer(p, an.move.axis, an.move.val) ? mm(tw, p.M) : p.M), sel: inLayer(p, cube.axis, cube.val) }));
  };
  // Advance whatever is moving by dt seconds (instant: at once, for reduced motion). Returns { moved, settled }: moved if
  // anything changed, settled if a twist ended or the display rotation was baked in (so the move count or solved state
  // may have changed).
  cube.step = (dt, instant = false) => {
    let moved = false, settled = false;
    if (!cube.anim && cube.queue.length) {
      const move = cube.queue.shift();
      cube.anim = { move, t: 0, angle: 0, dur: instant ? 0 : move.fast ? 0.09 : 0.28 };
    }
    if (cube.anim) {
      const a = cube.anim;
      a.t = a.dur ? Math.min(1, a.t + dt / a.dur) : 1;
      a.angle = a.move.dir * Math.PI / 2 * ease(a.t);
      if (a.t >= 1) {
        const R90 = rot(a.move.i, a.move.j, a.move.dir * Math.PI / 2);
        for (const p of pieces) if (inLayer(p, a.move.axis, a.move.val)) p.M = mm(R90, p.M).map(Math.round);
        cube.anim = null; settled = true;
      }
      moved = true;
    }
    if (cube.mirror) {
      const mr = cube.mirror;
      mr.t = instant ? 1 : Math.min(1, mr.t + dt / 1.8);
      cube.O = mm(planeRotM(mr.u, mr.v, Math.PI * ease(mr.t)), mr.base);
      if (mr.t >= 1) cube.mirror = null;
      moved = true;
    }
    const sp = cube.spin;
    if (sp.on || sp.stopping) {
      sp.t += dt * 0.55;
      if (sp.stopping && sp.t >= sp.target) { cube.O = mm(spinM(sp.target), cube.O); sp.t = 0; sp.stopping = false; }
      moved = true;
    }
    // bake a whole-number display rotation into the pieces once nothing is moving
    if (!cube.mirror && !sp.on && !sp.stopping && !cube.anim && !cube.queue.length && !isIdent(cube.O) && isIntMat(cube.O)) {
      const O = cube.O.map(Math.round);
      for (const p of pieces) p.M = mm(O, p.M).map(Math.round);
      cube.O = ident(); moved = settled = true;
    }
    return { moved, settled };
  };
  return cube;
}
