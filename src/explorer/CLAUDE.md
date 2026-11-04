# Explorer and shapes (`src/explorer/`, `src/shapes/`)

`src/explorer/main.js`: the shapes in a walker, plus the shapes panel, Earth's and the Möbius strip's state, and Spin.

## Layout

`src/shapes/`: `shapes.js` is pure geometry, `draw.js` the shared helpers (each takes V), one module per kind sets `o.build(V, ctx)` with ctx = `{ mode, labels, spinM }`, and `world.js` has the definitions and `createWorld(scene, BG)`. The cube is the exception: `createPuzzle` sets its `o.build`.

- `klein()` is a closed mesh embedded in R⁴.
- `spunKlein()` is the 3D Klein bottle S²×̃S¹, immersed (it must self-intersect in R⁴), as ellipsoid fibers `{ c, M }`.
- `mobius4()` is a solid Klein bottle, embedded, as disks `{ c, M }` flipping through w as u goes around.

## Cuts (Slice and Stack)

Polytopes use `sectionPoints` and `sectionGeometry`. The Klein bottle uses marching triangles (`cuts`), drawn as tubes. The 3D Klein bottle joins each fiber's circle into a tube (`slice`). The Möbius strip joins each disk's chord into a ribbon (`ribbonSlice`), a Möbius strip exactly when it crosses every disk.

## Shadow

The Klein bottle's v = ±π/2 line closes only after two laps.

## Earth

`ball(R) × [−h, h]` in w, ray-cast per pixel in `shaders/globe.frag.glsl` (ball is a quadratic, slab linear), writing `gl_FragDepth`. Stack uses three proxies, each with `uQ` (offset) and `uShift` (panel shift). It has no `o.shifts`, so walking always rebuilds it.

## New 4D objects

An entry in `shapes/world.js` and a kind module setting `o.build(V, ctx)` for all three modes (pick the kind in `kindOf`). Each mode sets `o.range`; Stack sets `o.stackInfo = { spacing, bottom, labels }`. Tapping a name moves your slice to `o.focus`, else the middle of `o.range`.
