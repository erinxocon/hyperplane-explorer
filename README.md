# Hyperplane Explorer

> Heavily inspired by [4D Golf](https://store.steampowered.com/app/2147950/4D_Golf/) by [CodeParade](https://github.com/HackerPoet), and is largely an experiment.

Walk through a 4D world from inside a 3D slice. Move along x, y, z and ana/kata, tilt your slice into the fourth axis, and switch between three ways of seeing:

- **Slice**: what a 3D being in your hyperplane sees.
- **Stack**: three parallel slices side by side, like CT scans of a 4D object.
- **Shadow**: a 4D perspective projection, where the tesseract becomes a cube inside a cube.

**Volume view** (V) works with all three: it lays your slice level, so you see x, z and w (w as up, until you tilt) and step through heights instead. Shapes that differ only in w spread out vertically, and the Rubik's cube's Y layers can be faced head-on.

The world holds a tesseract, 24-cell, 600-cell, 16-cell, 5-cell, 6,6-duoprism, a glome, an Earth with a little 4D thickness (tilt to cut it open and see the core), a Klein bottle, a 3D Klein bottle, a 4D Möbius strip, and a twistable 3×3×3×3 Rubik's cube.

## 4D chess

`chess.html` is a second page: chess on a 4×4×4×4 board, shown as four 3D boards on stands styled after Star Trek's tri-dimensional chess, or as plain wire frames if you'd rather. Play the computer (it looks two moves ahead) or a friend on the same device.

- Every piece moves as in chess, with more directions: the rook along one axis, the bishop diagonally across two, the unicorn (from 3D chess) across three, and the queen along any line. The king has 80 neighbors.
- Forward is both z and w. White starts at z = w = 1, black at z = w = 4, and pawns promote on the far corner plane.
- **Slice**, **Stack** and **Shadow** work as in the explorer. You can also choose which axis your slice is perpendicular to, which cuts the same position into four 3D boards another way.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## Deploy

Pushes to `main` build the site and publish it to GitHub Pages (`.github/workflows/pages.yml`). Enable it once under Settings → Pages → Source: **GitHub Actions**.

## Test

```sh
npx playwright install chromium   # once
npm test                          # unit tests, then the Playwright smoke test
npm run test:unit                 # unit tests only (Node 21+)
```

If Playwright's bundled Chromium isn't available on your system, point `PW_CHROMIUM_PATH` at another Chromium binary.

## Controls

| Keys | Action |
| --- | --- |
| W A S D | move within your slice |
| R / F | up / down |
| E / Q | ana / kata (the 4th axis) |
| J / L | turn |
| I / K, U / O | tilt your slice into ana |
| 1 / 2 / 3 | Slice / Stack / Shadow |
| V | volume view: lay your slice level |

Drag to orbit the camera; scroll or pinch to zoom.

In 4D chess, click a piece and then a marked cell. Q / E step your slice kata / ana, 1 / 2 / 3 switch views, and Esc clears the selection.

Coastlines: Natural Earth via [world-atlas](https://github.com/topojson/world-atlas) (public domain).
