#!/usr/bin/env python3
"""
patch_ctc_html.py

Builds HiTestCTC.html from GayHeistFinal.html by embedding:
1. High-performance CTC Transformer inference engine (transposed weights, static buffers, vectorized MHA, in-place GELU)
2. Fast-path All-mode recognition pipeline (ColorVision fast-exit, aspect ratio pre-filter, confident captcha fast-exit, ChineseVision guard)
3. Immediate clipboard auto-copy on paste (preserving browser transient user-activation)
"""
import sys
import os
import json
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

CTC_INFERENCE_JS = r"""/* CaptchaVision CTC: High-Performance In-Browser Transformer Engine */
(function(global){
'use strict';

const SPEC = __SPEC__;
const NATIVE = [[360, 4], [434, 6], [542, 8]];
const DIFF = {4: 'EASY', 6: 'MID', 8: 'HARD'};
let MODEL = null;

function b64f16(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const h = new Uint16Array(u.buffer), f = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const x = h[i], sg = (x & 0x8000) ? -1 : 1, e = (x >> 10) & 31, m = x & 1023;
    f[i] = e === 0 ? sg * Math.pow(2, -14) * (m / 1024) : e === 31 ? 0 : sg * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  return f;
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
    const w = b64f16(wB64);
    const b = b64f16(bB64);
    const wt = transpose(w, nin, nout);
    return { w: wt, b, nin, nout };
  };

  const decLN = ln => ({ gamma: b64f16(ln.gamma), beta: b64f16(ln.beta) });
  const decConv = l => ({
    k: l.k, cout: l.cout, sy: l.sy, sx: l.sx,
    w: b64f16(l.w), b: b64f16(l.b)
  });

  const blocks = SPEC.blocks.map(b => ({
    ln_att: decLN(b.ln_att),
    q: decLin(b.q_w, b.q_b, SPEC.d, SPEC.d),
    k: decLin(b.k_w, b.k_b, SPEC.d, SPEC.d),
    v: decLin(b.v_w, b.v_b, SPEC.d, SPEC.d),
    o: decLin(b.o_w, b.o_b, SPEC.d, SPEC.d),
    ln_ff: decLN(b.ln_ff),
    up: decLin(b.up_w, b.up_b, SPEC.d, SPEC.ff || 768),
    down: decLin(b.down_w, b.down_b, SPEC.ff || 768, SPEC.d)
  }));

  return {
    charset: SPEC.charset,
    blank: SPEC.blank,
    d: SPEC.d,
    heads: SPEC.heads,
    stem_conv: SPEC.stem_conv.map(decConv),
    dense0: decLin(SPEC.dense0.w, SPEC.dense0.b, 896, SPEC.d),
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

function getScratch(m, T, D, FF, C) {
  if (!m._bufs || m._bufs.T < T) {
    m._bufs = {
      T,
      seq: new Float32Array(T * 896),
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
      logProbs: new Float32Array(T * C),
      decCur: new Float32Array(9 * C),
      decNxt: new Float32Array(9 * C)
    };
  }
  return m._bufs;
}

function forwardCTC(m, img, H, W) {
  let a = {y: img, H, W, C: 3};
  for (const L of m.stem_conv) a = conv2d(a.y, a.H, a.W, a.C, L);

  const T = a.W, F = a.H * a.C;
  const bufs = getScratch(m, T, m.d, 768, m.head.nout);

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
  const bufs = getScratch(MODEL, T, MODEL.d, 768, Kc);
  const stateLen = (N + 1) * Kc;
  let cur = bufs.decCur;
  let nxt = bufs.decNxt;
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
  const d = cx.getImageData(0, 0, Wt, 210).data;
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
  return {img: out, W: Wh, N, off: bd / Wt};
}

function recognize(src) {
  if (!MODEL) MODEL = loadModel();
  const p = prep(src);
  const {logProbs, T, nClasses} = forwardCTC(MODEL, p.img, 105, p.W);
  const dec = fixedLenDecode(logProbs, T, nClasses, p.N, MODEL.charset);
  let minP = 1.0, logSum = 0.0;
  for (const pr of dec.conf) {
    minP = Math.min(minP, pr);
    logSum += Math.log(Math.max(pr, 1e-6));
  }
  const confidence = Math.exp(logSum);
  return {
    text: dec.text,
    n: p.N,
    diff: DIFF[p.N],
    slots: dec.slots,
    minP,
    confidence,
    sizeOff: p.off
  };
}

global.CaptchaVision = {recognize, THRESH: SPEC.thresh || 0.85};
})(typeof window === 'undefined' ? globalThis : window);
"""

