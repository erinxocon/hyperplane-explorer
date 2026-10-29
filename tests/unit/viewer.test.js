import test from 'node:test';
import assert from 'node:assert/strict';
import { dot } from '../../src/math4d.js';
import { createViewer } from '../../src/viewer.js';

const orthonormal = S => {
  const ax = ['R', 'U', 'F', 'A'];
  for (const a of ax) for (const b of ax) assert.ok(Math.abs(dot(S[a], S[b]) - (a === b ? 1 : 0)) < 1e-9, `${a}·${b}`);
};

test('turning keeps the frame orthonormal and up on world y', () => {
  const v = createViewer();
  for (const [code, t] of [['rot:RF:1', 0.7], ['rot:FA:1', 0.4], ['rot:RA:-1', 1.1], ['rot:FA:-1', 2.0]]) v.act(code, t);
  orthonormal(v.S);
  assert.deepEqual(v.S.U, [0, 1, 0, 0]);
});

test('moving goes along your own axes; ana is w until you tilt', () => {
  const v = createViewer({ speed: 1 });
  v.act('move:A:1', 2);
  assert.deepEqual(v.S.P, [0, 0, 0, 2]);
  v.act('rot:FA:1', Math.PI / 2);   // pitch fully into ana: forward becomes w
  v.act('move:F:1', 1);
  assert.ok(Math.abs(v.S.P[3] - 3) < 1e-9);
});

test('volume view lays the slice level: up shows ana, and ana points down', () => {
  const v = createViewer();
  v.vol.on = true;
  v.step(1, true);
  const V = v.frame(), near = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12, `${a} vs ${b}`));
  near(V.U, [0, 0, 0, 1]);
  near(V.A, [0, -1, 0, 0]);
  assert.deepEqual(v.S.U, [0, 1, 0, 0]);   // your own frame is untouched
});
