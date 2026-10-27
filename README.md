# Hyperplane Explorer

> Heavily inspired by [4D Golf](https://store.steampowered.com/app/2147950/4D_Golf/) by [CodeParade](https://github.com/HackerPoet), and is largely an experiment.

Walk through a 4D world from inside a 3D slice. Move along x, y, z and ana/kata, tilt your slice into the fourth axis, and switch between three ways of seeing:

- **Slice**: what a 3D being in your hyperplane sees.
- **Stack**: three parallel slices side by side, like CT scans of a 4D object.
- **Shadow**: a 4D perspective projection, where the tesseract becomes a cube inside a cube.

The world holds a tesseract, 24-cell, 16-cell, 5-cell, 6,6-duoprism, a glome, an Earth with a little 4D thickness (tilt to cut it open and see the core), and a twistable 3×3×3×3 Rubik's cube.

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
npm test
```

## Controls

| Keys | Action |
| --- | --- |
| W A S D | move within your slice |
| R / F | up / down |
| E / Q | ana / kata (the 4th axis) |
| J / L | turn |
| I / K, U / O | tilt your slice into ana |
| 1 / 2 / 3 | Slice / Stack / Shadow |

Drag to orbit the camera; scroll or pinch to zoom.

Coastlines: Natural Earth via [world-atlas](https://github.com/topojson/world-atlas) (public domain).
