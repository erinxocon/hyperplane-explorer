# Chess (`src/chess/`)

On the stage, not the walker: its "slice" is an ana axis and a layer.

- `rules.js` is pure. Board: `Int8Array(256)`, index `x + 4y + 16z + 64w`; a piece is ±type, positive for white. z and w are both forward, 0 (white) to 3 (black). Sliders move along the 80 directions by how many axes change: rook 1, bishop 2, unicorn 3, queen any. Pawns step +z or +w, capture forward plus ±x or ±y, and promote on z = w = 3.
- `ai.js`: negamax, alpha-beta, depth 2, capture-only quiescence; pseudo-legal in the tree, king capture wins, only root moves fully legal. The rook is the weakest officer (values follow mobility). `worker.js` replies carry a `token`, so stale replies are dropped.
- `main.js`: `FRAMES[ana]` picks the shown axes, `tower(k)` places board k (nested by `EYE/(EYE − (k − 1.5))` in Shadow), `place(cell)` gives a target, and everything eases toward targets, so moves animate for free. In Shadow, picking prefers a legal target, then a piece, to reach inner boards.
- The stand's stagger and the gaps between boards are display only; the copy says so.