OPTIMIZED_RECOGNIZE_JS = r"""  function recognize(sample,mode='all',opts={}) {
    const warn=e=>{try{console.warn('[CipherCore recognizer]',e);}catch(_){}};
    const canvasSource = (opts && opts.canvas) || sample.canvas || (typeof state !== 'undefined' ? state.canvas : null);
    if(mode==='captcha'){
      if(!global.CaptchaVision||!canvasSource) return {ok:false,error:'The captcha reader is unavailable.',candidates:[]};
      const r=global.CaptchaVision.recognize(canvasSource);
      CipherState.captchaInfo=r;
      const review=r.confidence<global.CaptchaVision.THRESH||r.sizeOff>0.06;
      return {ok:true,type:'captcha',output:r.text,normalized:r.text,reading:r.text,confidence:r.confidence,
        trace:['Captcha '+r.diff+' ('+r.n+' characters): '+r.text],needsReview:review,candidates:[],conflicting:[],boxes:[]};
    }

    const raw=[];
    const accept=(candidate,fallback)=>{
      if(!candidate||!candidate.text)return;
      const type=candidate.type||fallback||mode;
      const decoded=decodeText(candidate.text,type==='numeric'?mode:type,{...opts,strict:true,fromVision:true});
      if(decoded.ok && (mode==='all'||decoded.type===mode)) raw.push({...candidate,...decoded,reading:candidate.text,confidence:Math.max(0,Math.min(1,Number(candidate.confidence)||0)),diagnostics:candidate.diagnostics||[],boxes:candidate.boxes||[]});
    };

    // Fast-path: ColorVision runs in <3ms.
    // If a valid color-word grid is found, accept it immediately and skip all other engines.
    let colorHit=false;
    if((mode==='all'||mode==='colortext')&&global.ColorVision&&canvasSource){
      try{
        const cr=global.ColorVision.recognize(canvasSource,sample);
        const hasColorWords = cr && cr.boxes && cr.boxes.some(b => !b.label.includes('(black)'));
        if(cr&&(mode==='colortext'||((cr.confidence>=.4 || cr.minScore>=.4) && hasColorWords))){
          accept(cr,'colortext');
          colorHit=raw.some(c=>c.type==='colortext');
        }
      }catch(e){warn(e);}
    }
    if(mode==='all' && colorHit){
      raw.sort((a,b)=>b.confidence-a.confidence);
      const best=raw[0];
      return { ...best, candidates: raw, conflicting: [] };
    }

    // Captcha vision check in All mode:
    // Captchas strictly have native dimensions 360x210 (~1.71), 434x210 (~2.07), 542x210 (~2.58).
    // Fast-reject any aspect ratio outside 1.35 <= ar <= 3.0 (e.g. Morse/A1Z26/Sort strips with ar >= 3.2).
    let captchaCandidate = null;
    if(mode==='all' && global.CaptchaVision && canvasSource && !colorHit){
      try{
        const sw = canvasSource.naturalWidth || canvasSource.width;
        const sh = canvasSource.naturalHeight || canvasSource.height;
        const ar = sw / Math.max(1, sh);
        if(ar >= 1.35 && ar <= 3.0){
          const r = global.CaptchaVision.recognize(canvasSource);
          if(r && r.sizeOff <= 0.22){
            const avgCharProb = Math.pow(Math.max(1e-9, r.confidence), 1 / r.n);
            const isConfident = (r.confidence >= 0.22) || (avgCharProb >= 0.85 && (r.minP || 0) >= 0.22);
            if(isConfident){
              CipherState.captchaInfo = r;
              const review = r.confidence < global.CaptchaVision.THRESH || r.sizeOff > 0.08;
              const rankConfidence = Math.max(r.confidence, avgCharProb * 0.95);
              captchaCandidate = {
                ok: true,
                type: 'captcha',
                output: r.text,
                normalized: r.text,
                reading: r.text,
                confidence: rankConfidence,
                rawConfidence: r.confidence,
                trace: ['Captcha ' + r.diff + ' (' + r.n + ' characters): ' + r.text],
                needsReview: review,
                boxes: []
              };
              // FAST-PATH: If confident captcha detected, return immediately!
              // Saves running DotVision, CaesarVision, NumericVision, and ChineseVision.
              if(rankConfidence >= 0.70 || (r.confidence >= 0.50 && avgCharProb >= 0.90)){
                return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
              }
            }
          }
        }
      }catch(e){warn(e);}
    }

    if(!sample.bounds || !sample.components.length || sample.components.length > 500){
      if(captchaCandidate){
        return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
      }
      return {ok:false, error: (sample.components && sample.components.length > 500) ? 'Too many marks for a single puzzle. Crop the image to the puzzle row and try again.' : 'No readable marks found. Try a closer, higher-contrast image.', candidates:[]};
    }

    if((mode==='all'||mode==='morse'||mode==='braille')&&global.DotVision){
      try{for(const c of global.DotVision.recognize(sample,mode)||[])accept(c);}catch(e){}
    }

    if((mode==='caesar'||(mode==='all'&&!colorHit))&&global.CaesarVision){
      try{
        const cv=global.CaesarVision.recognize(sample);
        if(cv){if(mode==='all')cv.confidence=Math.max(0,cv.confidence-.05);accept(cv,'caesar');}
      }catch(e){warn(e);}
    }

    if((mode==='all'||['a1z26','binary','sort','words'].includes(mode))&&global.NumericVision){
      try{accept(global.NumericVision.recognize(sample),'numeric');}catch(e){warn(e);}
    }

    // ChineseVision Guard: Only search Chinese template glyphs if no other recognizer
    // found a high-confidence match (>= 0.85). This makes numeric, dot, and Caesar puzzles 15-30ms faster.
    const hasHighConf = raw.some(c => c.confidence >= 0.85);
    if((mode==='chinese'||(mode==='all'&&!hasHighConf))&&global.ChineseVision){
      try{accept(global.ChineseVision.recognize(sample),'chinese');}catch(e){warn(e);}
    }

    if((mode==='all') && !colorHit && captchaCandidate){
      raw.push(captchaCandidate);
      if(/[0-9a-z]/.test(captchaCandidate.output) || captchaCandidate.confidence >= 0.75){
        const filtered = raw.filter(c => c.type !== 'caesar');
        raw.length = 0;
        raw.push(...filtered);
      }
    }

    raw.sort((a,b)=>b.confidence-a.confidence);
    if(!raw.length){
      if(mode==='all' && captchaCandidate) return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
      return {ok:false,error:'Could not read a valid '+(mode==='all'?'puzzle':names[mode]+' puzzle')+'. Try a clearer image, adjust contrast, or type the reading.',candidates:[]};
    }
    const best=raw[0];
    const conflicting=raw.slice(1).filter(c=>c.output!==best.output&&c.confidence>=best.confidence-.07&&c.confidence>=.72);
    const needsReview=best.confidence<.78||conflicting.length>0;
    return {...best,needsReview:best.needsReview||needsReview,candidates:raw,conflicting};
  }"""

