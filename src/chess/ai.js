// The computer opponent: looks two moves ahead (its move and your reply) with alpha-beta pruning, then follows
// captures until the position is quiet, so it neither hangs pieces nor stops in the middle of a trade.
// Inside the search moves are pseudo-legal and capturing a king counts as a win, which is cheaper than checking
// legality at every node; only the moves it actually chooses from are fully legal.
import { PAWN, KNIGHT, BISHOP, UNICORN, ROOK, QUEEN, KING, coords, pseudoMoves, legalMoves, makeMove, unmakeMove } from './rules.js';

// Piece values follow 4D mobility: on an empty board a rook always reaches 12 cells, a knight or unicorn 18 on
// average, a bishop 21 and a queen 57.
export const VALUE = { [PAWN]: 1, [ROOK]: 2.5, [KNIGHT]: 3, [UNICORN]: 3, [BISHOP]: 3.5, [QUEEN]: 9.5, [KING]: 100 };
const WIN = 1000;
const val = p => VALUE[Math.abs(p)] || 0;

// Material, plus a little for each step a pawn has advanced along z or w; from the view of `col`.
function evaluate(b, col) {
  let s = 0;
  for (let i = 0; i < 256; i++) {
    const p = b[i];
    if (!p) continue;
    let v = val(p);
    if (p === PAWN || p === -PAWN) { const [, , z, w] = coords(i); v += 0.06 * (p > 0 ? z + w - 2 : 4 - z - w); }
    s += p > 0 ? v : -v;
  }
  return s * col;
}
// Most valuable victim first, least valuable attacker as the tie-break; promotions count as captures of a queen.
const score = m => (m.captured ? 10 * val(m.captured) - val(m.piece) : 0) + (m.promo ? 85 : 0);
const order = moves => moves.sort((a, b) => score(b) - score(a));

function quiesce(b, col, alpha, beta, left) {
  const stand = evaluate(b, col);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (!left) return alpha;
  for (const m of order(pseudoMoves(b, col, true))) {
    if (Math.abs(m.captured) === KING) return WIN;
    makeMove(b, m);
    const v = -quiesce(b, -col, -beta, -alpha, left - 1);
    unmakeMove(b, m);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function search(b, col, depth, alpha, beta) {
  if (!depth) return quiesce(b, col, alpha, beta, 4);
  for (const m of order(pseudoMoves(b, col))) {
    if (Math.abs(m.captured) === KING) return WIN;
    makeMove(b, m);
    const v = -search(b, -col, depth - 1, -beta, -alpha);
    unmakeMove(b, m);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
// The best legal move for `col`, or null if it has none. Equal moves are tried in random order so games vary.
export function chooseMove(b, col, { depth = 2, rand = Math.random } = {}) {
  const moves = legalMoves(b, col);
  for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [moves[i], moves[j]] = [moves[j], moves[i]]; }
  let best = null, alpha = -Infinity;
  for (const m of order(moves)) {
    makeMove(b, m);
    const v = -search(b, -col, depth - 1, -Infinity, -alpha);
    unmakeMove(b, m);
    if (v > alpha || !best) { alpha = v; best = m; }
  }
  return best;
}
