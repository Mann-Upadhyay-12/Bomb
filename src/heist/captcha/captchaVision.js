// CaptchaVision: the Heist captcha reader (CNN stem → Transformer encoder → CTC), in the browser.
// createCaptchaVision(SPEC) builds a reader for one model (captchaSpec.js in the app; tests pass others).
// Runs on the WebAssembly SIMD kernels (captchaKernel.c) once they are compiled, the JS forward pass
// before that or where SIMD is missing — both compute the same network.
import { CAPTCHA_KERNEL_WASM } from './captchaKernelWasm.js';

export function createCaptchaVision(SPEC, opts = {}) {
const NATIVE = [[360, 4], [434, 6], [542, 8]];
const DIFF = {4: 'EASY', 6: 'MID', 8: 'HARD'};
let MODEL = null;

// float16 → float32 for all 65536 bit patterns, built once (inf/NaN read as 0, as before).
let F16 = null;
function f16Table() {
  if (F16) return F16;
  F16 = new Float32Array(65536);
  for (let x = 0; x < 65536; x++) {
    const sg = (x & 0x8000) ? -1 : 1, e = (x >> 10) & 31, m = x & 1023;
    F16[x] = e === 0 ? sg * Math.pow(2, -14) * (m / 1024) : e === 31 ? 0 : sg * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  return F16;
}
// base64 float16 weights → float32, into `out` (at element offset `at`) or a new array.
function b64f16(s, out, at = 0) {
  const bin = atob(s), n = bin.length >> 1, lut = f16Table();
  const f = out || new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 2) f[at + i] = lut[bin.charCodeAt(j) | (bin.charCodeAt(j + 1) << 8)];
  return f;
}

// A SPEC weight field → float32 (nin × nout, output channel last, as stored), into `out` at `at` or new.
//   "base64"                 float16
//   {q8, s}                  int8 + one float16 scale per output channel: w = q · s[o]
//   {q4, s, g, n}            int4 (two per byte, low nibble first) + a scale per output channel per g inputs
function decW(field, nout, out, at = 0) {
  if (typeof field === 'string') return b64f16(field, out, at);
  const s = b64f16(field.s);
  if (field.q8) {
    const bin = atob(field.q8), n = bin.length, f = out || new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const q = bin.charCodeAt(i);
      f[at + i] = (q > 127 ? q - 256 : q) * s[i % nout];
    }
    return f;
  }
  if (field.q4) {
    const bin = atob(field.q4), n = field.n, g = field.g, f = out || new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const byte = bin.charCodeAt(i >> 1), nib = (i & 1) ? byte >> 4 : byte & 15;
      const o = i % nout, row = (i / nout) | 0;
      f[at + i] = (nib > 7 ? nib - 16 : nib) * s[((row / g) | 0) * nout + o];
    }
    return f;
  }
  throw new Error('unknown weight format');
}

function transpose(w, nin, nout) {
  const wt = new Float32Array(nout * nin);
  for (let i = 0; i < nin; i++) {
    const inb = i * nout;
    for (let o = 0; o < nout; o++) {
      wt[o * nin + i] = w[inb + o];
    }
  }
  return wt;
}

function loadModel() {
  const decLin = (wB64, bB64, nin, nout) => {
    const w = decW(wB64, nout);
    const b = b64f16(bB64);
    const wt = transpose(w, nin, nout);
    return { w: wt, b, nin, nout };
  };

  const decLN = ln => ({ gamma: b64f16(ln.gamma), beta: b64f16(ln.beta) });
  const decConv = l => ({
    k: l.k, cout: l.cout, sy: l.sy, sx: l.sx,
    w: decW(l.w, l.cout), b: b64f16(l.b)
  });

  const blocks = SPEC.blocks.map(b => ({
    ln_att: decLN(b.ln_att),
    q: decLin(b.q_w, b.q_b, SPEC.d, SPEC.d),
    k: decLin(b.k_w, b.k_b, SPEC.d, SPEC.d),
    v: decLin(b.v_w, b.v_b, SPEC.d, SPEC.d),
    o: decLin(b.o_w, b.o_b, SPEC.d, SPEC.d),
    ln_ff: decLN(b.ln_ff),
    up: decLin(b.up_w, b.up_b, SPEC.d, SPEC.ff),
    down: decLin(b.down_w, b.down_b, SPEC.ff, SPEC.d)
  }));

  return {
    charset: SPEC.charset,
    blank: SPEC.blank,
    d: SPEC.d,
    ff: SPEC.ff,
    heads: SPEC.heads,
    stem_conv: SPEC.stem_conv.map(decConv),
    dense0: decLin(SPEC.dense0.w, SPEC.dense0.b, SPEC.dense0.nin, SPEC.d),
    ln0: decLN(SPEC.ln0),
    blocks: blocks,
    ln_final: decLN(SPEC.ln_final),
    head: decLin(SPEC.head.w, SPEC.head.b, SPEC.d, SPEC.head.nout),
    _bufs: null
  };
}

