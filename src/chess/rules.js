// 4D chess on a 4×4×4×4 board. Pure functions over a board array, so Node can test them and the AI can reuse them.
// A cell is (x, y, z, w), each 0..3, stored at index x + 4y + 16z + 64w. x is the file and y the level; z (rank) and
// w (layer) are both forward: white starts at z = w = 0 and moves toward z = w = 3, where black starts.
// A piece is ±type, positive for white and negative for black; 0 is an empty cell.
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, UNICORN = 4, ROOK = 5, QUEEN = 6, KING = 7;
export const WHITE = 1, BLACK = -1;
export const idx = (x, y, z, w) => x + 4 * y + 16 * z + 64 * w;
export const coords = i => [i & 3, (i >> 2) & 3, (i >> 4) & 3, i >> 6];
const inside = c => c.every(v => v >= 0 && v < 4);
const step = (i, d, k = 1) => { const c = coords(i).map((v, a) => v + d[a] * k); return inside(c) ? idx(...c) : -1; };

// The 80 directions: every vector in {−1, 0, 1}⁴ except 0. A direction's order is how many axes it changes:
// rooks slide along order 1, bishops order 2, unicorns order 3, queens any; the king takes one step of any.
export const DIRS = [];
for (let n = 1; n < 81; n++) {
  const v = [n % 3, Math.floor(n / 3) % 3, Math.floor(n / 9) % 3, Math.floor(n / 27) % 3].map(t => t === 2 ? -1 : t);
  DIRS.push({ v, order: v.filter(Boolean).length });
}
const SLIDES = { [ROOK]: 1, [BISHOP]: 2, [UNICORN]: 3 };
// Knight jumps: 2 along one axis and 1 along another, 48 in all.
const JUMPS = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) for (const s of [2, -2]) for (const t of [1, -1]) {
  const v = [0, 0, 0, 0]; v[a] = s; v[b] = t; JUMPS.push(v);
}
// Pawns step one cell forward along z or w, and capture one cell forward plus one sideways along x or y.
const pawnSteps = col => [[0, 0, col, 0], [0, 0, 0, col]];
const pawnHits = col => [2, 3].flatMap(f => [0, 1].flatMap(l => [1, -1].map(s => { const v = [0, 0, 0, 0]; v[f] = col; v[l] = s; return v; })));

// Lookup tables per cell: the ray of cells in each direction, knight targets, and pawn steps and captures per color.
const RAYS = [], KNIGHT_TO = [], STEPS = { 1: [], [-1]: [] }, HITS = { 1: [], [-1]: [] }, HIT_FROM = { 1: [], [-1]: [] };
for (let i = 0; i < 256; i++) {
  RAYS.push(DIRS.map(d => { const r = []; for (let k = 1, j; (j = step(i, d.v, k)) >= 0; k++) r.push(j); return r; }));
  KNIGHT_TO.push(JUMPS.map(v => step(i, v)).filter(j => j >= 0));
  for (const col of [WHITE, BLACK]) {
    STEPS[col].push(pawnSteps(col).map(v => step(i, v)).filter(j => j >= 0));
    HITS[col].push(pawnHits(col).map(v => step(i, v)).filter(j => j >= 0));
    HIT_FROM[col].push(pawnHits(col).map(v => step(i, v.map(t => -t))).filter(j => j >= 0));
  }
}
// A pawn promotes, to a queen, on the far corner plane: z = w = 3 for white, z = w = 0 for black.
export const promotes = (i, col) => { const [, , z, w] = coords(i), end = col > 0 ? 3 : 0; return z === end && w === end; };

// Starting position. Each side's 16 officers fill the plane z = w = 0 (black: 3) across the four files and four
// levels, and its 16 pawns fill z = w = 1 (black: 2), shielding the officers along the forward diagonal.
export const BACK = [            // by level y = 0..3 (bottom up), files x = a..d
  [ROOK, BISHOP, BISHOP, ROOK],
  [KNIGHT, QUEEN, KING, KNIGHT],
  [KNIGHT, UNICORN, UNICORN, KNIGHT],
  [ROOK, BISHOP, BISHOP, ROOK],
];
export function initialBoard() {
  const b = new Int8Array(256);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    b[idx(x, y, 0, 0)] = BACK[y][x]; b[idx(x, y, 1, 1)] = PAWN;
    b[idx(x, y, 3, 3)] = -BACK[y][x]; b[idx(x, y, 2, 2)] = -PAWN;
  }
  return b;
}