OPTIMIZED_READ_IMAGE_JS = r"""  async function readImage(opts = {}){
    if (!state.canvas) return;
    const job = ++state.job;
    setBusy(true);
    hint.textContent = 'Reading image…';
    if (opts.yield !== false && typeof navigator !== 'undefined' && !(navigator.userActivation && navigator.userActivation.isActive)){
      await yieldToUI();
    }
    try {
      const sample = imageSample(state.canvas);
      sample.canvas = state.canvas;
      const r = C.recognize(sample, mode, { ...options(), canvas: state.canvas });
      if (job !== state.job) return;
      renderResult(r, { manual: false, autoCopy: opts.autoCopy !== false, syncCells: true });
      previewMeta.textContent = state.name + ' · ' + state.canvas.width + ' × ' + state.canvas.height + ' px';
    } catch (err) {
      if (job === state.job) failDecode('The image could not be read: ' + (err.message || err));
    } finally {
      if (job === state.job) setBusy(false);
    }
  }"""


def build_ctc_html(src_html_path, spec_json_path, out_html_path, thresh=0.85):
    with open(src_html_path, "r", encoding="utf-8") as f:
        src = f.read()

    with open(spec_json_path, "r", encoding="utf-8") as f:
        spec_str = f.read().strip()

    # 1. Format the CTC JS block with embedded SPEC
    ctc_js = CTC_INFERENCE_JS.replace("__SPEC__", spec_str)

    # 2. Replace existing CaptchaVision block
    if "/* CaptchaVision:" in src:
        cv_start = src.index("/* CaptchaVision:")
        cv_end = src.index("})(typeof window==='undefined'?globalThis:window);", cv_start)
        cv_end += len("})(typeof window==='undefined'?globalThis:window);")
        src = src[:cv_start] + ctc_js.strip() + src[cv_end:]
    elif "/* CaptchaVision CTC:" in src:
        cv_start = src.index("/* CaptchaVision CTC:")
        cv_end = src.index("})(typeof window === 'undefined' ? globalThis : window);", cv_start)
        cv_end += len("})(typeof window === 'undefined' ? globalThis : window);")
        src = src[:cv_start] + ctc_js.strip() + src[cv_end:]
    elif "/* CaesarVision: Offline Serif Latin OCR for Caesar Cipher */" in src:
        marker = "/* CaesarVision: Offline Serif Latin OCR for Caesar Cipher */"
        src = src.replace(marker, ctc_js + "\n\n" + marker)
    else:
        raise ValueError("Could not find insertion marker for CaptchaVision in source HTML")

    # 3. Patch recognize function in CipherCore
    rec_pattern = re.compile(r"  function recognize\(sample,mode='all',opts=\{\}\) \{[\s\S]*?return \{\.\.\.best,needsReview(?:\|\|needsReview)?,candidates:raw,conflicting\};\s*\}", re.MULTILINE)
    if rec_pattern.search(src):
        src = rec_pattern.sub(OPTIMIZED_RECOGNIZE_JS, src, count=1)
    else:
        print("Warning: Could not match recognize regex, searching by markers...")
        rec_start_str = "function recognize(sample,mode='all',opts={})"
        if rec_start_str in src:
            idx1 = src.index(rec_start_str)
            # Find the closing bracket before CipherCore export
            idx2 = src.find("global.CipherCore=", idx1)
            last_brace = src.rfind("}", idx1, idx2)
            src = src[:idx1 - 2] + OPTIMIZED_RECOGNIZE_JS + src[last_brace + 1:]

    # 4. Patch readImage function
    read_img_pattern = re.compile(r"  async function readImage\(opts = \{\}\)\{[\s\S]*?if \(job === state\.job\) setBusy\(false\);\s*\}\s*\}", re.MULTILINE)
    if read_img_pattern.search(src):
        src = read_img_pattern.sub(OPTIMIZED_READ_IMAGE_JS, src, count=1)
    else:
        print("Warning: Could not match readImage regex")

    # 5. Strip legacy slot-model captchaSpecData script tag (saves ~2.5 MB)
    src = re.sub(r'<script\s+[^>]*id=["\']captchaSpecData["\'][^>]*>[\s\S]*?</script>', '', src)

    # 6. Update title
    if "<title>The Gay Heist · CTC Transformer" not in src:
        src = src.replace("<title>The Gay Heist", "<title>The Gay Heist · CTC Transformer")

    out_dir = os.path.dirname(os.path.abspath(out_html_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(out_html_path, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"Successfully generated {out_html_path} ({os.path.getsize(out_html_path)/(1024*1024):.2f} MB)")

    # Also sync to workspace root HiTestCTC.html if out_html_path is in build/
    if "build" in os.path.split(out_dir):
        root_sync = os.path.join(SCRIPT_DIR, "..", os.path.basename(out_html_path))
        with open(root_sync, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"Synced to {root_sync} ({os.path.getsize(root_sync)/(1024*1024):.2f} MB)")


if __name__ == "__main__":
    src_html = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SCRIPT_DIR, "..", "GayHeistFinal.html")
    spec_json = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SCRIPT_DIR, "..", "build", "spec_ctc.json")
    out_html = sys.argv[3] if len(sys.argv) > 3 else os.path.join(SCRIPT_DIR, "..", "build", "HiTestCTC.html")
    build_ctc_html(src_html, spec_json, out_html)
