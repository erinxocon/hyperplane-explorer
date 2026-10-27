import test from 'node:test';
import assert from 'node:assert/strict';
import { tesseract, cell16, cell24, cell5, duoprism, cell600 } from '../../src/shapes.js';

const degrees = s => { const d = s.verts.map(() => 0); s.edges.forEach(([i, j]) => { d[i]++; d[j]++; }); return d; };
const regular = (s, nv, ne, deg) => { assert.equal(s.verts.length, nv); assert.equal(s.edges.length, ne); assert.ok(degrees(s).every(x => x === deg)); };

test('tesseract', () => regular(tesseract(), 16, 32, 4));
test('16-cell', () => regular(cell16(), 8, 24, 6));
test('24-cell', () => regular(cell24(), 24, 96, 8));
test('5-cell', () => regular(cell5(), 5, 10, 4));
test('6,6-duoprism', () => regular(duoprism(6, 6), 36, 72, 4));
test('600-cell', () => {
  const s = cell600();
  regular(s, 120, 720, 12);
  s.verts.forEach(v => assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9));
});