// Is cell i attacked by color `by`? Looks outward from i: along each direction for the first piece, then knights and pawns.
export function attacked(b, i, by) {
  const rays = RAYS[i];
  for (let d = 0; d < 80; d++) {
    const ray = rays[d];
    for (let k = 0; k < ray.length; k++) {
      const p = b[ray[k]];
      if (!p) continue;
      if (p * by > 0) {
        const t = p * by;
        if (t === QUEEN || (t === KING && k === 0) || SLIDES[t] === DIRS[d].order) return true;
      }
      break;
    }
  }
  for (const j of KNIGHT_TO[i]) if (b[j] === by * KNIGHT) return true;
  for (const j of HIT_FROM[by][i]) if (b[j] === by * PAWN) return true;
  return false;
}
export const kingAt = (b, col) => b.indexOf(col * KING);
export const inCheck = (b, col) => { const k = kingAt(b, col); return k >= 0 && attacked(b, k, -col); };

// Moves as { from, to, piece, captured, promo }. Pseudo-legal moves may leave your own king attacked.
export function pseudoMoves(b, col, capturesOnly = false) {
  const out = [];
  const add = (from, to) => {
    const captured = b[to];
    if (captured * col > 0 || (capturesOnly && !captured)) return;
    out.push({ from, to, piece: b[from], captured, promo: b[from] === col * PAWN && promotes(to, col) });
  };
  for (let i = 0; i < 256; i++) {
    const t = b[i] * col;
    if (t <= 0) continue;
    if (t === PAWN) {
      if (!capturesOnly) for (const j of STEPS[col][i]) if (!b[j]) add(i, j);
      for (const j of HITS[col][i]) if (b[j] * col < 0) add(i, j);
    } else if (t === KNIGHT) for (const j of KNIGHT_TO[i]) add(i, j);
    else {
      const rays = RAYS[i];
      for (let d = 0; d < 80; d++) {
        if (t !== QUEEN && t !== KING && SLIDES[t] !== DIRS[d].order) continue;
        for (const j of rays[d]) { add(i, j); if (b[j] || t === KING) break; }
      }
    }
  }
  return out;
}
export function makeMove(b, m) { b[m.to] = m.promo ? Math.sign(m.piece) * QUEEN : m.piece; b[m.from] = 0; }
export function unmakeMove(b, m) { b[m.from] = m.piece; b[m.to] = m.captured; }
export function legalMoves(b, col) {
  return pseudoMoves(b, col).filter(m => { makeMove(b, m); const ok = !inCheck(b, col); unmakeMove(b, m); return ok; });
}

// The game: whose turn it is and the moves so far. `state` is 'play', 'check', 'checkmate', 'stalemate' or
// 'draw' (only kings left, or 50 moves each with no capture and no pawn move).
export function newGame() { return { board: initialBoard(), turn: WHITE, history: [], quiet: 0 }; }
export function play(g, m) {
  makeMove(g.board, m);
  g.history.push({ m, quiet: g.quiet });
  g.quiet = m.captured || Math.abs(m.piece) === PAWN ? 0 : g.quiet + 1;
  g.turn = -g.turn;
}
export function undo(g) {
  const h = g.history.pop();
  if (!h) return null;
  unmakeMove(g.board, h.m); g.quiet = h.quiet; g.turn = -g.turn;
  return h.m;
}
export function gameState(g) {
  const check = inCheck(g.board, g.turn);
  if (!legalMoves(g.board, g.turn).length) return check ? 'checkmate' : 'stalemate';
  if (g.board.every(p => !p || Math.abs(p) === KING) || g.quiet >= 100) return 'draw';
  return check ? 'check' : 'play';
}
