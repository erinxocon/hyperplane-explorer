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
