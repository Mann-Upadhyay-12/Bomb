// Balance — screenshot reader.
// The arrow is drawn in the brass/orange accent colour, so we find it by colour, split the
// white equation text into a reactant half and a product half, and OCR each half.
// Subscripts are smaller and lower than the letters; Tesseract reads them as ordinary digits,
// which is exactly what the formula parser wants ("KNO₃" → "KNO3").

import { ensureOCRWorker } from '../search/searchOCR.js';
import { fixOcrFormulaSide, balanceEquation } from './balanceSolver.js';

const isArrowPx = (r, g, b) => r > 190 && g > 140 && b < 175 && r - b > 55;
const isTextPx = (r, g, b) => r > 150 && g > 150 && b > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 45;

/** Two rebuilt lines side by side (a wrapped equation read as one line), with a word gap between. */
function joinCanvases(a, b) {
  const gap = Math.round(a.height * 0.25);
  const c = document.createElement('canvas');
  c.width = a.width + gap + b.width; c.height = Math.max(a.height, b.height);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(a, 0, 0); x.drawImage(b, a.width + gap, 0);
  return c;
}

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
  // Long equations wrap onto 2+ lines: keep every text line, the main one is the line with the arrow
  const allBands = [];
  let cur = null;
  for (let y = yA; y < yB; y++) {
    if (rowInk[y] > 1) {
      if (!cur) cur = { y0: y, y1: y, ink: 0, arrow: 0 };
      cur.y1 = y; cur.ink += rowInk[y];
      for (let x = xA; x < xB; x++) { const i = (y * W + x) * 4; if (isArrowPx(d[i], d[i + 1], d[i + 2])) cur.arrow++; }
    } else if (cur) { allBands.push(cur); cur = null; }
  }
  if (cur) allBands.push(cur);
  let best = null;
  for (const b of allBands) if (!best || (b.arrow > 0) > (best.arrow > 0) || ((b.arrow > 0) === (best.arrow > 0) && b.ink > best.ink)) best = b;
  if (!best) return { ok: false, reason: 'No equation text found — crop the screenshot to the module.' };
  const lineH = best.y1 - best.y0 + 1;
  const extraBands = allBands.filter(b => b !== best && b.y1 - b.y0 + 1 >= lineH * 0.5 && b.ink >= best.ink * 0.05);
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
  // JPEG colour subsampling turns the arrow's tail end and tip grey: a few columns just past the
  // orange whose bright pixels all sit in the arrow's own rows are still arrow, not a letter ("O₂ L →")
  if (ax1 >= ax0) {
    const lumAt = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
    const arrowRows = (x) => {
      let r0 = H, r1 = -1;
      for (let y = ty0; y <= ty1; y++) { const i = (y * W + x) * 4; if (isArrowPx(d[i], d[i + 1], d[i + 2])) { if (y < r0) r0 = y; r1 = y; } }
      return [r0, r1];
    };
    const onlyIn = (x, [r0, r1]) => {
      let n = 0;
      for (let y = ty0; y <= ty1; y++) if (lumAt(x, y) > 115) { if (y < r0 - 1 || y > r1 + 1) return false; n++; }
      return n > 0;
    };
    const left = arrowRows(ax0), right = arrowRows(ax1), reach = Math.max(2, Math.round((ty1 - ty0) * 0.12));
    for (let k = 0; k < reach && ax0 - 1 >= xA && onlyIn(ax0 - 1, left); k++) ax0--;
    for (let k = 0; k < reach && ax1 + 1 < xB && onlyIn(ax1 + 1, right); k++) ax1++;
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
  const normalized = (x0, x1, by0 = ty0, by1 = ty1, refCapH = 0) => {
    const w = Math.max(1, x1 - x0 + 1), h = by1 - by0 + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((by0 + y) * W + x0 + x) * 4;
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
      if (n >= 4) comps.push({ x0: cx0, x1: cx1, y0: cy0, y1: cy1, ids: new Set([id]) });
    }
    if (!comps.length) return null;
    // merge components that overlap horizontally (dots of i, etc.) into glyph clusters
    comps.sort((a, b) => a.x0 - b.x0);
    const clusters = [];
    for (const c of comps) {
      const last = clusters[clusters.length - 1];
      const ov = last ? Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0) : -1;
      const ovY = last ? Math.min(last.y1, c.y1) - Math.max(last.y0, c.y0) : 0;
      if (last && ov >= Math.min(c.x1 - c.x0, last.x1 - last.x0) * 0.5 && ovY < 0) {
        last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1);
        last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1);
        c.ids.forEach(i => last.ids.add(i));
      } else clusters.push({ ...c, ids: new Set(c.ids) });
    }
    const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
    const lines = () => {
      const maxH = Math.max(...clusters.map(c => c.y1 - c.y0 + 1));
      // cap line from the tallest glyphs only (x-height letters like "e" must not pull it down);
      // baseline from everything letter-sized
      const caps = clusters.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.88);
      const lettersized = clusters.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.6);
      const capTop = med(caps.map(c => c.y0));
      // baseline: bottom of letters that start at the cap line — the highest such bottom, because a
      // letter glued to its subscript ("l₂O") reaches below the baseline
      // ("+" also starts high but is shorter, it must not count)
      const capStart = clusters.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.75 && c.y0 - capTop <= (c.y1 - c.y0 + 1) * 0.25);
      let base = capStart.length ? Math.min(...capStart.map(c => c.y1)) : med(lettersized.map(c => c.y1));
      // a wrapped line can be a single glued blob ("H₂O"): take the letter height from the arrow line
      if (refCapH) base = Math.min(base, capTop + refCapH - 1);
      return { capTop, base, capH: Math.max(4, base - capTop + 1) };
    };
    // The bold font is kerned tightly: a subscript often touches the letters beside it ("e₂O" is one
    // blob). Cut such blobs at the columns where ink goes below the baseline — that's the subscript.
    {
      const { capTop, base, capH } = lines();
      let own = null; // component ids of the blob being cut (neighbours' ink in the same columns is ignored)
      // keep(x, y): which pixels of a shared column belong to this piece (see the split below)
      const on = (p, keep) => mask[p] && own.has(lab[p]) && (!keep || keep(p % w, (p / w) | 0));
      const topInk = (x, keep) => { for (let y = 0; y < h; y++) if (on(y * w + x, keep)) return y; return h; };
      const bbox = (x0, x1, keep) => {
        let y0 = h, y1 = -1, xa = w, xb = -1;
        for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) if (on(y * w + x, keep)) {
          if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < xa) xa = x; if (x > xb) xb = x;
        }
        return y1 < 0 || (y1 - y0 + 1) * (xb - xa + 1) < 6 ? null : { x0: xa, x1: xb, y0, y1, ids: own, keep };
      };
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k];
        if (c.y1 < base + capH * 0.15 || c.x1 - c.x0 + 1 < capH * 0.75) continue;
        own = c.ids;
        // column runs with ink below the baseline = subscripts ("₇H₁₆" has two, one each side of the H)
        const below = [];
        for (let x = c.x0; x <= c.x1; x++) {
          let any = false;
          for (let y = base + 2; y <= c.y1 && !any; y++) any = on(y * w + x);
          below.push(any);
        }
        let subRuns = [];
        for (let i = 0; i < below.length; i++) {
          if (!below[i]) continue;
          const last = subRuns[subRuns.length - 1];
          if (last && i - last[1] <= 2) last[1] = i; else subRuns.push([i, i]);
        }
        // a bracket also dips below the baseline but reaches the cap line: not a subscript
        const high = capTop + capH * 0.15, low = capTop + capH * 0.4;
        subRuns = subRuns.filter(([a, b]) => {
          let n = 0; for (let i = a; i <= b; i++) if (topInk(c.x0 + i) <= high) n++;
          return n / (b - a + 1) < 0.5;
        });
        // widen each run to the whole digit (the top bar of "₇" is wider than its foot): take
        // neighbouring columns whose ink is all in the lower part of the line
        for (const r of subRuns) {
          while (r[0] > 0 && topInk(c.x0 + r[0] - 1) >= low && topInk(c.x0 + r[0] - 1) < h) r[0]--;
          while (r[1] < below.length - 1 && topInk(c.x0 + r[1] + 1) >= low && topInk(c.x0 + r[1] + 1) < h) r[1]++;
        }
        // widening can make neighbouring runs overlap — both digits of "O₁₁" grow over each other —
        // and an overlap would cut the same subscript out twice ("1111"): merge them into one
        subRuns = subRuns.reduce((acc, r) => {
          const last = acc[acc.length - 1];
          if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else acc.push([r[0], r[1]]);
          return acc;
        }, []);
        // A subscript glued to the next letter shares its edge column with it: the bottom bar of "₂"
        // in "H₂O" runs into the left edge of the "O". Such a column's ink starts far above the
        // subscript's own top, so it's split by rows — below the baseline → subscript, the rest →
        // the letter. Otherwise the subscript's box reaches letter height and it isn't seen as one.
        const shared = new Map(); // column → first row that belongs to the subscript
        const pure = subRuns.map(([a, b]) => {
          const tops = [];
          for (let i = a; i <= b; i++) { const t = topInk(c.x0 + i); if (t < h) tops.push(t); }
          const top = tops.length ? med(tops) : h;
          const tallCol = (i) => topInk(c.x0 + i) < top - capH * 0.15;
          let sa = a, sb = b;
          while (sa < sb && tallCol(sa)) shared.set(c.x0 + sa++, base + 1);
          while (sb > sa && tallCol(sb)) shared.set(c.x0 + sb--, base + 1);
          return [sa, sb];
        });
        const subKeep = (x, y) => !shared.has(x) || y >= shared.get(x);
        const letterKeep = (x, y) => !shared.has(x) || y < shared.get(x);
        const cuts = [];
        let from = c.x0;
        subRuns.forEach(([a, b], n) => {
          const [sa, sb] = pure[n];
          if (c.x0 + sa > from) cuts.push([from, c.x0 + sa - 1, letterKeep]);
          cuts.push([c.x0 + a, c.x0 + b, subKeep]);
          from = c.x0 + sb + 1;
        });
        if (from <= c.x1) cuts.push([from, c.x1, letterKeep]);
        const parts = [];
        for (const [a, b, keep] of cuts) {
          let s0 = -1;
          for (let x = a; x <= b + 1; x++) {
            const ink = x <= b && topInk(x, keep) < h;
            if (ink && s0 < 0) s0 = x;
            if (!ink && s0 >= 0) { const bb = bbox(s0, x - 1, keep); if (bb) parts.push(bb); s0 = -1; }
          }
        }
        if (parts.length > 1) clusters.splice(k, 1, ...parts);
      }
    }
    const { capTop, base, capH } = lines();
    clusters.forEach(c => {
      const ch = c.y1 - c.y0 + 1;
      // lowered and short — or clearly hanging below the baseline (subscripts sit a bit higher on some lines)
      c.sub = ch < capH * 0.85 && (
        ((c.y0 - capTop) > capH * 0.42 && c.y1 >= base - capH * 0.08) ||
        ((c.y0 - capTop) > capH * 0.25 && c.y1 > base + capH * 0.1));
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
      // this glyph's own ink (a piece cut from a blob only keeps its side of a shared column)
      const mine = (x, y) => {
        const q = (c.y0 + y) * w + c.x0 + x;
        return mask[q] && c.ids.has(lab[q]) && (!c.keep || c.keep(c.x0 + x, c.y0 + y));
      };
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        const v = mine(x, y) ? 0 : 255, o = (y * cw + x) * 4;
        tmp.data[o] = tmp.data[o + 1] = tmp.data[o + 2] = v; tmp.data[o + 3] = 255;
      }
      const t2 = document.createElement('canvas'); t2.width = cw; t2.height = chh;
      t2.getContext('2d').putImageData(tmp, 0, 0);
      gctx.imageSmoothingQuality = 'high';
      gctx.drawImage(t2, PAD, PAD, cw * scale, chh * scale);
      const gapBefore = k ? c.x0 - clusters[k - 1].x1 - 1 : 0;
      // closed loops (background enclosed by the glyph): O has one, C none — OCR mixes up C / O / [ / (
      const countHoles = (isInk) => {
        const W2 = cw + 2, H2 = chh + 2, bg = new Uint8Array(W2 * H2);
        for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
          const inside = x > 0 && y > 0 && x <= cw && y <= chh;
          bg[y * W2 + x] = inside && isInk(x - 1, y - 1) ? 0 : 1;
        }
        let holes = 0;
        const seen = new Uint8Array(W2 * H2);
        for (let s0 = 0; s0 < W2 * H2; s0++) {
          if (!bg[s0] || seen[s0]) continue;
          let n = 0, edge = false; const st = [s0]; seen[s0] = 1;
          while (st.length) {
            const q = st.pop(), qx = q % W2, qy = (q / W2) | 0; n++;
            if (qx === 0 || qy === 0 || qx === W2 - 1 || qy === H2 - 1) edge = true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = qx + dx, ny = qy + dy;
              if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2) continue;
              const r2 = ny * W2 + nx;
              if (bg[r2] && !seen[r2]) { seen[r2] = 1; st.push(r2); }
            }
          }
          if (!edge && n >= Math.max(2, cw * chh * 0.02)) holes++;
        }
        return holes;
      };
      const holes = countHoles(mine);
      // the same with only solid ink: a small bold "3" has its arm tips almost touching the middle,
      // and the faint anti-aliased pixels between close both bays into "loops" — an "8" stays closed
      const lumAt = (x, y) => { const i = ((by0 + c.y0 + y) * W + x0 + c.x0 + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      const solidHoles = countHoles((x, y) => mine(x, y) && lumAt(x, y) > 170);
      return {
        holes,
        solidHoles,
        bracketTall: chh > capH * 1.08, // brackets reach above the capitals and below the baseline
        canvas: gc,
        box: [x0 + c.x0, by0 + c.y0, x0 + c.x1, by0 + c.y1],
        sub: c.sub,
        wide: c.sub ? cw > chh * 0.85 : cw > capH * 1.25, // two touching letters / a 2-digit subscript ("₁₆")
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
    return { canvas: out, subs: clusters.filter(c => c.sub).length, glyphs, capH };
  };

  const hasArrow = ax1 >= ax0;
  const leftX1 = Math.max(tx0, ax0 - 2), rightX0 = Math.min(tx1, ax1 + 2);
  const sideHasText = (x0, x1) => { for (let x = x0; x <= x1; x++) if (colText[x] > 0) return true; return false; };
  let leftN = hasArrow && ax0 - tx0 > 4 && sideHasText(tx0, leftX1) ? normalized(tx0, leftX1) : null;
  let rightN = hasArrow && tx1 - ax1 > 4 && sideHasText(rightX0, tx1) ? normalized(rightX0, tx1) : null;
  // wrapped lines: before the arrow line → left side, after it → right side
  for (const b of extraBands) {
    const p2 = Math.max(2, Math.round((b.y1 - b.y0) * 0.25));
    const by0 = Math.max(0, b.y0 - p2), by1 = Math.min(H - 1, b.y1 + p2);
    let bx0 = W, bx1 = -1;
    for (let y = by0; y <= by1; y++) for (let x = xA; x < xB; x++) {
      const i = (y * W + x) * 4;
      if (isTextPx(d[i], d[i + 1], d[i + 2])) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
    }
    if (bx1 < 0) continue;
    const ref = (leftN || rightN || {}).capH || 0;
    const n = normalized(Math.max(0, bx0 - 2), Math.min(W - 1, bx1 + 2), by0, by1, ref);
    if (!n || !n.glyphs.length) continue;
    n.glyphs[0].spaceBefore = true;
    // the arrow can end a line ("… + HCl →" / "CaCl₂ + …"): that side of the arrow line is empty
    if (b.y0 < best.y0) leftN = leftN ? { ...leftN, canvas: joinCanvases(n.canvas, leftN.canvas), glyphs: [...n.glyphs, ...leftN.glyphs], wrapped: true } : n;
    else rightN = rightN ? { ...rightN, canvas: joinCanvases(rightN.canvas, n.canvas), glyphs: [...rightN.glyphs, ...n.glyphs], wrapped: true } : n;
  }
  return {
    ok: true,
    hasArrow,
    whole: crop(tx0, tx1),
    left: hasArrow ? crop(tx0, leftX1) : null,
    right: hasArrow ? crop(rightX0, tx1) : null,
    leftN,
    rightN
  };
}

const WL = 'ABCDEFGHIKLMNOPRSTUVWXYZabcdefghiklmnoprstuy0123456789+()[]';
const MAIN_WL = 'ABCDEFGHIKLMNOPRSTUVWXYZabcdefghiklmnoprstuy+()[]';
// letters whose lowercase form only reaches x-height (so size tells upper from lower case)
const XHEIGHT = new Set('acemnorsuvwxz'.split(''));
const DIGIT_FIX = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9', T: '7' };
const LETTER_FIX = { 0: 'O', 1: 'l', 5: 'S', 8: 'B', 6: 'G', 2: 'Z' };

function smallCopy(src, sc, pad) {
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * sc) + 2 * pad; c.height = Math.round(src.height * sc) + 2 * pad;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, pad, pad, src.width * sc, src.height * sc);
  return c;
}

