// Balance — screenshot reader.
// The arrow is drawn in the brass/orange accent colour, so we find it by colour, split the
// white equation text into a reactant half and a product half, and OCR each half.
// Subscripts are smaller and lower than the letters; Tesseract reads them as ordinary digits,
// which is exactly what the formula parser wants ("KNO₃" → "KNO3").

import { ensureOCRWorker } from '../search/searchOCR.js';
import { fixOcrFormulaSide, balanceEquation } from './balanceSolver.js';

const isArrowPx = (r, g, b) => r > 190 && g > 140 && b < 175 && r - b > 55;
const isTextPx = (r, g, b) => r > 150 && g > 150 && b > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 45;

export function locateEquation(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.min(1, 900 / Math.max(iw, ih));
  const W = Math.max(1, Math.round(iw * sc)), H = Math.max(1, Math.round(ih * sc));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;

  // Ignore the title bar (also brass) and the frame: look in the middle band only
  const yA = Math.floor(H * 0.22), yB = Math.ceil(H * 0.92), xA = Math.floor(W * 0.04), xB = Math.ceil(W * 0.96);

  // Text rows: find the horizontal band with most white "ink"
  const rowInk = new Array(H).fill(0);
  for (let y = yA; y < yB; y++) for (let x = xA; x < xB; x++) {
    const i = (y * W + x) * 4;
    if (isTextPx(d[i], d[i + 1], d[i + 2]) || isArrowPx(d[i], d[i + 1], d[i + 2])) rowInk[y]++;
  }
  let best = null, cur = null;
  for (let y = yA; y < yB; y++) {
    if (rowInk[y] > 1) { if (!cur) cur = { y0: y, y1: y, ink: 0 }; cur.y1 = y; cur.ink += rowInk[y]; }
    else if (cur) { if (!best || cur.ink > best.ink) best = cur; cur = null; }
  }
  if (cur && (!best || cur.ink > best.ink)) best = cur;
  if (!best) return { ok: false, reason: 'No equation text found — crop the screenshot to the module.' };
  const pad = Math.max(3, Math.round((best.y1 - best.y0) * 0.25));
  const ty0 = Math.max(0, best.y0 - pad), ty1 = Math.min(H - 1, best.y1 + pad);

  // Arrow columns inside that band
  let ax0 = W, ax1 = -1;
  const colText = new Array(W).fill(0);
  for (let x = xA; x < xB; x++) {
    let arrow = 0;
    for (let y = ty0; y <= ty1; y++) {
      const i = (y * W + x) * 4;
      if (isArrowPx(d[i], d[i + 1], d[i + 2])) arrow++;
      else if (isTextPx(d[i], d[i + 1], d[i + 2])) colText[x]++;
    }
    if (arrow >= 1) { if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; }
  }
  let tx0 = W, tx1 = -1;
  for (let x = xA; x < xB; x++) if (colText[x] > 0 || (x >= ax0 && x <= ax1)) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; }
  if (tx1 < 0) return { ok: false, reason: 'No equation text found.' };

  const crop = (x0, x1) => {
    // white text on dark → black text on white, upscaled for Tesseract
    const w = Math.max(1, x1 - x0 + 1), h = ty1 - ty0 + 1;
    const f = Math.max(2, Math.round(110 / h));
    const P = 20;
    const small = document.createElement('canvas'); small.width = w; small.height = h;
    const sctx = small.getContext('2d');
    const out = sctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((ty0 + y) * W + x0 + x) * 4, o = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // keep anti-aliasing as grey levels; arrow pixels are dropped
      const v = isArrowPx(r, g, b) ? 255 : Math.max(0, Math.min(255, 255 - (lum - 45) * 1.6));
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
    }
    sctx.putImageData(out, 0, 0);
    const c = document.createElement('canvas'); c.width = w * f + 2 * P; c.height = h * f + 2 * P;
    const cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(small, P, P, w * f, h * f);
    return c;
  };

  /**
   * Rebuild one side with subscripts enlarged onto the baseline ("KNO₃" → "KNO3" at full size),
   * because Tesseract tends to drop or misread small lowered digits.
   */
  const normalized = (x0, x1) => {
    const w = Math.max(1, x1 - x0 + 1), h = ty1 - ty0 + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((ty0 + y) * W + x0 + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      mask[y * w + x] = !isArrowPx(r, g, b) && 0.299 * r + 0.587 * g + 0.114 * b > 115 ? 1 : 0;
    }
    // connected components (8-neighbour)
    const lab = new Int32Array(w * h), comps = [];
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!mask[s0] || lab[s0]) continue;
      const id = comps.length + 1, st = [s0]; lab[s0] = id;
      let cx0 = w, cy0 = h, cx1 = -1, cy1 = -1, n = 0;
      while (st.length) {
        const q = st.pop(), qx = q % w, qy = (q / w) | 0; n++;
        if (qx < cx0) cx0 = qx; if (qx > cx1) cx1 = qx; if (qy < cy0) cy0 = qy; if (qy > cy1) cy1 = qy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r2 = ny * w + nx;
          if (mask[r2] && !lab[r2]) { lab[r2] = id; st.push(r2); }
        }
      }
      if (n >= 4) comps.push({ x0: cx0, x1: cx1, y0: cy0, y1: cy1 });
    }
    if (!comps.length) return null;
    // merge components that overlap horizontally (dots of i, etc.) into glyph clusters
    comps.sort((a, b) => a.x0 - b.x0);
    const clusters = [];
    for (const c of comps) {
      const last = clusters[clusters.length - 1];
      const ov = last ? Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0) : -1;
      if (last && ov >= Math.min(c.x1 - c.x0, last.x1 - last.x0) * 0.5) {
        last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1);
        last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1);
      } else clusters.push({ ...c });
    }
    const heights = clusters.map(c => c.y1 - c.y0 + 1);
    const maxH = Math.max(...heights);
    const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
    // cap line from the tallest glyphs only (x-height letters like "e" must not pull it down);
    // baseline from everything letter-sized
    const caps = clusters.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.88);
    const lettersized = clusters.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.6);
    const capTop = med(caps.map(c => c.y0)), base = med(lettersized.map(c => c.y1));
    const capH = Math.max(4, base - capTop + 1);
    clusters.forEach(c => {
      const ch = c.y1 - c.y0 + 1;
      c.sub = (c.y0 - capTop) > capH * 0.42 && c.y1 >= base - capH * 0.08 && ch < capH * 0.85;
    });

    // Per-glyph crops for single-character OCR (black on white, ~64px tall, padded)
    const glyphs = clusters.map((c, k) => {
      const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
      const scale = 64 / Math.max(chh, capH * (c.sub ? 0 : 0.6));
      const PAD = 18;
      const gc = document.createElement('canvas');
      gc.width = Math.round(cw * scale) + 2 * PAD; gc.height = Math.round(chh * scale) + 2 * PAD;
      const gctx = gc.getContext('2d');
      gctx.fillStyle = '#fff'; gctx.fillRect(0, 0, gc.width, gc.height);
      const tmp = gctx.createImageData(cw, chh);
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        const v = mask[(c.y0 + y) * w + c.x0 + x] ? 0 : 255, o = (y * cw + x) * 4;
        tmp.data[o] = tmp.data[o + 1] = tmp.data[o + 2] = v; tmp.data[o + 3] = 255;
      }
      const t2 = document.createElement('canvas'); t2.width = cw; t2.height = chh;
      t2.getContext('2d').putImageData(tmp, 0, 0);
      gctx.imageSmoothingQuality = 'high';
      gctx.drawImage(t2, PAD, PAD, cw * scale, chh * scale);
      const gapBefore = k ? c.x0 - clusters[k - 1].x1 - 1 : 0;
      return {
        canvas: gc,
        sub: c.sub,
        wide: cw > capH * 1.25,                 // probably two touching letters
        tall: (c.y0 - capTop) < capH * 0.18,    // reaches cap height (uppercase / ascender)
        small: chh < capH * 0.72,               // e.g. "+", x-height letters
        spaceBefore: gapBefore > capH * 0.3
      };
    });

    const f = Math.max(2, Math.round(110 / capH));
    const P = 20, outH = Math.round(capH * 1.5);
    const subScale = (c) => (capH * 0.95) / (c.y1 - c.y0 + 1);
    let totalW = P;
    clusters.forEach((c, k) => {
      const gap = k ? Math.max(0, c.x0 - clusters[k - 1].x1 - 1) : 0;
      totalW += gap + (c.sub ? (c.x1 - c.x0 + 1) * subScale(c) + 2 : c.x1 - c.x0 + 1);
    });
    totalW += P;
    const src = document.createElement('canvas'); src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    const img2 = sctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = mask[i] ? 0 : 255; img2.data[i * 4] = img2.data[i * 4 + 1] = img2.data[i * 4 + 2] = v; img2.data[i * 4 + 3] = 255; }
    sctx.putImageData(img2, 0, 0);
    const out = document.createElement('canvas');
    out.width = Math.round(totalW * f); out.height = Math.round((outH + 2 * P) * f);
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
    octx.imageSmoothingQuality = 'high';
    const baseY = P + Math.round(capH * 1.2);
    let cx = P;
    clusters.forEach((c, k) => {
      const gap = k ? Math.max(0, c.x0 - clusters[k - 1].x1 - 1) : 0;
      cx += gap + (c.sub ? 2 : 0);
      const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
      const sc2 = c.sub ? subScale(c) : 1;
      const dw = cw * sc2, dh = chh * sc2;
      const dy = c.sub ? baseY - dh : baseY - (base - c.y0 + 1);
      octx.drawImage(src, c.x0, c.y0, cw, chh, cx * f, dy * f, dw * f, dh * f);
      cx += dw;
    });
    return { canvas: out, subs: clusters.filter(c => c.sub).length, glyphs };
  };

  const hasArrow = ax1 >= ax0;
  const leftX1 = Math.max(tx0, ax0 - 2), rightX0 = Math.min(tx1, ax1 + 2);
  return {
    ok: true,
    hasArrow,
    whole: crop(tx0, tx1),
    left: hasArrow ? crop(tx0, leftX1) : null,
    right: hasArrow ? crop(rightX0, tx1) : null,
    leftN: hasArrow ? normalized(tx0, leftX1) : null,
    rightN: hasArrow ? normalized(rightX0, tx1) : null
  };
}