function pad(n, k, s) {
  const out = Math.ceil(n / s), tot = Math.max((out - 1) * s + k - n, 0);
  return {out, pad: tot >> 1};
}

function conv2d(x, H, W, C, L) {
  const {k, cout, sy, sx, w, b} = L;
  const py = pad(H, k, sy), px = pad(W, k, sx);
  const oH = py.out, oW = px.out;
  const y = new Float32Array(oH * oW * cout);
  for (let oy = 0; oy < oH; oy++) {
    for (let ox = 0; ox < oW; ox++) {
      const base = (oy * oW + ox) * cout;
      for (let c = 0; c < cout; c++) y[base + c] = b[c];
      for (let ky = 0; ky < k; ky++) {
        const iy = oy * sy + ky - py.pad;
        if (iy < 0 || iy >= H) continue;
        for (let kx = 0; kx < k; kx++) {
          const ix = ox * sx + kx - px.pad;
          if (ix < 0 || ix >= W) continue;
          const ib = (iy * W + ix) * C, wb = (ky * k + kx) * C * cout;
          for (let ci = 0; ci < C; ci++) {
            const v = x[ib + ci];
            if (v === 0) continue;
            const wo = wb + ci * cout;
            for (let c = 0; c < cout; c++) y[base + c] += v * w[wo + c];
          }
        }
      }
      for (let c = 0; c < cout; c++) {
        const v = y[base + c];
        y[base + c] = v > 0 ? v : 0;
      }
    }
  }
  return {y, H: oH, W: oW, C: cout};
}

function layerNorm(x, T, D, LN, out) {
  const {gamma, beta} = LN;
  const y = out || new Float32Array(T * D);
  const eps = 1e-5;
  for (let t = 0; t < T; t++) {
    const base = t * D;
    let mean = 0;
    for (let i = 0; i < D; i++) mean += x[base + i];
    mean /= D;
    let varSum = 0;
    for (let i = 0; i < D; i++) {
      const diff = x[base + i] - mean;
      varSum += diff * diff;
    }
    const invStd = 1.0 / Math.sqrt(varSum / D + eps);
    for (let i = 0; i < D; i++) {
      y[base + i] = (x[base + i] - mean) * invStd * gamma[i] + beta[i];
    }
  }
  return y;
}

function linearFast(x, T, lin, out) {
  const {w: WT, b: B, nin, nout} = lin;
  const y = out || new Float32Array(T * nout);
  for (let t = 0; t < T; t++) {
    const xb = t * nin, yb = t * nout;
    for (let o = 0; o < nout; o++) {
      let s = B[o];
      const ob = o * nin;
      for (let i = 0; i < nin; i++) {
        s += x[xb + i] * WT[ob + i];
      }
      y[yb + o] = s;
    }
  }
  return y;
}