/** Split a black-on-white glyph canvas in two at the column with the least ink (middle 30–70%). */
function splitAtThinnest(src) {
  const W = src.width, H = src.height, d = src.getContext('2d').getImageData(0, 0, W, H).data;
  const col = new Array(W).fill(0);
  let x0 = W, x1 = -1;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) if (d[(y * W + x) * 4] < 128) col[x]++;
    if (col[x]) { if (x < x0) x0 = x; x1 = x; }
  }
  if (x1 - x0 < 8) return null;
  let cut = -1;
  for (let x = Math.round(x0 + (x1 - x0) * 0.3); x <= Math.round(x0 + (x1 - x0) * 0.7); x++) if (cut < 0 || col[x] < col[cut]) cut = x;
  const piece = (a, b) => {
    const pad = 18, c = document.createElement('canvas');
    c.width = b - a + 1 + 2 * pad; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, a, 0, b - a + 1, H, pad, 0, b - a + 1, H);
    return c;
  };
  return [piece(x0, cut), piece(cut + 1, x1)];
}

/** Closed loops of a black-on-white glyph canvas: [{ cy }] (cy = loop centre, 0 top … 1 bottom of the ink) */
export function loopsOf(canvas) {
  const W = canvas.width, H = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  let y0 = H, y1 = -1, x0 = W, x1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4] < 128) {
    ink[y * W + x] = 1; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x;
  }
  if (y1 < 0) return [];
  const seen = new Uint8Array(W * H), loops = [], minA = Math.max(4, (x1 - x0 + 1) * (y1 - y0 + 1) * 0.015);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (ink[s0] || seen[s0]) continue;
    const st = [s0]; seen[s0] = 1; let n = 0, sy = 0, edge = false;
    while (st.length) {
      const q = st.pop(), qx = q % W, qy = (q / W) | 0; n++; sy += qy;
      if (qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (!ink[r] && !seen[r]) { seen[r] = 1; st.push(r); }
      }
    }
    if (!edge && n >= minA) loops.push({ cy: (sy / n - y0) / Math.max(1, y1 - y0), area: n });
  }
  // a pinhole where a tiny digit's hook touches its body ("6" at 7 px) isn't a loop: 8's two loops are
  // about the same size, so drop loops much smaller than the biggest
  const big = Math.max(0, ...loops.map(l => l.area));
  return loops.filter(l => l.area >= big * 0.35);
}

