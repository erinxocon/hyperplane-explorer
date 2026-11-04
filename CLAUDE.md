# Hyperplane Explorer

A 4D explorer (`index.html`) plus three pages: Rubik's cube 3⁴ (`rubik.html`), chess (`chess.html`) and a spinning cat (`cat.html`). The viewer is a 3D being in a hyperplane of R⁴. Everything shows three ways: **Slice** (intersection with your hyperplane), **Stack** (three parallel slices side by side), **Shadow** (4D→3D perspective projection).

Vanilla JS + three.js **r187**, Vite, no framework, no TypeScript yet. WebGL is the default; `?renderer=webgpu` uses `WebGPURenderer` with the TSL shaders, `?renderer=webgpu-gl` forces its WebGL2 backend.

## Modules

This file covers what they share. Each has its own notes, which load when you work in its folder:

- Explorer and its shapes: `src/explorer/CLAUDE.md` (also loaded from `src/shapes/`)
- Rubik's cube: `src/rubik/CLAUDE.md`
- Chess: `src/chess/CLAUDE.md`
- Cat: `src/cat/CLAUDE.md`

## Commands

- `npm run dev`; `npm run build` (to `dist/`, `base: './'`; `vite.config.js` lists all four pages); `npm run preview` (:4173).
- `npm test`: unit tests, then Playwright (`tests/*.spec.js`), which fail on any console or page error. Screenshots go to `test-results/`. Run `npx playwright install chromium` once; `PW_CHROMIUM_PATH` overrides the binary.
- `npm run test:unit`: only `tests/unit/`, Node's runner (Node 21+).
- `npm run landmask` regenerates `src/assets/land-mask.png` (deterministic).
- Pushes to `main` run `.github/workflows/pages.yml`: unit tests, build, deploy to GitHub Pages. Playwright doesn't run in CI.
- **Real WebGPU isn't in the suite.** `tests/webgpu.spec.js` runs every page on the WebGL2 backend. On headless software GPUs here, drawing to the canvas loses the device, but compute and drawing to a `RenderTarget` work with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan`. Playwright's Chromium 141 also rejects the `swizzle: 'rgba'` three r187 passes to `createView`, so strip it first.

## Layout

- **Shared modules vs pages.** Each page has a folder (`src/explorer/`, `src/rubik/`, `src/chess/`, `src/cat/`) for code only it uses. Everything else is shared, and **a shared module never imports a page's state**: it takes arguments or a `ctx` object.
- `src/math4d.js`: vectors are `[x,y,z,w]`, matrices flat row-major arrays of 16. `rot(i,j,t)` is a Givens rotation. `slerp` uses the Cayley transform (null at 180°). `ease(t)` is every tween's easing.
- `src/stage.js` (all pages): renderer, scene, camera, orbit controls, frame loop, and the Slice / Stack / Shadow buttons and keys. What a view means is the page's: it hears `onMode(m, prev)`.
- `src/walk.js` (explorer, cube, cat): a stage plus a viewer (`src/viewer.js`), with the floor, your state (`you`, `S`, `VOL`, V, the redraw flag), the View / Move / Rotate panel (`src/nav.js`), jumps, volume view and the redraw loop. Pages call `walker.run(world, hooks)` with entries having `build(V, ctx)`; hooks are `mode`, `volume`, `spinM`, `tick`, `update`, `resize`, `after`.
- `src/scenery.js`, `src/hud.js`: what the explorer and cat share (floor, marker, Shadow's depth shading, tube matrices; readouts, ruler, `stackOffs`, `toScreen`, compass). `src/utils.js`: page plumbing (`createRenderer`, `press`/`onButton`, `cameraTween`). `src/environment.js` is separate so the explorer doesn't load it.
- `src/styles.css`: every color is a token on `:root`; a single dark theme on purpose.

## Shaders

Each lives beside its user as GLSL (`WebGLRenderer`, imported `?raw`) and `.tsl.js` (`WebGPURenderer`, loaded by top-level `await` only there). **Change the two together.** Exception: `src/cat/shaders/cut.tsl.js` has no GLSL copy.

TSL rules learned the hard way:
- WGSL wants `fwidth` and texture reads outside any branch.
- A reversed `smoothstep` is written `1 − smoothstep`.
- Uniforms don't belong inside `setLayout` functions (they came out under another material's names).
- Depth goes through `viewZToPerspectiveDepth`, so it doesn't depend on the backend's clip space.
- A nested `Loop`'s variable hides the outer one's; copy the outer with `.toVar()` first.
- A `setLayout` parameter can't be a WGSL reserved word such as `as`.
- WebGPU allows 8 vertex buffers per pipeline and the WebGL2 backend doesn't enforce it (`tests/webgpu.spec.js` counts); interleave to stay under.

