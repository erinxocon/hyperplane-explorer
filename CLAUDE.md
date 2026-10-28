# Hyperplane Explorer

An interactive 4D explorer. The viewer is a 3D being in a hyperplane of R⁴. The scene contains convex 4-polytopes, a glome, a w-thickened Earth, a Klein bottle, a 3D Klein bottle and a 3×3×3×3 Rubik's cube. Each can be shown three ways: **Slice** (intersection with your hyperplane), **Stack** (three parallel slices side by side), and **Shadow** (4D→3D perspective projection).

Vanilla JS + three.js **r147**, bundled with Vite. There's no framework and no TypeScript yet.

## Commands

- `npm run dev` starts the dev server with HMR.
- `npm run build` writes a static build to `dist/`. `base: './'`, so it works from any path.
- `npm run preview` serves `dist/` on :4173.
- `npm test` runs the unit tests, then the Playwright smoke test. The smoke test builds, serves, flips every view, does a twist, and fails on any console or page error. Screenshots go to `test-results/`. Run `npx playwright install chromium` once first. Where Playwright's bundled Chromium isn't available, set `PW_CHROMIUM_PATH` to another Chromium binary.
- `npm run test:unit` runs only the unit tests in `tests/unit/` with Node's built-in runner (Node 21+ for the glob). They cover `math4d.js` and `shapes.js`.
- `npm run landmask` regenerates `src/assets/land-mask.png` from Natural Earth 1:110m (world-atlas). Output is deterministic.
- Pushes to `main` run `.github/workflows/pages.yml`: unit tests, build, deploy to GitHub Pages. The smoke test doesn't run in CI.

## Layout

- `index.html` holds the markup: the viewport (`#view`) and the side panel (`<aside class="panel">`).
- `src/styles.css`: every color is a token on `:root`. The look is a single dark theme on purpose.
- `src/math4d.js` has the 4-vector and 4×4 helpers. Vectors are `[x,y,z,w]` arrays. Matrices are flat row-major arrays of 16. `rot(i,j,t)` is a Givens rotation in the i–j plane. `slerp(A,B,t)` interpolates rotations at constant speed via the Cayley transform (exact for single-plane turns, null at 180°); `jump.frame` uses it.
- `src/shapes.js` has the polytope generators: `{ verts, edges }`, centered, unit-ish. `klein()` is the exception: a closed triangle mesh `{ verts, tris, grid }` of a Klein bottle embedded in R⁴ (a ring in x–z whose tube circle turns through y–w). `spunKlein()` is the 3D Klein bottle S²×̃S¹, immersed (it must self-intersect in R⁴): fibers `{ c, M }` over u ∈ [0, π], each the ellipsoid `c + M·p` for p on the unit sphere, i.e. the glass Klein bottle with each circle bulged into a sphere through w.
- `src/shaders/` holds the Earth ray-caster (`globe.*`) and the Earth cap surface for Shadow (`earth-cap.*`), imported with `?raw`.
- `src/main.js` is everything else, still one `main()` closure (see Refactor plan). Its sections, in order: viewer state → scene/floor → shaders/assets → per-object render objects → sectioning (`sectionPoints`, `sectionGeometry`) → stack/shadow builders → Rubik's cube model and builders → `rebuild()` → panel/ruler → input → Rubik's panel → compass (`drawCompass`, a 2D canvas overlay of the world axes) → frame loop.

## Core model (read before editing)

**Viewer frame.** State `S = { P, R, U, F, A }`. P is a point and R/U/F/A is an orthonormal 4-frame: right, up, forward, ana.
- **U is locked to world y** (`[0,1,0,0]`). All slice rotations happen in the x–z–w subspace, via `rotatePlane` and `orthonormalize`, so the floor stays a floor. Don't break this casually: "Face this layer" can't face Y layers because of it, except in volume view.
- Your hyperplane is `{X : (X−P)·A = 0}`.

**Display frame.** Rendering reads `V`, not `S`. `V` shares P, R and F with S. Normally `V` is `S`; **volume view** (`VOL`, key V) tweens it 90° in the U–A plane to `(R, A, F, −U)`, so the slice lies level, your ana shows as up and R/F step through heights. Controls and frame ops (`act`, `rotatePlane`, `jump`, Face this layer, Diagonal view) act on `S`, so U stays locked. Code that draws or measures must read `V`; code that moves you must write `S`. In volume view the floor is parallel to the slice, so it drops away and hides, and copy that says ana/kata relative to the slice reads as down/up.

**4D → scene coordinates.** `local(X) = ((X−P)·R, (X−P)·U, −(X−P)·F)`, using the display frame `V`. The −F is because the three.js camera looks down −z. All scene geometry lives in these local coordinates; the scene origin is you.

**Rebuild loop.** Anything that changes 4D state sets `dirty = true`. The frame loop calls `rebuild()` once, which regenerates geometry for every object in `WORLD` according to `VIEW.mode`. Geometry is rebuilt from scratch each time (cheap at this scale), and `clearGroup` disposes it.