function posEnc(x, T, D) {
  const halfD = D >> 1;
  for (let t = 0; t < T; t++) {
    const base = t * D;
    for (let i = 0; i < halfD; i++) {
      const ang = t / Math.pow(10000.0, (2.0 * i) / D);
      x[base + i] += Math.sin(ang);
      x[base + halfD + i] += Math.cos(ang);
    }
  }
  return x;
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const p = 0.3275911;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function geluInplace(x) {
  const sqrt2Inv = 0.7071067811865475;
  const len = x.length;
  for (let i = 0; i < len; i++) {
    const v = x[i];
    x[i] = 0.5 * v * (1.0 + erf(v * sqrt2Inv));
  }
  return x;
}

function multiHeadAttentionFast(x, T, D, numHeads, block, bufs) {
  const keyDim = (D / numHeads) | 0;
  const Q = linearFast(x, T, block.q, bufs.Q);
  const K = linearFast(x, T, block.k, bufs.K);
  const V = linearFast(x, T, block.v, bufs.V);
  const scale = 1.0 / Math.sqrt(keyDim);

  const concat = bufs.concat;
  const scores = bufs.scores;

  for (let h = 0; h < numHeads; h++) {
    const hOff = h * keyDim;
    for (let i = 0; i < T; i++) {
      const qBase = i * D + hOff;
      let maxScore = -1e18;
      for (let j = 0; j < T; j++) {
        const kBase = j * D + hOff;
        let dot = 0;
        for (let d = 0; d < keyDim; d++) {
          dot += Q[qBase + d] * K[kBase + d];
        }
        const s = dot * scale;
        scores[j] = s;
        if (s > maxScore) maxScore = s;
      }
      let sumExp = 0;
      for (let j = 0; j < T; j++) {
        const expScore = Math.exp(scores[j] - maxScore);
        scores[j] = expScore;
        sumExp += expScore;
      }
      const invSum = 1.0 / sumExp;
      for (let j = 0; j < T; j++) scores[j] *= invSum;

      const outBase = i * D + hOff;
      for (let d = 0; d < keyDim; d++) concat[outBase + d] = 0;
      for (let j = 0; j < T; j++) {
        const sj = scores[j];
        const vBase = j * D + hOff;
        for (let d = 0; d < keyDim; d++) {
          concat[outBase + d] += sj * V[vBase + d];
        }
      }
    }
  }

  return linearFast(concat, T, block.o, bufs.mhaOut);
}

function getScratch(m, T, D, FF, C, F) {
  if (!m._bufs || m._bufs.T < T) {
    m._bufs = {
      T,
      seq: new Float32Array(T * F),
      proj: new Float32Array(T * D),
      cur: new Float32Array(T * D),
      normBuf: new Float32Array(T * D),
      Q: new Float32Array(T * D),
      K: new Float32Array(T * D),
      V: new Float32Array(T * D),
      concat: new Float32Array(T * D),
      scores: new Float32Array(T),
      mhaOut: new Float32Array(T * D),
      ffUp: new Float32Array(T * FF),
      ffDown: new Float32Array(T * D),
      logits: new Float32Array(T * C),
      logProbs: new Float32Array(T * C)
    };
  }
  return m._bufs;
}

function forwardCTC(m, img, H, W) {
  let a = {y: img, H, W, C: 3};
  for (const L of m.stem_conv) a = conv2d(a.y, a.H, a.W, a.C, L);

  const T = a.W, F = a.H * a.C;
  const bufs = getScratch(m, T, m.d, m.ff, m.head.nout, F);

  const seq = bufs.seq;
  for (let t = 0; t < T; t++) {
    for (let h = 0; h < a.H; h++) {
      for (let c = 0; c < a.C; c++) {
        seq[t * F + h * a.C + c] = a.y[(h * a.W + t) * a.C + c];
      }
    }
  }

  const proj = linearFast(seq, T, m.dense0, bufs.proj);
  const norm0 = layerNorm(proj, T, m.d, m.ln0, bufs.cur);
  let cur = posEnc(norm0, T, m.d);

  for (let i = 0; i < m.blocks.length; i++) {
    const b = m.blocks[i];
    const normAtt = layerNorm(cur, T, m.d, b.ln_att, bufs.normBuf);
    const mhaOut = multiHeadAttentionFast(normAtt, T, m.d, m.heads, b, bufs);
    for (let j = 0; j < cur.length; j++) cur[j] += mhaOut[j];

    const normFF = layerNorm(cur, T, m.d, b.ln_ff, bufs.normBuf);
    const ffUp = geluInplace(linearFast(normFF, T, b.up, bufs.ffUp));
    const ffDown = linearFast(ffUp, T, b.down, bufs.ffDown);
    for (let j = 0; j < cur.length; j++) cur[j] += ffDown[j];
  }

  const normFinal = layerNorm(cur, T, m.d, m.ln_final, bufs.normBuf);
  const logits = linearFast(normFinal, T, m.head, bufs.logits);
  const nClasses = m.head.nout;

  const logProbs = bufs.logProbs;
  for (let t = 0; t < T; t++) {
    const base = t * nClasses;
    let maxL = -1e18;
    for (let c = 0; c < nClasses; c++) {
      if (logits[base + c] > maxL) maxL = logits[base + c];
    }
    let sumExp = 0;
    for (let c = 0; c < nClasses; c++) {
      sumExp += Math.exp(logits[base + c] - maxL);
    }
    const logSum = maxL + Math.log(sumExp);
    for (let c = 0; c < nClasses; c++) {
      logProbs[base + c] = logits[base + c] - logSum;
    }
  }

  return {logProbs, T, nClasses};
}

function fixedLenDecode(lp, T, Kc, N, charset) {
  const B = Kc - 1;
  const NEG = -1e18;
  const stateLen = (N + 1) * Kc;
  let cur = new Float32Array(stateLen);
  let nxt = new Float32Array(stateLen);
  cur.fill(NEG, 0, stateLen);
  cur[0 * Kc + B] = 0.0;

  const back = new Int16Array(T * (N + 1) * Kc * 2);

  for (let t = 0; t < T; t++) {
    nxt.fill(NEG, 0, stateLen);

    for (let k = 0; k <= N; k++) {
      let i1 = 0, i2 = 1;
      let v1 = cur[k * Kc + 0], v2 = cur[k * Kc + 1];
      if (v2 > v1) { const tmp = i1; i1 = i2; i2 = tmp; const tv = v1; v1 = v2; v2 = tv; }
      for (let c = 2; c < Kc; c++) {
        const v = cur[k * Kc + c];
        if (v > v1) { i2 = i1; v2 = v1; i1 = c; v1 = v; }
        else if (v > v2) { i2 = c; v2 = v; }
      }

      if (v1 <= NEG / 2) continue;

      const vBlank = v1 + lp[t * Kc + B];
      if (vBlank > nxt[k * Kc + B]) {
        nxt[k * Kc + B] = vBlank;
        const bIdx = (t * (N + 1) * Kc + k * Kc + B) * 2;
        back[bIdx] = k;
        back[bIdx + 1] = i1;
      }

      for (let c = 0; c < B; c++) {
        const vSame = cur[k * Kc + c];
        if (vSame > NEG / 2) {
          const vEmitSame = vSame + lp[t * Kc + c];
          if (vEmitSame > nxt[k * Kc + c]) {
            nxt[k * Kc + c] = vEmitSame;
            const bIdx = (t * (N + 1) * Kc + k * Kc + c) * 2;
            back[bIdx] = k;
            back[bIdx + 1] = c;
          }
        }

        if (k < N) {
          const s = (i1 !== c) ? i1 : i2;
          const vPrev = cur[k * Kc + s];
          if (vPrev > NEG / 2) {
            const vNew = vPrev + lp[t * Kc + c];
            if (vNew > nxt[(k + 1) * Kc + c]) {
              nxt[(k + 1) * Kc + c] = vNew;
              const bIdx = (t * (N + 1) * Kc + (k + 1) * Kc + c) * 2;
              back[bIdx] = k;
              back[bIdx + 1] = s;
            }
          }
        }
      }
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }

  let cEnd = 0, maxEndVal = cur[N * Kc + 0];
  for (let c = 1; c < Kc; c++) {
    if (cur[N * Kc + c] > maxEndVal) {
      maxEndVal = cur[N * Kc + c];
      cEnd = c;
    }
  }

  if (maxEndVal <= NEG / 2) {
    let greedyText = '', prev = -1;
    for (let t = 0; t < T; t++) {
      let bestC = 0, bestV = lp[t * Kc + 0];
      for (let c = 1; c < Kc; c++) {
        if (lp[t * Kc + c] > bestV) { bestV = lp[t * Kc + c]; bestC = c; }
      }
      if (bestC !== prev && bestC !== B) greedyText += charset[bestC];
      prev = bestC;
    }
    return {text: greedyText, conf: [0.5], slots: []};
  }

  const syms = new Int32Array(T);
  let trK = N, trC = cEnd;
  for (let t = T - 1; t >= 0; t--) {
    syms[t] = trC;
    const bIdx = (t * (N + 1) * Kc + trK * Kc + trC) * 2;
    trK = back[bIdx];
    trC = back[bIdx + 1];
  }

  let text = '';
  const conf = [];
  const slots = [];
  let prevSym = -1;

  for (let t = 0; t < T; t++) {
    const c = syms[t];
    if (c !== B) {
      const prob = Math.exp(lp[t * Kc + c]);
      if (c === prevSym && conf.length > 0) {
        conf[conf.length - 1] = Math.max(conf[conf.length - 1], prob);
        slots[slots.length - 1].p = Math.max(slots[slots.length - 1].p, prob);
      } else {
        text += charset[c];
        conf.push(prob);
        const alts = [];
        for (let ac = 0; ac < B; ac++) {
          if (ac !== c) alts.push([charset[ac], Math.exp(lp[t * Kc + ac])]);
        }
        alts.sort((a, b) => b[1] - a[1]);
        slots.push({ch: charset[c], p: prob, alts: alts.slice(0, 3)});
      }
    }
    prevSym = c;
  }

  return {text, conf, slots};
}

// ── WebAssembly SIMD engine (captcha/captchaKernel.c) ──
// The same network as forwardCTC, in float32 SIMD, with all TTA reads run as one batch.
// Compiled in the background when the page mounts; until it is ready (or where WebAssembly SIMD is
// missing) recognize() uses the JS forward pass above, so a captcha is never refused.
let WASM = null, wasmStarted = false;

function startWasm() {
  if (wasmStarted) return wasmStarted;
  wasmStarted = Promise.resolve();
  try {
    if (typeof WebAssembly !== 'object' || !CAPTCHA_KERNEL_WASM) return wasmStarted;
    const bin = atob(CAPTCHA_KERNEL_WASM), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (!WebAssembly.validate(bytes)) return wasmStarted; // no SIMD support: stay on the JS path
    const memory = new WebAssembly.Memory({initial: 1});
    wasmStarted = WebAssembly.instantiate(bytes, {env: {memory}})
      .then(({instance}) => { WASM = buildWasmEngine(instance.exports, memory); })
      .catch(e => { try { console.warn('[CaptchaVision] WebAssembly engine unavailable, using JS', e); } catch (_) {} });
  } catch (e) { /* JS path */ }
  return wasmStarted;
}

// Lays out the weights and every scratch buffer in wasm memory once; shapes come from SPEC.
function buildWasmEngine(ex, memory) {
  const D = SPEC.d, FF = SPEC.ff, C = SPEC.head.nout;
  // the SIMD linear kernel writes 4 outputs at a time: every layer's output size must be a multiple of 4
  const outs = [...SPEC.stem_conv.map(l => l.cout), D, FF, C];
  if (outs.some(n => n % 4)) throw new Error('layer sizes ' + outs.join('/') + ' not all multiples of 4: using the JS engine');
  const B = SPEC.tta && Array.isArray(SPEC.tta.shifts) && SPEC.tta.shifts.length > 1 ? SPEC.tta.shifts.length : 1;
  const H0 = 105, W0 = (NATIVE[NATIVE.length - 1][0] / 2) | 0; // largest half-res input
  let top = (ex.__heap_base.value + 15) & ~15;
  const plan = [];
  const alloc = n => { const at = top; top += ((n * 4 + 15) & ~15); return at; };
  const tensor = (field, nout, n) => { const at = alloc(n); plan.push([field, nout, at]); return at; };
  const lin = (w, b, nin, nout) => ({w: tensor(w, nout, nin * nout), b: tensor(b, nout, nout), nin, nout});
  const ln = l => ({g: tensor(l.gamma, D, D), b: tensor(l.beta, D, D)});

  // stem shapes for the largest input decide the conv buffers
  let h = H0, w = W0, c = 3, maxAct = h * w * c, maxCol = 0;
  const stem = SPEC.stem_conv.map(l => {
    const py = pad(h, l.k, l.sy), px = pad(w, l.k, l.sx);
    maxCol = Math.max(maxCol, py.out * px.out * l.k * l.k * c);
    maxAct = Math.max(maxAct, py.out * px.out * l.cout);
    const L = {k: l.k, sy: l.sy, sx: l.sx, cout: l.cout, w: tensor(l.w, l.cout, l.k * l.k * c * l.cout), b: tensor(l.b, l.cout, l.cout)};
    h = py.out; w = px.out; c = l.cout;
    return L;
  });
  const Tmax = w, F = h * c, R = B * Tmax;
  if (F !== SPEC.dense0.nin) throw new Error('unexpected stem output');
  const net = {
    stem,
    dense0: lin(SPEC.dense0.w, SPEC.dense0.b, F, D),
    ln0: ln(SPEC.ln0),
    blocks: SPEC.blocks.map(b => ({
      ln_att: ln(b.ln_att), q: lin(b.q_w, b.q_b, D, D), k: lin(b.k_w, b.k_b, D, D), v: lin(b.v_w, b.v_b, D, D),
      o: lin(b.o_w, b.o_b, D, D), ln_ff: ln(b.ln_ff), up: lin(b.up_w, b.up_b, D, FF), down: lin(b.down_w, b.down_b, FF, D)
    })),
    ln_final: ln(SPEC.ln_final),
    head: lin(SPEC.head.w, SPEC.head.b, D, C)
  };
  const buf = {
    img: alloc(H0 * W0 * 3), actA: alloc(maxAct), actB: alloc(maxAct), col: alloc(maxCol),
    seq: alloc(R * F), cur: alloc(R * D), norm: alloc(R * D), Q: alloc(R * D), K: alloc(R * D), V: alloc(R * D),
    concat: alloc(R * D), tmp: alloc(R * D), ffUp: alloc(R * FF), logits: alloc(R * C), scores: alloc(Tmax)
  };
  const need = Math.ceil(top / 65536) - memory.buffer.byteLength / 65536;
  if (need > 0) memory.grow(need);
  const f32 = new Float32Array(memory.buffer);
  for (const [field, nout, at] of plan) decW(field, nout, f32, at >> 2);
  // sinusoidal position table, same values posEnc adds
  const pe = new Float64Array(Tmax * D), half = D >> 1;
  for (let t = 0; t < Tmax; t++) for (let i = 0; i < half; i++) {
    const ang = t / Math.pow(10000.0, (2.0 * i) / D);
    pe[t * D + i] = Math.sin(ang); pe[t * D + half + i] = Math.cos(ang);
  }
  return {ex, f32, net, buf, pe, D, FF, C, F, H0, W0, maxBatch: B, Tmax};
}

// Forward pass for a batch of half-res images (each H×W×3) → per image {lp, T, K} log-probs.
function forwardWasm(E, imgs, H, W) {
  const {ex, f32, net, buf, pe, D, FF, C, F} = E;
  const lin = (x, rows, L, y) => ex.linear(x, rows, L.nin, L.w, L.b, L.nout, y);
  let T = 0;
  imgs.forEach((img, b) => {
    f32.set(img, buf.img >> 2);
    let src = buf.img, h = H, w = W, c = 3, dst = buf.actA;
    for (const L of net.stem) {
      const py = pad(h, L.k, L.sy), px = pad(w, L.k, L.sx), rows = py.out * px.out;
      ex.im2col(src, h, w, c, L.k, L.sy, L.sx, py.pad, px.pad, py.out, px.out, buf.col);
      ex.linear(buf.col, rows, L.k * L.k * c, L.w, L.b, L.cout, dst);
      ex.relu(dst, rows * L.cout);
      src = dst; dst = dst === buf.actA ? buf.actB : buf.actA;
      h = py.out; w = px.out; c = L.cout;
    }
    // columns become the sequence: seq[t, y*C + ch] = map[(y*W + t)*C + ch]
    T = w;
    const a = src >> 2, seq = (buf.seq >> 2) + b * T * F;
    for (let t = 0; t < T; t++) for (let y = 0; y < h; y++) {
      const from = a + (y * w + t) * c, to = seq + t * F + y * c;
      f32.copyWithin(to, from, from + c);
    }
  });
  const R = imgs.length * T;
  lin(buf.seq, R, net.dense0, buf.tmp);
  ex.layernorm(buf.tmp, R, D, net.ln0.g, net.ln0.b, buf.cur);
  const cur = buf.cur >> 2;
  for (let b = 0; b < imgs.length; b++) for (let i = 0; i < T * D; i++) f32[cur + b * T * D + i] += pe[i];
  for (const blk of net.blocks) {
    ex.layernorm(buf.cur, R, D, blk.ln_att.g, blk.ln_att.b, buf.norm);
    lin(buf.norm, R, blk.q, buf.Q); lin(buf.norm, R, blk.k, buf.K); lin(buf.norm, R, blk.v, buf.V);
    for (let b = 0; b < imgs.length; b++) {
      const off = b * T * D * 4;
      ex.attention(buf.Q + off, buf.K + off, buf.V + off, T, D, SPEC.heads, buf.concat + off, buf.scores);
    }
    lin(buf.concat, R, blk.o, buf.tmp);
    ex.add(buf.cur, buf.tmp, R * D);
    ex.layernorm(buf.cur, R, D, blk.ln_ff.g, blk.ln_ff.b, buf.norm);
    lin(buf.norm, R, blk.up, buf.ffUp);
    ex.gelu(buf.ffUp, R * FF);
    lin(buf.ffUp, R, blk.down, buf.tmp);
    ex.add(buf.cur, buf.tmp, R * D);
  }
  ex.layernorm(buf.cur, R, D, net.ln_final.g, net.ln_final.b, buf.norm);
  lin(buf.norm, R, net.head, buf.logits);
  // log-softmax per column, in JS doubles like forwardCTC
  const lg = buf.logits >> 2;
  return imgs.map((_, b) => {
    const lp = new Float32Array(T * C);
    for (let t = 0; t < T; t++) {
      const base = lg + (b * T + t) * C;
      let maxL = -1e18;
      for (let k = 0; k < C; k++) if (f32[base + k] > maxL) maxL = f32[base + k];
      let sumExp = 0;
      for (let k = 0; k < C; k++) sumExp += Math.exp(f32[base + k] - maxL);
      const logSum = maxL + Math.log(sumExp);
      for (let k = 0; k < C; k++) lp[t * C + k] = f32[base + k] - logSum;
    }
    return {lp, T, K: C};
  });
}

// All reads of one prepared captcha (one per TTA shift): wasm batch when ready, else the JS pass.
function readAll(p, shifts) {
  const imgs = shifts.map(([dx, dy]) => (dx || dy ? shiftImg(p.img, 105, p.W, dx, dy) : p.img));
  if (WASM && imgs.length <= WASM.maxBatch && p.W <= WASM.W0) {
    try { return forwardWasm(WASM, imgs, 105, p.W); }
    catch (e) { try { console.warn('[CaptchaVision] WebAssembly read failed, using JS', e); } catch (_) {} WASM = null; }
  }
  if (!MODEL) MODEL = loadModel();
  return imgs.map(img => {
    const r = forwardCTC(MODEL, img, 105, p.W);
    return {lp: Float32Array.from(r.logProbs.subarray(0, r.T * r.nClasses)), T: r.T, K: r.nClasses};
  });
}

function prep(src) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const w210 = sw * 210 / sh;
  let best = NATIVE[0], bd = 1e9;
  for (const c of NATIVE) {
    const d = Math.abs(w210 - c[0]);
    if (d < bd) { bd = d; best = c; }
  }
  const Wt = best[0], N = best[1];
  const cv = document.createElement('canvas');
  cv.width = Wt; cv.height = 210;
  const cx = cv.getContext('2d', {willReadFrequently: true});
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, Wt, 210);
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(src, 0, 0, Wt, 210);
  return prepRGBA(cx.getImageData(0, 0, Wt, 210).data, Wt, N, bd / Wt);
}

