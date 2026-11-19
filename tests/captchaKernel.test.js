// The captcha reader's WebAssembly kernels (src/heist/captcha/captchaKernel.c) against plain-JS
// versions of the same maths (the ones forwardCTC in heistCore.js uses), on random inputs.
// The full network is checked end to end in the browser on the labelled captcha images.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTCHA_KERNEL_WASM } from '../src/heist/captcha/captchaKernelWasm.js';

const bytes = Buffer.from(CAPTCHA_KERNEL_WASM, 'base64');
const memory = new WebAssembly.Memory({ initial: 64 });
const { instance } = await WebAssembly.instantiate(bytes, { env: { memory } });
const ex = instance.exports;
const f32 = new Float32Array(memory.buffer);

let top = (ex.__heap_base.value + 15) & ~15;
function put(arr) { const at = top; f32.set(arr, at >> 2); top += (arr.length * 4 + 15) & ~15; return at; }
function space(n) { return put(new Float32Array(n)); }
const get = (at, n) => f32.slice(at >> 2, (at >> 2) + n);
let seed = 7;
const rnd = n => Float32Array.from({ length: n }, () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 2 ** 32) * 2 - 1; });
function close(a, b, tol = 2e-5) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    assert.ok(d <= tol * Math.max(1, Math.abs(b[i])), `index ${i}: ${a[i]} vs ${b[i]}`);
  }
}

test('captcha kernel: linear (all row / column remainders)', () => {
  for (const [T, nin, nout] of [[1, 3, 4], [5, 7, 12], [9, 75, 24], [13, 192, 28]]) {
    top = (ex.__heap_base.value + 15) & ~15;
    const x = rnd(T * nin), w = rnd(nin * nout), b = rnd(nout);
    const y = space(T * nout);
    ex.linear(put(x), T, nin, put(w), put(b), nout, y);
    const ref = new Float32Array(T * nout);
    for (let t = 0; t < T; t++) for (let o = 0; o < nout; o++) {
      let s = b[o];
      for (let i = 0; i < nin; i++) s += x[t * nin + i] * w[i * nout + o];
      ref[t * nout + o] = s;
    }
    close(get(y, T * nout), ref);
  }
});

test('captcha kernel: im2col + linear + relu = SAME-padded strided conv', () => {
  top = (ex.__heap_base.value + 15) & ~15;
  const H = 9, W = 11, C = 3, k = 5, sy = 2, sx = 2, cout = 8;
  const pad = (n, s) => { const out = Math.ceil(n / s); return { out, p: Math.max((out - 1) * s + k - n, 0) >> 1 }; };
  const py = pad(H, sy), px = pad(W, sx);
  const x = rnd(H * W * C), w = rnd(k * k * C * cout), b = rnd(cout);
  const col = space(py.out * px.out * k * k * C), y = space(py.out * px.out * cout);
  ex.im2col(put(x), H, W, C, k, sy, sx, py.p, px.p, py.out, px.out, col);
  ex.linear(col, py.out * px.out, k * k * C, put(w), put(b), cout, y);
  ex.relu(y, py.out * px.out * cout);
  const ref = new Float32Array(py.out * px.out * cout);
  for (let oy = 0; oy < py.out; oy++) for (let ox = 0; ox < px.out; ox++) for (let c = 0; c < cout; c++) {
    let s = b[c];
    for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) {
      const iy = oy * sy + ky - py.p, ix = ox * sx + kx - px.p;
      if (iy < 0 || iy >= H || ix < 0 || ix >= W) continue;
      for (let ci = 0; ci < C; ci++) s += x[(iy * W + ix) * C + ci] * w[((ky * k + kx) * C + ci) * cout + c];
    }
    ref[(oy * px.out + ox) * cout + c] = Math.max(0, s);
  }
  close(get(y, ref.length), ref);
});

test('captcha kernel: layer norm, GELU and attention', () => {
  top = (ex.__heap_base.value + 15) & ~15;
  const T = 6, D = 16, heads = 4, dk = D / heads;
  const x = rnd(T * D), g = rnd(D), be = rnd(D);
  const y = space(T * D);
  ex.layernorm(put(x), T, D, put(g), put(be), y);
  const ln = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    let m = 0; for (let i = 0; i < D; i++) m += x[t * D + i]; m /= D;
    let v = 0; for (let i = 0; i < D; i++) v += (x[t * D + i] - m) ** 2;
    const inv = 1 / Math.sqrt(v / D + 1e-5);
    for (let i = 0; i < D; i++) ln[t * D + i] = (x[t * D + i] - m) * inv * g[i] + be[i];
  }
  close(get(y, T * D), ln);

  const z = Float32Array.from(rnd(64), v => v * 4);
  const zp = put(z);
  ex.gelu(zp, z.length);
  const erf = v => { const s = v >= 0 ? 1 : -1, a = Math.abs(v), t = 1 / (1 + 0.3275911 * a);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
  close(get(zp, z.length), Float32Array.from(z, v => 0.5 * v * (1 + erf(v * Math.SQRT1_2))));

  const Q = rnd(T * D), K = rnd(T * D), V = rnd(T * D);
  const out = space(T * D), scores = space(T);
  ex.attention(put(Q), put(K), put(V), T, D, heads, out, scores);
  const ref = new Float32Array(T * D);
  for (let h = 0; h < heads; h++) for (let i = 0; i < T; i++) {
    const s = [];
    for (let j = 0; j < T; j++) { let d = 0; for (let e = 0; e < dk; e++) d += Q[i * D + h * dk + e] * K[j * D + h * dk + e]; s.push(d / Math.sqrt(dk)); }
    const mx = Math.max(...s), ex2 = s.map(v => Math.exp(v - mx)), sum = ex2.reduce((a, c) => a + c, 0);
    for (let e = 0; e < dk; e++) { let acc = 0; for (let j = 0; j < T; j++) acc += ex2[j] / sum * V[j * D + h * dk + e]; ref[i * D + h * dk + e] = acc; }
  }
  close(get(out, T * D), ref);
});