**Sectioning (Slice and Stack).** `sectionPoints(W, edges, off)` computes signed distances `dA = (v−P)·A − off` and lerps every sign-changing edge. `sectionGeometry` then classifies the point set (point / segment / planar polygon / solid) and hulls it with `ConvexGeometry`. This is exact for convex polytopes. `off` lets Stack cut parallel hyperplanes `P + off·A` without moving the viewer. `local()` is unaffected by `off` because A ⟂ R,U,F. The Klein bottle is a surface, so `surfaceCuts` runs marching triangles over its mesh instead and the cut curves are drawn as instanced tubes. The 3D Klein bottle is cut analytically: each fiber ellipsoid meets the hyperplane in a circle, and `fiberSlice` joins those circles into a tube, capped where a run of fibers ends.

**Shadow.** `projector(C, E)` maps `X ↦ local(C) + (r·R, r·U, −r·F) · E/(E − r·A)` with `r = X − C`, i.e. an eye E units ana of the object's center. Polytopes draw edges as instanced tubes, shaded dim (kata) → bright (ana). The glome draws a Clifford torus plus two Hopf-linked great circles. Earth draws its two w-caps (projected sphere meshes) joined by rulings. The Klein bottle draws its projected skin (translucent), its tube circles, and the v = ±π/2 line as tubes; that line closes only after two laps. The 3D Klein bottle draws every 12th fiber sphere as three great circles plus the path of the poles p = (±1, 0, 0) as tubes. The Rubik's cube draws each sticker as a small 3-cube in its cell, and the cell whose normal faces the eye (`n·A > 0.6`) is hidden. Shapes that differ only in w project onto the same spot; that's correct and documented in the UI.

**Earth** is `ball(R) × [−h, h]` in w, rendered per-pixel by ray-casting in `globe.frag.glsl`. Each fragment maps its ray to 4D (`Q + p.x·R + p.y·U − p.z·F`) and intersects the ball (a quadratic in xyz) with the slab (linear in w). The entry surface picks the shading: surface map or cut face with layer colors. It writes `gl_FragDepth`. Stack uses three proxies, each with its own `uQ` (slice offset) and `uShift` (sideways panel shift).

**Rubik's cube 3⁴.**
- `cubies[]`: 80 pieces, each `{ h, M }`. `h ∈ {−1,0,1}⁴ \ 0` is the home position. `M` is an integer 4×4 rotation, and the current position is `M·h`.
- A layer is `round((M·h)[axis]) === val`. A twist rotates that layer 90° in a plane (i, j) that excludes `axis`. When the animation finishes it is baked into `M` and rounded, so floating-point error never accumulates.
- Sticker color: map the face centroid back with `Mᵀu − h`; the dominant axis is the facet, and `h[i] === sign` means it's a sticker, otherwise plastic.
- `RK.O` is a display-only whole-puzzle rotation, used by Mirror and Double rotation. When it becomes an integer matrix and nothing is animating, `tryBake()` folds it into every `M`. "Solved" is checked up to whole-puzzle rotation (`isSolved`).
- Colors (`CELL_COLORS`) are indexed `axis*2 + (sign>0)`: −X, +X, −Y, +Y, −Z, +Z, −W, +W.

**Animations.** `jump` tweens position, with an optional single-plane `turn` or a full `frame` (nlerp + Gram–Schmidt). `camTween` tweens the orbit camera. `RK.anim`, `RK.mirror` and `RK.spin` animate the cube. Every animated action respects `prefers-reduced-motion`.

## Conventions

- Keep the math exact and honest. If a view is schematic (Stack's sideways shift), say so in the UI copy.
- New 4D objects: add an entry to `WORLD`, create render objects in the `WORLD.forEach` setup, and handle all three modes in `rebuild()`. Each mode must set `o.range` (for the ana–kata ruler), and Stack must set `o.stackInfo = { spacing, bottom, labels }` so the panel labels can follow.
- UI copy is short, plain and specific. Explanations live in `VIEW_DESC` (global views) and `EXPLAIN` (Rubik's cube views and tricks).
- Keyboard: W/A/S/D move, R/F height, E/Q ana/kata, J/L turn, I/K pitch into ana, U/O swing into ana, 1/2/3 switch views, V toggles volume view.

## Refactor plan (suggested next steps)

1. Split `main.js` along its existing sections: `state.js` (S, VIEW, frame ops), `scene.js`, `sectioning.js`, `views/{slice,stack,shadow}.js`, `objects/{polytope,glome,earth,rubik}.js`, `ui/{panel,ruler,rubikPanel}.js`, `loop.js`. Pass a small context object rather than relying on closure scope.
2. Give each object type one interface, `build(o, mode, ctx)`, and drop the type checks in `rebuild()`.
3. TypeScript: `Vec4 = [number, number, number, number]`, `Mat4 = number[]` (length 16).
4. Upgrading three past r147 needs care:
   - Import paths become `three/addons/...`.
   - r152 turned on color management with sRGB output, so colors shift. Set `renderer.outputColorSpace` and revisit material colors.
   - r155 removed legacy lights, so light intensities need roughly ×π.
   - Check `InstancedMesh.setColorAt` and `ConvexGeometry` behavior.
5. Possible features: unlock U for full SO(4) slicing, 4D hidden-cell removal in Shadow, a move log/undo for the cube, a stereographic projection mode for the glome.