// RGBA pixels of a captcha already at its native size (Wt × 210) → the model's half-res input.
function prepRGBA(d, Wt, N, off = 0) {
  const Wh = (Wt / 2) | 0;
  const out = new Float32Array(105 * Wh * 3);
  for (let y = 0; y < 105; y++) {
    for (let x = 0; x < Wh; x++) {
      for (let c = 0; c < 3; c++) {
        const i0 = ((2 * y) * Wt + 2 * x) * 4 + c;
        const i2 = i0 + Wt * 4;
        out[(y * Wh + x) * 3 + c] = (d[i0] + d[i0 + 4] + d[i2] + d[i2 + 4]) / 1020;
      }
    }
  }
  return {img: out, W: Wh, N, off};
}

// Same image shifted by (dx, dy) half-res pixels, edges repeated (matches train_captcha.py shift_img).
function shiftImg(img, H, W, dx, dy) {
  const out = new Float32Array(img.length);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(H - 1, Math.max(0, y - dy));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx));
      const o = (y * W + x) * 3, i = (sy * W + sx) * 3;
      out[o] = img[i]; out[o + 1] = img[i + 1]; out[o + 2] = img[i + 2];
    }
  }
  return out;
}

function recognize(src) {
  return recognizePrepared(prep(src));
}

