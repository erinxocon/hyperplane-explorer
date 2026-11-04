# Rubik's cube (`src/rubik/`)

`cube.js` is pure data, tested in Node; `puzzle.js` draws it and wires its panel. `createPuzzle(o, ctx)` takes the walker as `ctx`.

- 80 pieces `{ h, M }`: `h ∈ {−1,0,1}⁴ \ 0` is home, `M` an integer rotation, position `M·h`. A layer is `round((M·h)[axis]) === val`. Finished twists are baked into `M` and rounded, so error never accumulates.
- Sticker color: map the face centroid back with `Mᵀu − h`; the dominant axis is the facet, and `h[i] === sign` means sticker, otherwise plastic. `CELL_COLORS` is indexed `axis*2 + (sign>0)`.
- `cube.O` is a display-only whole-puzzle rotation (Mirror, Double rotation), folded into every `M` once it's an integer matrix and nothing animates. "Solved" is up to whole-puzzle rotation.
- Shadow hides the cell facing the eye (`n·A > 0.6`).