const WL = 'ABCDEFGHIKLMNOPRSTUVWXYZabcdefghiklmnoprstuy0123456789+()[]';
const MAIN_WL = 'ABCDEFGHIKLMNOPRSTUVWXYZabcdefghiklmnoprstuy+()[]';
// letters whose lowercase form only reaches x-height (so size tells upper from lower case)
const XHEIGHT = new Set('acemnorsuvwxz'.split(''));
const DIGIT_FIX = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9', T: '7' };
const LETTER_FIX = { 0: 'O', 1: 'l', 5: 'S', 8: 'B', 6: 'G', 2: 'Z' };

async function ocrGlyph(worker, g) {
  if (g.wide) {
    await worker.setParameters({ tessedit_char_whitelist: g.sub ? '0123456789' : MAIN_WL, tessedit_pageseg_mode: '8', user_defined_dpi: '300' });
    const { data } = await worker.recognize(g.canvas);
    return String(data.text || '').replace(/\s+/g, '');
  }
  // Single-char mode sometimes returns nothing for small glyphs: fall back to other modes
  for (const psm of ['10', '8', '13', '7']) {
    await worker.setParameters({ tessedit_char_whitelist: g.sub ? '0123456789' : MAIN_WL + '0123456789', tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
    const { data } = await worker.recognize(g.canvas);
    const t = String(data.text || '').replace(/\s+/g, '');
    if (t) return t.slice(0, 1);
  }
  return '';
}

/**
 * Glyph-by-glyph reading: subscripts are read as digits, main glyphs as letters/symbols, and
 * upper/lower case is decided from the glyph's height (OCR alone often confuses c/C, o/O, s/S).
 */
async function readSideByGlyphs(worker, glyphs) {
  let out = '';
  for (const g of glyphs) {
    let t = await ocrGlyph(worker, g);
    if (!t) t = g.sub ? '' : '?';
    if (g.sub) {
      t = t.split('').map(ch => DIGIT_FIX[ch] || ch).join('').replace(/[^0-9]/g, '');
    } else if (!g.wide) {
      if (/[0-9]/.test(t)) t = LETTER_FIX[t] || t;
      if (/[A-Za-z]/.test(t) && XHEIGHT.has(t.toLowerCase())) t = g.tall ? t.toUpperCase() : t.toLowerCase();
      if (t === '+' || (g.small && !g.tall && /[tTxX]/.test(t))) t = ' + ';
    }
    out += (g.spaceBefore && !/^ /.test(t) && !/ $/.test(out) ? ' ' : '') + t;
  }
  return out.replace(/\s*\+\s*/g, ' + ').replace(/\s+/g, ' ').trim();
}

async function ocr(worker, canvas, psm) {
  await worker.setParameters({ tessedit_char_whitelist: WL, tessedit_pageseg_mode: psm, user_defined_dpi: '300', preserve_interword_spaces: '0' });
  const { data } = await worker.recognize(canvas);
  return String(data.text || '').replace(/\s+/g, ' ').trim();
}

/** Read the equation from a screenshot → { ok, equation, raw } */
export async function readEquationImage(img, onStatus = () => {}) {
  const loc = locateEquation(img);
  if (!loc.ok) return loc;
  onStatus('Starting OCR engine…');
  const worker = await ensureOCRWorker();
  onStatus('Reading the equation…');

  const candidates = [];
  if (loc.hasArrow && loc.leftN && loc.rightN) {
    // Most reliable: glyph by glyph
    const L = fixOcrFormulaSide(await readSideByGlyphs(worker, loc.leftN.glyphs));
    const R = fixOcrFormulaSide(await readSideByGlyphs(worker, loc.rightN.glyphs));
    if (L && R) candidates.push(`${L} → ${R}`);
  }
  if (loc.hasArrow && loc.leftN && loc.rightN && !candidates.some(c => balanceEquation(c).ok)) {
    // Preferred: subscripts enlarged onto the baseline
    for (const psm of ['7', '8']) {
      const L = fixOcrFormulaSide(await ocr(worker, loc.leftN.canvas, psm));
      const R = fixOcrFormulaSide(await ocr(worker, loc.rightN.canvas, psm));
      if (L && R) candidates.push(`${L} → ${R}`);
      if (balanceEquation(`${L} → ${R}`).ok) break;
    }
  }
  if (loc.hasArrow && !candidates.some(c => balanceEquation(c).ok)) {
    for (const psm of ['7', '6']) {
      const L = fixOcrFormulaSide(await ocr(worker, loc.left, psm));
      const R = fixOcrFormulaSide(await ocr(worker, loc.right, psm));
      if (L && R) candidates.push(`${L} → ${R}`);
      const eq = candidates[candidates.length - 1];
      if (eq && balanceEquation(eq).ok) break;
    }
  }
  if (!candidates.some(c => balanceEquation(c).ok)) {
    // No coloured arrow found, or the halves didn't parse: read the whole line
    const whole = await ocr(worker, loc.whole, '7');
    candidates.push(whole.replace(/\s*[-—–=]+\s*/, ' → '));
  }
  const good = candidates.find(c => balanceEquation(c).ok);
  return { ok: true, equation: good || candidates[0] || '', parsed: !!good, raw: candidates, debug: loc };
}
