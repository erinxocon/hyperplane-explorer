import test from 'node:test';
import assert from 'node:assert/strict';
import { ident, rot, mm, transpose, det, inv, slerp } from '../../src/math4d.js';

const close = (a, b, eps = 1e-9) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < eps, `index ${i}: ${x} vs ${b[i]}`));

test('transpose of a rotation is its inverse', () => close(mm(rot(0, 3, 0.7), transpose(rot(0, 3, 0.7))), ident()));
test('det of a rotation is 1', () => assert.ok(Math.abs(det(mm(rot(0, 2, 1.1), rot(1, 3, 0.4))) - 1) < 1e-9));
test('inv undoes a matrix and rejects a singular one', () => {
  const M = mm(rot(0, 1, 0.3), rot(2, 3, 1.2)).map((x, i) => x + (i % 5 === 0 ? 1 : 0));
  close(mm(M, inv(M)), ident());
  assert.equal(inv(new Array(16).fill(0)), null);
});
test('slerp hits both endpoints', () => {
  const A = rot(0, 2, 0.3), B = mm(A, rot(2, 3, 1.4));
  close(slerp(A, B, 0), A); close(slerp(A, B, 1), B);
});
test('slerp turns at constant speed and stays orthonormal', () => {
  const A = ident(), B = rot(2, 3, 2.0), step = [];
  let prev = A;
  for (let k = 1; k <= 8; k++) {
    const M = slerp(A, B, k / 8);
    close(mm(M, transpose(M)), ident());
    step.push(mm(transpose(prev), M)[10]); // cos of the per-step angle in the 2-3 plane
    prev = M;
  }
  step.forEach(c => assert.ok(Math.abs(c - Math.cos(2.0 / 8)) < 1e-9));
});
test('slerp between opposite frames is unsupported', () => assert.equal(slerp(ident(), rot(0, 1, Math.PI), 0.5), null));