// Loops each digit has: OCR of small bold subscripts swaps 6 → 3 / 8, 9 → 3 … the loops can't lie.
const DIGIT_LOOPS = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 0, 8: 2, 9: 1 };
// solidLoops (optional): loops counted with only solid ink. Loops that open up there are the bays
// of a "3" closed by anti-aliasing, not the counters of an "8" / "9" — then OCR's digit stands.
export function fixDigitByLoops(t, loops, solidLoops = null) {
  if (!/^[0-9]$/.test(t)) return t;
  const n = loops.length;
  if (n >= 2) return solidLoops === null || solidLoops >= 2 ? '8' : t;
  if (n === 1 && solidLoops === 0) return t; // the one "loop" is a bay closed by anti-aliasing
  if (n === 1) {
    const cy = loops[0].cy;
    if (t === '4' && cy < 0.62) return '4'; // 4's closed triangle (some fonts leave it open)
    if (cy > 0.55) return '6';
    if (cy < 0.42) return '9';
    return DIGIT_LOOPS[t] === 1 ? t : '0';
  }
  // no loop found: keep what OCR said (a blurry loop can close up, so this proves nothing)
  return t;
}

async function ocrGlyph(worker, g) {
  if (g.wide && g.sub) {
    // touching 2-digit subscript ("₁₆"): Tesseract reads one digit of the pair, so split it at the
    // thinnest column near the middle and read each digit on its own
    const halves = splitAtThinnest(g.canvas);
    if (halves) {
      let t = '';
      // (the pair's solid-loop count isn't either digit's own)
      for (const h of halves) t += (await ocrGlyph(worker, { ...g, canvas: h, wide: false, solidHoles: null })).replace(/[^0-9]/g, '');
      if (t.length === 2) return t;
    }
    await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '6', user_defined_dpi: '300' });
    const { data } = await worker.recognize(g.canvas);
    return String(data.text || '').replace(/[^0-9]/g, '');
  }
  if (g.wide) {
    await worker.setParameters({ tessedit_char_whitelist: g.sub ? '0123456789' : MAIN_WL, tessedit_pageseg_mode: '8', user_defined_dpi: '300' });
    const { data } = await worker.recognize(g.canvas);
    return String(data.text || '').replace(/\s+/g, '');
  }
  // Tesseract reads a lone bold letter best near its natural size (big crops of "O"/"e" came back
  // empty or as "[+]"), so try a small copy first, then the big one in several modes.
  // Subscript digits read better big (small "3" came back as "8").
  if (!g.sub) {
    const c = smallCopy(g.canvas, 0.35, 20);
    await worker.setParameters({ tessedit_char_whitelist: MAIN_WL + '0123456789', tessedit_pageseg_mode: '10', user_defined_dpi: '300' });
    const { data } = await worker.recognize(c);
    const t = String(data.text || '').replace(/\s+/g, '');
    if (t.length === 1) return t;
  }
  for (const psm of ['10', '8', '13', '7']) {
    await worker.setParameters({ tessedit_char_whitelist: g.sub ? '0123456789' : MAIN_WL + '0123456789', tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
    const { data } = await worker.recognize(g.canvas);
    const t = String(data.text || '').replace(/\s+/g, '');
    if (t) return g.sub ? fixDigitByLoops(t.slice(0, 1), loopsOf(g.canvas), g.solidHoles ?? null) : t.slice(0, 1);
  }
  return '';
}

/**
 * Glyph-by-glyph reading: subscripts are read as digits, main glyphs as letters/symbols, and
 * upper/lower case is decided from the glyph's height (OCR alone often confuses c/C, o/O, s/S).
 */
async function readSideByGlyphs(worker, glyphs) {
  // every glyph is its own read: run them side by side, each with its own OCR handle (its own
  // whitelist / page mode), then put the text together in order exactly as before
  const reads = await Promise.all(glyphs.map(async g => ocrGlyph(await ensureOCRWorker(), g)));
  let out = '';
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    let t = reads[i];
    if (!t) t = g.sub ? '' : '?';
    if (g.sub) {
      t = t.split('').map(ch => DIGIT_FIX[ch] || ch).join('').replace(/[^0-9]/g, '');
    } else if (!g.wide) {
      // a round glyph no taller than a capital: the loop decides C or O (never a bracket)
      if (/^[\[(COco0QD]$/.test(t) && !g.bracketTall && (t !== 'D' || !g.holes)) t = g.holes ? 'O' : 'C';
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
    const [l, r] = await Promise.all([readSideByGlyphs(worker, loc.leftN.glyphs), readSideByGlyphs(worker, loc.rightN.glyphs)]);
    const L = fixOcrFormulaSide(l), R = fixOcrFormulaSide(r);
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
