// Rebuilds src/assets/land-mask.png: a 1024x512 equirectangular land/sea mask from Natural Earth 1:110m
// (via world-atlas). Scanline-fills the projected land polygons; ~0.3 s, ~9 KB output.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json')));
const land = feature(topo, topo.objects.land);
const W = 1024, H = 512;
const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.1);

// Collect projected rings through a minimal path context.
const rings = []; let cur = null;
const ctx = { moveTo(x, y) { cur = [[x, y]]; rings.push(cur); }, lineTo(x, y) { cur.push([x, y]); }, closePath() {}, arc() {} };
geoPath(proj, ctx)(land);

const edges = [];
for (const r of rings) for (let i = 0; i < r.length; i++) {
  const a = r[i], b = r[(i + 1) % r.length];
  if (a[1] !== b[1]) edges.push([a, b]);
}

const png = new PNG({ width: W, height: H, colorType: 0, inputColorType: 0, bitDepth: 8 });
for (let y = 0; y < H; y++) {
  const sy = y + 0.5, xs = [];
  for (const [a, b] of edges) if ((a[1] <= sy) !== (b[1] <= sy)) xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  xs.sort((p, q) => p - q);
  for (let k = 0; k + 1 < xs.length; k += 2)
    for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(W, Math.ceil(xs[k + 1] - 0.5)); x++) png.data[y * W + x] = 255;
}
const out = new URL('../src/assets/land-mask.png', import.meta.url);
writeFileSync(out, PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8 }));
console.log('wrote', out.pathname);
