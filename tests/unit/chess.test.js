import test from 'node:test';
import assert from 'node:assert/strict';
import { PAWN, KNIGHT, BISHOP, UNICORN, ROOK, QUEEN, KING, WHITE, BLACK, idx, coords, initialBoard, pseudoMoves, legalMoves, makeMove, inCheck, gameState, newGame, play, undo } from '../../src/chess/rules.js';
import { chooseMove } from '../../src/chess/ai.js';

const lone = (t, i) => { const b = new Int8Array(256); b[i] = t; return pseudoMoves(b, WHITE); };
const position = (pieces, turn = WHITE) => {
  const b = new Int8Array(256);
  for (const [p, x, y, z, w] of pieces) b[idx(x, y, z, w)] = p;
  return { board: b, turn, history: [], quiet: 0 };
};

test('starting position: 32 pieces a side, 218 moves for white, nothing to capture', () => {
  const b = initialBoard();
  assert.equal([...b].filter(p => p > 0).length, 32);
  assert.equal([...b].filter(p => p < 0).length, 32);
  const moves = legalMoves(b, WHITE);
  assert.equal(moves.length, 218);
  assert.ok(moves.every(m => !m.captured));
  assert.equal(gameState(newGame()), 'play');
});

test('pieces on an empty board: rook 12 everywhere, king 15 to 80, knight 12 to 24', () => {
  for (let i = 0; i < 256; i++) assert.equal(lone(ROOK, i).length, 12);
  const corner = idx(0, 0, 0, 0), inner = idx(1, 1, 1, 1);
  assert.equal(lone(KING, corner).length, 15);
  assert.equal(lone(KING, inner).length, 80);
  assert.equal(lone(KNIGHT, corner).length, 12);
  assert.equal(lone(KNIGHT, inner).length, 24);
  assert.equal(lone(BISHOP, corner).length, 18);
  assert.equal(lone(QUEEN, corner).length, 45);   // 12 along axes, 18 two-axis, 12 three-axis, 3 four-axis
  // each slider changes exactly as many coordinates as its order: bishop 2, unicorn 3
  const changed = m => coords(m.from).filter((v, a) => v !== coords(m.to)[a]).length;
  assert.ok(lone(BISHOP, inner).every(m => changed(m) === 2));
  assert.ok(lone(UNICORN, inner).every(m => changed(m) === 3));
  // bishops keep their color, the parity of x + y + z + w
  const parity = i => coords(i).reduce((a, b) => a + b) % 2;
  assert.ok(lone(BISHOP, inner).every(m => parity(m.to) === parity(m.from)));
});

test('pawns step forward along z or w, capture forward plus sideways, and promote on the far corner plane', () => {
  const g = position([[PAWN, 1, 1, 1, 1]]);
  assert.deepEqual(legalMovesTo(g, idx(1, 1, 1, 1)).sort(), [idx(1, 1, 2, 1), idx(1, 1, 1, 2)].sort());
  // eight capture targets: one forward (z or w) and one sideways (x or y)
  const targets = [[0, 1, 2, 1], [2, 1, 2, 1], [1, 0, 2, 1], [1, 2, 2, 1], [0, 1, 1, 2], [2, 1, 1, 2], [1, 0, 1, 2], [1, 2, 1, 2]];
  const h = position([[PAWN, 1, 1, 1, 1], ...targets.map(c => [-KNIGHT, ...c])]);
  assert.equal(pseudoMoves(h.board, WHITE).filter(m => m.captured).length, 8);
  assert.equal(pseudoMoves(h.board, WHITE).length, 10);
  const p = position([[PAWN, 2, 0, 3, 2]]), [m] = pseudoMoves(p.board, WHITE);
  assert.ok(m.promo);
  makeMove(p.board, m);
  assert.equal(p.board[idx(2, 0, 3, 3)], QUEEN);
});
function legalMovesTo(g, from) { return legalMoves(g.board, g.turn).filter(m => m.from === from).map(m => m.to); }

test('a piece pinned to its king along w cannot leave the line', () => {
  const g = position([[KING, 0, 0, 0, 0], [BISHOP, 0, 0, 0, 1], [-ROOK, 0, 0, 0, 3], [-KING, 3, 3, 3, 0]]);
  assert.equal(legalMovesTo(g, idx(0, 0, 0, 1)).length, 0);
  assert.ok(!inCheck(g.board, WHITE));
});

test('checkmate: a queen on the corner king’s diagonal, guarded by her king', () => {
  const g = position([[-KING, 0, 0, 0, 0], [QUEEN, 1, 1, 1, 1], [KING, 2, 2, 2, 2]], BLACK);
  assert.equal(gameState(g), 'checkmate');
  assert.equal(chooseMove(g.board, BLACK), null);
});

test('stalemate takes eight rooks: seven over the corner along w and one along z', () => {
  const rooks = [1, 2, 3, 4, 5, 6, 7].map(n => [ROOK, n & 1, n >> 1 & 1, n >> 2 & 1, 3]);
  const g = position([[-KING, 0, 0, 0, 0], [KING, 3, 3, 0, 0], ...rooks, [ROOK, 0, 0, 3, 1]], BLACK);
  assert.ok(!inCheck(g.board, BLACK));
  assert.equal(gameState(g), 'stalemate');
});

test('bare kings, and 50 moves each without a capture or pawn move, are draws', () => {
  assert.equal(gameState(position([[KING, 0, 0, 0, 0], [-KING, 3, 3, 3, 3]])), 'draw');
  const g = position([[KING, 0, 0, 0, 0], [ROOK, 3, 0, 0, 0], [-KING, 3, 3, 3, 3]]);
  g.quiet = 100;
  assert.equal(gameState(g), 'draw');
});

test('play and undo restore the board', () => {
  const g = newGame(), before = g.board.slice();
  const m = legalMoves(g.board, WHITE)[0];
  play(g, m);
  assert.equal(g.turn, BLACK);
  assert.equal(undo(g), m);
  assert.deepEqual(g.board, before);
  assert.equal(g.turn, WHITE);
});

test('the computer takes a free queen', () => {
  const g = position([[ROOK, 0, 0, 0, 0], [-QUEEN, 0, 0, 0, 3], [KING, 3, 1, 2, 0], [-KING, 3, 3, 0, 3]]);
  const m = chooseMove(g.board, WHITE, { rand: () => 0.5 });
  assert.equal(m.to, idx(0, 0, 0, 3));
  assert.equal(m.captured, -QUEEN);
});
