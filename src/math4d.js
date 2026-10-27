// 4D vectors are plain [x, y, z, w] arrays; 4x4 matrices are flat row-major arrays of 16.
export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3]];
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]];
export const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s, a[3]*s];
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
export const norm = a => mul(a, 1 / Math.hypot(...a));
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

// 4x4 matrices, row-major flat arrays
export const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export const rot = (i, j, t) => { const m = ident(), c = Math.cos(t), s = Math.sin(t); m[i*4+i] = c; m[j*4+j] = c; m[i*4+j] = -s; m[j*4+i] = s; return m; };
export const mm = (A, B) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i*4+j] += A[i*4+k] * B[k*4+j]; return r; };
export const mv = (M, v) => [0,1,2,3].map(i => M[i*4]*v[0] + M[i*4+1]*v[1] + M[i*4+2]*v[2] + M[i*4+3]*v[3]);

export const transpose = M => { const r = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) r[j*4+i] = M[i*4+j]; return r; };
export const det = M => {
  // cofactor expansion along the first row, using 3x3 minors
  const m = (r, c) => M[r*4+c];
  const d3 = (a, b, c, d, e, f, g, h, i) => a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
  let s = 0;
  for (let c = 0; c < 4; c++) {
    const k = [0,1,2,3].filter(x => x !== c);
    s += (c % 2 ? -1 : 1) * m(0, c) * d3(m(1,k[0]), m(1,k[1]), m(1,k[2]), m(2,k[0]), m(2,k[1]), m(2,k[2]), m(3,k[0]), m(3,k[1]), m(3,k[2]));
  }
  return s;
};
export const inv = M => {
  // Gauss-Jordan with partial pivoting; returns null if singular
  const a = Array.from({ length: 4 }, (_, i) => [...M.slice(i*4, i*4+4), ...ident().slice(i*4, i*4+4)]);
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; for (let j = 0; j < 8; j++) a[c][j] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 8; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.flatMap(row => row.slice(4));
};

// Cayley transform (I - Q)(I + Q)^-1. It is its own inverse and maps a rotation to a skew-symmetric matrix.
const cayley = Q => {
  const N = inv(Q.map((x, i) => x + ident()[i]));
  return N && mm(ident().map((x, i) => x - Q[i]), N);
};
// Constant-speed interpolation between rotations A and B (orthogonal matrices, vectors as rows).
// Exact along the geodesic when B is a single-plane turn of A, which covers every rotation that
// leaves one axis fixed (our frames keep U). Returns null at 180 degrees where the transform is singular.
export const slerp = (A, B, t) => {
  const K = cayley(mm(transpose(A), B));
  if (!K) return null;
  let m2 = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) m2 += K[i*4+j] ** 2;
  const mag = Math.sqrt(m2);
  if (mag < 1e-12) return A;
  const Q = cayley(K.map(x => x * Math.tan(Math.atan(mag) * t) / mag));
  return Q && mm(A, Q);
};