// Averages the reads' probabilities, each lined up first: the model reads 4 px wide columns, so a
// sideways shift of dx moves its output by dx/4 columns (edge columns repeat).
function averageReads(runs, shifts, col) {
  const {T, K} = runs[0];
  const out = new Float32Array(T * K);
  runs.forEach((r, k) => {
    const off = Math.round((shifts[k][0] || 0) / col);
    for (let t = 0; t < T; t++) {
      const st = Math.min(T - 1, Math.max(0, t + off));
      for (let c = 0; c < K; c++) out[t * K + c] += Math.exp(r.lp[st * K + c]);
    }
  });
  for (let i = 0; i < out.length; i++) out[i] = Math.log(Math.max(out[i] / runs.length, 1e-30));
  return out;
}

function confidenceOf(dec) {
  let minP = 1.0, logSum = 0.0;
  for (const pr of dec.conf) {
    minP = Math.min(minP, pr);
    logSum += Math.log(Math.max(pr, 1e-6));
  }
  return {minP, confidence: Math.exp(logSum)};
}

// SPEC.tta (written by train_captcha.py / compress_study.py): read the captcha at several small shifts
// and average the per-column probabilities — fixes many one-off n/m, a/4 slips. score 'prod_agree'
// scales the confidence by how many single reads agree with the averaged answer.
// SPEC.tta.stop (adaptive TTA): read once first; when that read's confidence is ≥ stop, answer it
// (most captchas), otherwise do the other reads too. No SPEC.tta = always one read.
function recognizePrepared(p) {
  const tta = SPEC.tta && Array.isArray(SPEC.tta.shifts) && SPEC.tta.shifts.length > 1 ? SPEC.tta : null;
  const C = SPEC.charset;
  const first = readAll(p, [tta ? tta.shifts[0] : [0, 0]])[0];
  const {T, K} = first;
  const one = fixedLenDecode(first.lp, T, K, p.N, C);
  let dec = one, {minP, confidence} = confidenceOf(one), reads = 1;
  if (tta && !(tta.stop != null && confidence >= tta.stop)) {
    const runs = [first, ...readAll(p, tta.shifts.slice(1))];
    reads = runs.length;
    dec = fixedLenDecode(averageReads(runs, tta.shifts, tta.col || 4), T, K, p.N, C);
    ({minP, confidence} = confidenceOf(dec));
    if (tta.score === 'prod_agree') {
      const agree = runs.filter((r, k) => (k === 0 ? one : fixedLenDecode(r.lp, T, K, p.N, C)).text === dec.text).length;
      confidence *= agree / runs.length;
    }
  }
  return {
    text: dec.text,
    n: p.N,
    diff: DIFF[p.N],
    slots: dec.slots,
    minP,
    confidence,
    reads,
    sizeOff: p.off
  };
}

const ready = opts.wasm === false ? Promise.resolve() : startWasm();
return {
  recognize,
  recognizePrepared,
  prepRGBA,
  decodeWeight: decW,
  THRESH: SPEC.thresh || 0.85,
  engine: () => (WASM ? 'wasm' : 'js'),
  ready
};
}