A custom `ShaderMaterial` on WebGL must end with `#include <colorspace_fragment>`, unless its colors are written for display as they are, as Earth's are.

## Core model (read before editing)

**Viewer frame.** `S = { P, R, U, F, A }`: a point and an orthonormal frame (right, up, forward, ana). Your hyperplane is `{X : (X−P)·A = 0}`. **U is locked to world y**: slice rotations stay in x–z–w, via `rotatePlane` and `orthonormalize`, so the floor stays a floor. This is why Face this layer can't face Y layers, except in volume view.

**Display frame.** Rendering reads `V`, not `S`. Normally `V` is `S`; **volume view** (`VOL`, key V) tweens it 90° in the U–A plane to `(R, A, F, −U)`, so the slice lies level and ana shows as up. **Code that draws or measures reads `V`; code that moves you writes `S`.** In volume view the floor hides, and copy saying ana/kata reads as down/up.

**Scene coordinates.** `local(V, X) = ((X−P)·R, (X−P)·U, −(X−P)·F)`; the camera looks down −z. The scene origin is you.

**Rebuild loop.** Anything that changes 4D state asks for a redraw; the frame loop calls `rebuild()` at most once, running every `o.build(V, ctx)` from scratch (`clearGroup` disposes). Exception: an entry with `o.shifts` (all but Earth in the explorer) draws entirely in `o.group`, so when only P changed the walker slides the group and moves `o.range` and `o.focus`. Shadow and Stack allow any move, Slice only moves within your hyperplane. Controls and jumps call `moved()`; anything else calls `redraw()`, which always builds.

**Slice and Stack.** `sectionPoints(V, W, edges, off)` lerps sign-changing edges of `dA = (v−P)·A − off`; `sectionGeometry` classifies the points and hulls them, exact for convex polytopes. `off` cuts parallel hyperplanes without moving the viewer.

**Shadow.** `projector(V, C, E)` maps `X ↦ local(V, C) + (r·R, r·U, −r·F) · E/(E − r·A)`, `r = X − C`: an eye E ana of the object's center. Edges are instanced tubes, dim (kata) → bright (ana). Shapes differing only in w project to the same spot; that's correct and documented in the UI.

**Animations.** `jump` tweens position with an optional single-plane `turn` or full `frame` (slerp; exactly 180° has no single path, so `startJump` lands at once). Every animated action respects `prefers-reduced-motion`.

## Conventions

- Keep the math exact and honest. If a view is schematic (Stack's sideways shift), say so in the UI copy.
- UI copy is short, plain and specific; explanations live in `VIEW_DESC` and `EXPLAIN`.
- Keys: W/A/S/D move, R/F height, E/Q ana/kata, J/L turn, I/K pitch into ana, U/O swing into ana, 1/2/3 views, V volume view.

## Next steps

1. Move the explorer's shapes panel to its own module.
2. TypeScript: `Vec4 = [number, number, number, number]`, `Mat4 = number[]` (length 16).
3. Once `?renderer=webgpu` has been checked on a real GPU, make it the default and delete the GLSL copies.
4. Possible: unlock U for full SO(4), 4D hidden-cell removal in Shadow, a cube move log/undo, a stereographic glome.
