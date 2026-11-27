// Balance — screenshot reader.
// The arrow is drawn in the brass/orange accent colour, so we find it by colour, split the
// white equation text into a reactant half and a product half, and OCR each half.
// Subscripts are smaller and lower than the letters; Tesseract reads them as ordinary digits,
// which is exactly what the formula parser wants ("KNO₃" → "KNO3").

import { ensureOCRWorker } from '../search/searchOCR.js';
import { fixOcrFormulaSide, readsBalanced, repairEquation } from './balanceSolver.js';
import { glyphFeature, classifyGlyph } from './balanceGlyphs.js';

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

/**
 * Find the equation in a module picture and cut it into glyphs.
 * opts.exclude: a fixture's name whose glyph samples the shape matcher leaves out (to check the reader
 * on a picture it didn't learn from — scripts/check-balance.mjs).
 */
export function locateEquation(img, opts = {}) {
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
      // brackets reach above the capitals and below the baseline: measure from letters when there are
      // any (a cap line taken from "(" made "Cu(NO₃)₂"'s "u" look lowered — a subscript "11")
      const letterish = clusters.filter(c => c.x1 - c.x0 + 1 >= (c.y1 - c.y0 + 1) * 0.4);
      const pool = letterish.length ? letterish : clusters;
      const maxH = Math.max(...pool.map(c => c.y1 - c.y0 + 1));
      // cap line from the tallest glyphs only (x-height letters like "e" must not pull it down);
      // baseline from everything letter-sized
      const caps = pool.filter(c => c.y1 - c.y0 + 1 >= maxH * 0.88);
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
    // Bold letters also touch each other in small or blurred pictures ("Al", "i(", "CO" come out as
    // one blob, and OCR reads a blob as one letter: "A", "H"). Between two solid strokes, a column
    // with no solid ink (only soft edge pixels meet), or with a little solid ink only along the top
    // or bottom edge (two serifs touching: "(N"), is the gap between two letters. Inside a real
    // letter the thin parts sit mid-height (H's crossbar) or at both edges (the middle of O / C).
    // Two passes: gaps with no solid ink before the subscript cut (it needs the letters' real height:
    // "CO₂" glued whole looks taller than it is), serif joins after it (a subscript glued between
    // two letters can look like one).
    // Never between two strokes that both start at lowercase height: in a formula a lowercase letter
    // follows a capital, so two of them never touch. That join is inside one letter: the bowl of "u"
    // ("Cu", "Au") or the arch of "n" ("Mn", "Zn"), whose ink there is all along one edge.
    const splitTouching = (serifs) => {
      const { capTop, capH } = lines();
      // a stroke starting in this band is a lowercase letter's; lower down, a subscript's ("₂₂" touching
      // is still two digits to cut apart)
      const isLower = (top) => top > capTop + capH * 0.15 && top <= capTop + capH * 0.42;
      const SOLID = 170, strong = capH * 0.35;
      const lumOf = (x, y) => { const i = ((by0 + y) * W + x0 + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k];
        if (c.x1 - c.x0 + 1 < capH * 0.6 || c.y1 - c.y0 + 1 < capH * (serifs ? 0.75 : 0.6)) continue;
        const mine = (x, y) => mask[y * w + x] && c.ids.has(lab[y * w + x]) && (!c.keep || c.keep(x, y));
        const ch = c.y1 - c.y0 + 1, edge = Math.max(2, Math.round(ch * 0.25));
        const solid = [], gap = [];
        for (let x = c.x0; x <= c.x1; x++) {
          let n = 0, mid = false;
          for (let y = c.y0; y <= c.y1; y++) if (mine(x, y) && lumOf(x, y) > SOLID) {
            n++;
            if (y >= c.y0 + edge && y <= c.y1 - edge) mid = true;
          }
          let top = false, bot = false;
          for (let y = c.y0; y <= c.y1; y++) if (mine(x, y) && lumOf(x, y) > SOLID) { if (y < c.y0 + edge) top = true; else if (y > c.y1 - edge) bot = true; }
          solid.push(n);
          gap.push(n === 0 || (serifs && n <= capH * 0.2 && !mid && !(top && bot)));
        }
        const cuts = [];
        for (let i = 0; i < solid.length;) {
          if (!gap[i]) { i++; continue; }
          let j = i;
          while (j + 1 < solid.length && gap[j + 1]) j++;
          // where the solid ink of the columns next to the gap starts (their stroke's top)
          const strokeTop = (q0, q1) => {
            let t = Infinity;
            for (let q = Math.max(0, q0); q <= Math.min(solid.length - 1, q1); q++) {
              for (let y = c.y0; y <= c.y1; y++) if (mine(c.x0 + q, y) && lumOf(c.x0 + q, y) > SOLID) { t = Math.min(t, y); break; }
            }
            return t;
          };
          const insideLowercase = isLower(strokeTop(i - 3, i - 1)) && isLower(strokeTop(j + 1, j + 3));
          if (i > 0 && j < solid.length - 1 && !insideLowercase && Math.max(...solid.slice(0, i)) >= strong && Math.max(...solid.slice(j + 1)) >= strong) {
            // the emptiest column of the gap (the middle one of a tie)
            let best = i;
            for (let q = i; q <= j; q++) if (solid[q] < solid[best]) best = q;
            const ties = []; for (let q = i; q <= j; q++) if (solid[q] === solid[best]) ties.push(q);
            cuts.push(c.x0 + ties[ties.length >> 1]);
          }
          i = j + 1;
        }
        if (!cuts.length) continue;
        const parts = [];
        // the cut column itself (soft edge pixels only, or a serif's edge) belongs to neither side: given
        // to the left piece, the O's faint left edge in "₂O" made the "₂" as tall as a letter ("H₂O" → "HgO")
        [c.x0, ...cuts.map(x => x + 1)].forEach((a, n) => {
          const b = n < cuts.length ? cuts[n] - 1 : c.x1;
          const keep = (x, y) => x >= a && x <= b && (!c.keep || c.keep(x, y));
          let py0 = h, py1 = -1, px0 = w, px1 = -1;
          for (let y = c.y0; y <= c.y1; y++) for (let x = a; x <= b; x++) if (mine(x, y)) {
            if (y < py0) py0 = y; if (y > py1) py1 = y; if (x < px0) px0 = x; if (x > px1) px1 = x;
          }
          if (py1 >= 0) parts.push({ x0: px0, x1: px1, y0: py0, y1: py1, ids: c.ids, keep });
        });
        if (parts.length > 1) clusters.splice(k, 1, ...parts);
      }
    };
    splitTouching(false);
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
        // neighbouring columns whose ink is all in the lower part of the line. On the left, only
        // columns starting at the subscript's own top, or crossing two strokes of it (the diagonal and
        // the bar of "₄", which hang lower than its stem): a letter's foot glued to the subscript ("l"
        // of this font curls right into the "₂" of "Cl₂") is one stroke by the baseline, and taking
        // it made "₂" two digits wide ("42"). Without the "₄" rule its diagonal stayed on the H ("CH₁").
        const strokesIn = (x, from = 0) => { let n = 0, prev = false; for (let y = from; y < h; y++) { const v = on(y * w + x); if (v && !prev) n++; prev = v; } return n; };
        // A letter's serif can hang over the subscript's first columns (Aleo-like slabs: the H's foot
        // and arm over the diagonal of "₄" in "CH₄"): such a column starts at cap height, but below a
        // gap it has two strokes of the digit. That part is the digit's (split by rows, as below).
        const underSerif = new Map(); // column → first row of the digit's part
        const digitBelowGap = (x) => {
          let y = 0;
          while (y < h && !on(y * w + x)) y++;
          if (y >= low) return -1; // nothing above to share with
          while (y < h && on(y * w + x)) y++;
          while (y < h && !on(y * w + x)) y++;
          return y < h && y >= low && strokesIn(x, y) >= 2 ? y : -1;
        };
        for (const r of subRuns) {
          const tops = [];
          for (let i = r[0]; i <= r[1]; i++) { const t = topInk(c.x0 + i); if (t < h) tops.push(t); }
          const subTop = tops.length ? med(tops) : h;
          const lowCol = (x) => { const t = topInk(x); return t >= low && t < h; };
          // a diagonal ("₄" running down-left into the H's foot serif) goes on, its top a pixel or two
          // lower each column; the curled foot of "l" sits higher than the digit's edge beside it
          const leftCol = (x) => {
            if (lowCol(x)) {
              const t = topInk(x), step = t - topInk(x + 1);
              return t <= subTop + Math.max(1, capH * 0.12) || strokesIn(x) >= 2 || (step >= 0 && step <= 2 && underDiagonal);
            }
            const row = digitBelowGap(x);
            if (row < 0) return false;
            underSerif.set(x, row);
            return true;
          };
          let underDiagonal = false;
          while (r[0] > 0 && leftCol(c.x0 + r[0] - 1)) {
            r[0]--;
            // inside the digit's two-stroke part: what follows can be the end of its diagonal
            if (strokesIn(c.x0 + r[0]) >= 2) underDiagonal = true;
          }
          while (r[1] < below.length - 1 && lowCol(c.x0 + r[1] + 1)) r[1]++;
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
        for (const [x, row] of underSerif) shared.set(x, row);
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
    splitTouching(true);
    // a one-pixel-wide piece against a neighbour is edge pixels left over from a cut, not a
    // character (it read as "1": "O₂" → "O12")
    {
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k];
        if (c.x1 !== c.x0 || clusters.length < 2) continue;
        const near = clusters.some((o, j) => j !== k && Math.max(o.x0 - c.x1, c.x0 - o.x1) <= 1);
        if (near) clusters.splice(k, 1);
      }
    }
    // A speck of a neighbour's edge left over a glyph by a cut (a pixel or two of ")" over the "₄" of
    // "SO₄)") made it look tall — not a subscript — and dotted like an "i": drop it. (An i's dot is
    // bigger.) A sliver 2 px wide by a subscript is the same kind of leftover ("NH₄" → "NH14").
    {
      const { capTop, capH } = lines();
      for (const c of clusters) {
        const own = (x, y) => mask[y * w + x] && c.ids.has(lab[y * w + x]) && (!c.keep || c.keep(x, y));
        const rowInk = (y) => { let n = 0; for (let x = c.x0; x <= c.x1; x++) if (own(x, y)) n++; return n; };
        let n = 0, y = c.y0;
        while (y <= c.y1 && rowInk(y)) n += rowInk(y++);
        if (y > c.y1 || n > Math.max(3, (capH * 0.12) ** 2)) continue;
        while (y <= c.y1 && !rowInk(y)) y++;
        if (y <= c.y1) c.y0 = y;
      }
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k];
        if (clusters.length < 2 || c.x1 - c.x0 > 1 || c.y1 - c.y0 + 1 > capH * 0.3 || c.y0 < capTop + capH * 0.4) continue;
        if (clusters.some((o, j) => j !== k && Math.max(o.x0 - c.x1, c.x0 - o.x1) <= 1)) clusters.splice(k, 1);
      }
      // a short piece standing on the baseline (subscripts hang below it) right against a letter: that
      // letter's foot, cut off with the stroke it touched (slab "Li": the L's foot runs into the i) —
      // alone it read as a subscript "1" ("L1i"). Give it back.
      const { base } = lines();
      for (let k = clusters.length - 1; k >= 1; k--) {
        const c = clusters[k], o = clusters[k - 1];
        if (c.y1 - c.y0 + 1 > capH * 0.35 || c.y0 < capTop + capH * 0.55 || c.y1 > base + capH * 0.1) continue;
        if (c.x0 - o.x1 > 2 || o.y1 - o.y0 + 1 < capH * 0.6) continue; // (the cut column between is left out)
        const A = { ...o }, B = { ...c };
        const inA = (x, y) => x >= A.x0 && x <= A.x1 && A.ids.has(lab[y * w + x]) && (!A.keep || A.keep(x, y));
        const inB = (x, y) => x >= B.x0 && x <= B.x1 && B.ids.has(lab[y * w + x]) && (!B.keep || B.keep(x, y));
        o.ids = new Set([...A.ids, ...B.ids]);
        o.keep = (x, y) => inA(x, y) || inB(x, y);
        o.x1 = Math.max(A.x1, B.x1); o.y0 = Math.min(A.y0, B.y0); o.y1 = Math.max(A.y1, B.y1);
        clusters.splice(k, 1);
      }
    }
    // the dot of an "i" left on its own: its stem was glued to the letter before ("Li" in a slab font:
    // the L's foot runs into the i) and cut off there, so the dot no longer sat over a lone stem.
    // On its own it read as "[" / "l" ("Li" → "Ldl"). Put it back on the glyph under it.
    // Only a dot (about square) over a narrow stem standing on the baseline: a scrap of a letter's
    // arm cut off over a subscript is small and high too, and made "₄" an "i".
    {
      const { capTop, base, capH } = lines();
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k], cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
        if (cw > capH * 0.4 || chh > capH * 0.35 || c.y1 > capTop + capH * 0.4 || cw > chh * 2 || chh > cw * 2) continue;
        const mid = (c.x0 + c.x1) / 2;
        let best = -1;
        clusters.forEach((o, j) => {
          if (j === k || o.x0 - 2 > mid || o.x1 + 2 < mid || o.y0 <= c.y1 || o.y1 - o.y0 + 1 < capH * 0.45) return;
          if (o.x1 - o.x0 + 1 > capH * 0.65 || o.y0 > capTop + capH * 0.45 || Math.abs(o.y1 - base) > capH * 0.1) return;
          if (best < 0 || Math.abs((o.x0 + o.x1) / 2 - mid) < Math.abs((clusters[best].x0 + clusters[best].x1) / 2 - mid)) best = j;
        });
        if (best < 0) continue;
        const o = clusters[best], oIds = o.ids, oKeep = o.keep, dot = c;
        const inDot = (x, y) => x >= dot.x0 && x <= dot.x1 && y >= dot.y0 && y <= dot.y1 && dot.ids.has(lab[y * w + x]) && (!dot.keep || dot.keep(x, y));
        o.ids = new Set([...oIds, ...dot.ids]);
        o.keep = (x, y) => inDot(x, y) || (oIds.has(lab[y * w + x]) && (!oKeep || oKeep(x, y)));
        o.x0 = Math.min(o.x0, dot.x0); o.x1 = Math.max(o.x1, dot.x1); o.y0 = Math.min(o.y0, dot.y0);
        clusters.splice(k, 1);
      }
    }
    // lowered and short — or clearly hanging below the baseline (subscripts sit a bit higher on some lines)
    const subOf = (c, L) => {
      const ch = c.y1 - c.y0 + 1;
      return ch < L.capH * 0.85 && (
        ((c.y0 - L.capTop) > L.capH * 0.42 && c.y1 >= L.base - L.capH * 0.08) ||
        ((c.y0 - L.capTop) > L.capH * 0.25 && c.y1 > L.base + L.capH * 0.1));
    };
    // ── Repairs checked against real glyph samples (balanceGlyphs.js) ──
    // The cuts above are rules about columns of ink; in bigger, blurrier pictures they can cut one
    // letter in pieces (the "n" of "Sn(" came out as "1", a speck and "[") or leave a bracket's tail on
    // a subscript ("₃" + the foot of ")", which Tesseract read as nothing). A cut is kept or undone by
    // whether the pieces look like real glyphs.
    {
      const inkOf = (c) => (x, y) => { const q = y * w + x; return mask[q] && c.ids.has(lab[q]) && (!c.keep || c.keep(x, y)); };
      const featOf = (c, L) => {
        const ink = inkOf(c);
        return glyphFeature((x, y) => ink(c.x0 + x, c.y0 + y), c.x1 - c.x0 + 1, c.y1 - c.y0 + 1, { top: c.y0, capTop: L.capTop, base: L.base, capH: L.capH });
      };
      const judge = (c, L) => classifyGlyph(featOf(c, L), { sub: subOf(c, L), exclude: opts.exclude });
      // a glyph's ink between columns a and b, with its box shrunk to fit (null: hardly any ink)
      const piece = (c, a, b) => {
        const ink = inkOf(c);
        let px0 = w, px1 = -1, py0 = h, py1 = -1, n = 0;
        for (let y = c.y0; y <= c.y1; y++) for (let x = Math.max(a, c.x0); x <= Math.min(b, c.x1); x++) if (ink(x, y)) {
          n++; if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y;
        }
        if (n < 6) return null;
        const keep = (x, y) => x >= a && x <= b && (!c.keep || c.keep(x, y));
        return { x0: px0, x1: px1, y0: py0, y1: py1, ids: c.ids, keep };
      };
      const union = (parts) => {
        const ins = parts.map(inkOf);
        return {
          x0: Math.min(...parts.map(p => p.x0)), x1: Math.max(...parts.map(p => p.x1)),
          y0: Math.min(...parts.map(p => p.y0)), y1: Math.max(...parts.map(p => p.y1)),
          ids: new Set(parts.flatMap(p => [...p.ids])), keep: (x, y) => ins.some(f => f(x, y))
        };
      };
      const L = lines();
      // pieces of one letter: 2–3 touching main-line pieces, one of them unlike any glyph, that together
      // are clearly one letter
      for (let k = 0; k < clusters.length; k++) {
        for (const n of [3, 2]) {
          const parts = clusters.slice(k, k + n);
          if (parts.length < n || parts.some(p => subOf(p, L))) continue;
          if (parts.some((p, i) => i && p.x0 - parts[i - 1].x1 > 2)) continue;
          const pj = parts.map(p => judge(p, L));
          if (pj.every(j => j.sure)) continue;
          const u = union(parts);
          if (subOf(u, L)) continue;
          const uj = judge(u, L);
          // one clear winner, far better than any piece (pieces of "n": 0.29, −0.35, −0.02; together 0.77
          // with only two other "n" samples to compare): Tesseract still reads it if it isn't sure
          const clear = uj.sure || (uj.score >= 0.7 && uj.margin >= 0.2);
          if (!clear || uj.score < Math.max(...pj.map(j => j.score)) + 0.3) continue;
          clusters.splice(k, n, u);
          break;
        }
      }
      // a subscript that is unlike any digit: a neighbour's edge left on it (the foot of ")" cut off
      // with the "₃" before it), or two digits touching. Only from a side where another glyph touches
      // it, and only for a big jump in likeness: any glyph looks a little more like some digit with a
      // column or two shaved off, and taking those small gains made a lookalike font's "₈" a sure "3".
      for (let k = clusters.length - 1; k >= 0; k--) {
        const c = clusters[k];
        if (!subOf(c, L)) continue;
        const j0 = judge(c, L);
        if (j0.sure) continue;
        const gain = j0.score + 0.15;
        let best = { score: gain, parts: null };
        const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
        const touches = (o) => o && !subOf(o, L) && o.x0 - c.x1 <= 1 && c.x0 - o.x1 <= 1;
        const fromLeft = touches(clusters[k - 1]), fromRight = touches(clusters[k + 1]);
        for (let t = 1; t <= Math.floor(cw * 0.4); t++) {
          const sides = [];
          if (fromLeft) sides.push([c.x0 + t, c.x1]);
          if (fromRight) sides.push([c.x0, c.x1 - t]);
          for (const [a, b] of sides) {
            const p = piece(c, a, b);
            if (!p || !subOf(p, L)) continue;
            // what is shaved off is a neighbour's curl (the foot of ")": short) or edge (of the "O" in
            // "O₃": a sliver), never a whole digit standing there (the "₁" of "₁₆")
            const off = a > c.x0 ? piece(c, c.x0, a - 1) : piece(c, b + 1, c.x1);
            if (off && off.y1 - off.y0 + 1 > ch * 0.5 && off.x1 - off.x0 + 1 > ch * 0.2) continue;
            const j = judge(p, L);
            if (j.sure && j.score >= best.score) best = { score: j.score, parts: [p] };
          }
        }
        if (cw > ch * 0.85) {
          for (let x = c.x0 + Math.round(cw * 0.3); x <= c.x0 + Math.round(cw * 0.7); x++) {
            const p1 = piece(c, c.x0, x - 1), p2 = piece(c, x, c.x1);
            if (!p1 || !p2 || p1.x1 - p1.x0 + 1 < ch * 0.33 || p2.x1 - p2.x0 + 1 < ch * 0.33) continue;
            const j1 = judge(p1, L), j2 = judge(p2, L);
            const sc = Math.min(j1.score, j2.score);
            if (j1.sure && j2.sure && sc >= best.score) best = { score: sc, parts: [p1, p2] };
          }
        }
        if (best.parts) clusters.splice(k, 1, ...best.parts);
      }
    }
    const { capTop, base, capH } = lines();
    clusters.forEach(c => { c.sub = subOf(c, { capTop, base, capH }); });

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
      const rowHasInk = (y) => { for (let x = 0; x < cw; x++) if (mine(x, y)) return true; return false; };
      // a dot over a stem, an empty row between: "i" (OCR says "1" / "l" / "d", and "Li" became "Ll")
      let dotted = false;
      if (!c.sub && chh >= capH * 0.6 && c.y1 <= base + capH * 0.12) {
        let r = 0;
        while (r < chh && rowHasInk(r)) r++;
        if (r > 0 && r <= capH * 0.35) {
          let r2 = r;
          while (r2 < chh && !rowHasInk(r2)) r2++;
          dotted = r2 < chh && chh - r2 >= capH * 0.45;
        }
      }
      // a round letter glued to a full-height stem on its right, and no straight stem on its left:
      // "Cl" touching. The C's open side meets the l and closes a loop, so OCR read the pair as one
      // "C" — and the loop made it "O" ("HCl" → "HO", "PCl₅" → "PO₅", which balance)
      const longestRun = (x) => { let best = 0, run = 0; for (let y = 0; y < chh; y++) { if (mine(x, y)) best = Math.max(best, ++run); else run = 0; } return best; };
      const stemAt = (x) => longestRun(x) >= capH * 0.97;
      let leftStem = false, rightStem = false;
      for (let x = 0; x < cw; x++) {
        if (x < cw * 0.4 && stemAt(x)) leftStem = true;
        if (x >= cw * 0.65 && stemAt(x)) rightStem = true;
      }
      const roundStem = !c.sub && !dotted && cw > capH * 0.9 && cw <= capH * 1.6 && chh <= capH * 1.12 && rightStem && !leftStem;
      // its shape, for matching against glyphs cut from real game pictures (balanceGlyphs.js)
      const feat = glyphFeature(mine, cw, chh, { top: c.y0, capTop, base, capH });
      return {
        feat,
        shape: (() => {
          const m = classifyGlyph(feat, { sub: c.sub, exclude: opts.exclude });
          // a digit can't have more closed loops of solid ink than its shape has ("8" is never a "3")
          if (m.sure && c.sub && solidHoles > (DIGIT_LOOPS[m.ch] ?? 9)) return { ...m, sure: false };
          return m;
        })(),
        dotted,
        roundStem,
        onBase: c.y1 >= base - capH * 0.08,     // sits on the baseline ("r"), unlike a raised "+"
        xTop: c.y0 - capTop < capH * 0.4,       // starts by x-height (g / p), not lower like a subscript
        holes,
        solidHoles,
        bracketTall: chh > capH * 1.08, // brackets reach above the capitals and below the baseline
        canvas: gc,
        box: [x0 + c.x0, by0 + c.y0, x0 + c.x1, by0 + c.y1],
        sub: c.sub,
        wide: c.sub ? cw > chh * 0.85 : cw > capH * 1.25, // two touching letters / a 2-digit subscript ("₁₆")
        tall: (c.y0 - capTop) < capH * 0.18,    // reaches cap height (uppercase / ascender)
        desc: c.y1 > base + capH * 0.15,         // hangs below the baseline (p, q, y, g)
        narrow: cw < capH * 0.45,                // a single upright stroke (l, I, i, brackets)
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
  // Both sides sit on one line, so they share one letter height. A side whose only tall glyph is a
  // letter glued to its subscript ("CO₂ +" before a wrap) takes the subscript's bottom for the
  // baseline: its letters then look taller than they are and the subscript isn't cut off ("CO").
  // The smaller height is the true one.
  if (leftN && rightN && Math.abs(leftN.capH - rightN.capH) > Math.min(leftN.capH, rightN.capH) * 0.1) {
    const ref = Math.min(leftN.capH, rightN.capH);
    if (leftN.capH > ref) leftN = normalized(tx0, leftX1, ty0, ty1, ref) || leftN;
    else rightN = normalized(rightX0, tx1, ty0, ty1, ref) || rightN;
  }
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
const LETTER_FIX = { 0: 'O', 1: 'l', 5: 'S', 8: 'B', 6: 'G', 2: 'Z', 9: 'g', 4: 'A' };

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
  // a closed loop across the cut is inside one digit (the triangle of a wide "₄" — split, it read "41")
  {
    const bg = new Uint8Array(W * H), st = [];
    const ink = (q) => d[q * 4] < 128;
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const q = y * W + x; if (!ink(q) && !bg[q]) { bg[q] = 1; st.push(q); } }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const q = y * W + x; if (!ink(q) && !bg[q]) { bg[q] = 1; st.push(q); } }
    while (st.length) { // the outside
      const q = st.pop(), qx = q % W, qy = (q / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (!ink(r) && !bg[r]) { bg[r] = 1; st.push(r); }
      }
    }
    const minA = Math.max(4, (x1 - x0 + 1) * H * 0.01);
    for (let q = 0; q < W * H; q++) {
      if (ink(q) || bg[q]) continue;
      let lx0 = W, lx1 = -1, n = 0;
      bg[q] = 2; st.push(q);
      while (st.length) {
        const p = st.pop(), px = p % W, py = (p / W) | 0; n++;
        if (px < lx0) lx0 = px; if (px > lx1) lx1 = px;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const r = ny * W + nx;
          if (!ink(r) && !bg[r]) { bg[r] = 2; st.push(r); }
        }
      }
      if (n >= minA && lx0 < cut && lx1 > cut) return 'one';
    }
  }
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
  // two loops of solid ink are an 8 even when the soft edges fill one in (a small "₈" read as 6)
  if (solidLoops != null && solidLoops >= 2) return '8';
  const n = loops.length;
  if (n >= 2) return solidLoops === null || solidLoops >= 2 ? '8' : t;
  // an "8" whose only loop is closed by soft edge pixels has no loop of its own: a "3" (a letter's
  // foot glued to the "₃" of "Cl₃" closed one bay, and OCR said 8)
  if (t === '8' && n === 1 && solidLoops === 0) return '3';
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

export async function ocrGlyph(worker, g) { // (exported for the browser checks)
  if (g.wide && g.sub) {
    // touching 2-digit subscript ("₁₆"): Tesseract reads one digit of the pair, so split it at the
    // thinnest column near the middle and read each digit on its own
    const halves = splitAtThinnest(g.canvas);
    if (halves === 'one') return ocrGlyph(worker, { ...g, wide: false });
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
  if (g.wide || g.roundStem) {
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
export async function readSideByGlyphs(worker, glyphs) { // (exported for the browser checks)
  // every glyph is its own read: run them side by side, each with its own OCR handle (its own
  // whitelist / page mode), then put the text together in order exactly as before
  // a glyph that clearly matches a real sample (balanceGlyphs.js) is that character: Tesseract is only
  // asked about the rest (characters with no sample yet, or glyphs cut oddly)
  const sure = (g) => g.shape && g.shape.sure;
  const reads = await Promise.all(glyphs.map(async g => (sure(g) ? g.shape.ch : ocrGlyph(await ensureOCRWorker(), g))));
  let out = '';
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    let t = reads[i];
    if (sure(g)) {
      if (t === '+') t = ' + ';
    } else if (g.sub) {
      // a subscript OCR couldn't read stays a "?" for repairEquation to fill (dropped otherwise)
      t = t.split('').map(ch => DIGIT_FIX[ch] || ch).join('').replace(/[^0-9]/g, '') || '?';
    } else if (g.roundStem) {
      // "Cl" glued into one glyph (OCR may still tell a "Cd")
      t = /^C[ld]$/.test(t) ? t : 'Cl';
    } else if (g.dotted && !g.wide) {
      t = 'i'; // no other letter of an element symbol has a dot
    } else if (!t) {
      t = '?';
    } else if (!g.wide) {
      // a narrow upright stroke no taller than a capital is an "l" (read as "[" / "|" after a split: "Al(")
      if (/^[\[(|1I]$/.test(t) && g.narrow && !g.bracketTall && !g.holes) t = 'l';
      // a round glyph no taller than a capital: the loop decides C or O (never a bracket)
      else if (/^[\[(COco0QD]$/.test(t) && !g.bracketTall && (t !== 'D' || !g.holes)) t = g.holes ? 'O' : 'C';
      // an upright stroke only x-height tall, standing on the baseline, is an "r" (Cr / Br / Sr read as "CI")
      if (/^[lI1|\[]$/.test(t) && !g.tall && !g.desc && g.onBase) t = 'r';
      // hanging below the baseline without reaching the cap line: "g" (Mg / Ag / Hg read as "9" / "8" / "s")
      if (g.desc && !g.tall && g.xTop && /^[0-9sSBbq]$/.test(t)) t = 'g';
      if (/[0-9]/.test(t)) t = LETTER_FIX[t] || t;
      if (/[A-Za-z]/.test(t) && XHEIGHT.has(t.toLowerCase())) t = g.tall ? t.toUpperCase() : t.toLowerCase();
      // p / q / y / g hang below the line; full height without that is the capital ("P" read as "p")
      if (/^[pqyg]$/.test(t) && g.tall && !g.desc) t = t.toUpperCase();
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
export async function readEquationImage(img, onStatus = () => {}, opts = {}) {
  const loc = locateEquation(img, opts);
  if (!loc.ok) return loc;
  // Tesseract only starts when a glyph needs it: when every glyph matches a real sample
  // (balanceGlyphs.js) the equation is read without it, and without waiting for it to load
  let tess = null;
  const worker = {
    setParameters: async (p) => (tess || (onStatus('Starting OCR engine…'), tess = await ensureOCRWorker())).setParameters(p),
    recognize: async (c, o) => (tess || (tess = await ensureOCRWorker())).recognize(c, o)
  };
  onStatus('Reading the equation…');

  // A reading that lost a subscript often still balances ("CH₄ + O₂" read as "CH4 + O" does), so
  // a reading must keep every subscript the glyph reader saw: per side, at least as many numbers
  // after a letter / bracket as runs of subscript glyphs.
  const subRuns = (n) => (n ? n.glyphs.filter((g, i) => g.sub && !(i && n.glyphs[i - 1].sub)).length : 0);
  const numbers = (side) => (String(side || '').match(/[A-Za-z)\]][0-9?]+/g) || []).length;
  const keepsSubs = (eq) => {
    if (!loc.leftN || !loc.rightN) return true;
    const [l, r] = eq.split('→');
    return numbers(l) >= subRuns(loc.leftN) && numbers(r) >= subRuns(loc.rightN);
  };
  const accept = (c) => readsBalanced(c) && keepsSubs(c);
  const candidates = [];
  const lefts = [], rights = []; // each reading's sides, for repairEquation (most trusted first)
  if (loc.hasArrow && loc.leftN && loc.rightN) {
    // Most reliable: glyph by glyph
    const [l, r] = await Promise.all([readSideByGlyphs(worker, loc.leftN.glyphs), readSideByGlyphs(worker, loc.rightN.glyphs)]);
    lefts.push(fixOcrFormulaSide(l, { keepUnknown: true })); rights.push(fixOcrFormulaSide(r, { keepUnknown: true }));
    const L = fixOcrFormulaSide(l), R = fixOcrFormulaSide(r);
    if (L && R) candidates.push(`${L} → ${R}`);
  }
  if (loc.hasArrow && loc.leftN && loc.rightN && !candidates.some(c => accept(c))) {
    // Preferred: subscripts enlarged onto the baseline
    for (const psm of ['7', '8']) {
      const L = fixOcrFormulaSide(await ocr(worker, loc.leftN.canvas, psm));
      const R = fixOcrFormulaSide(await ocr(worker, loc.rightN.canvas, psm));
      lefts.push(L); rights.push(R);
      if (L && R) candidates.push(`${L} → ${R}`);
      if (accept(`${L} → ${R}`)) break;
    }
  }
  if (loc.hasArrow && !candidates.some(c => accept(c))) {
    for (const psm of ['7', '6']) {
      const L = fixOcrFormulaSide(await ocr(worker, loc.left, psm));
      const R = fixOcrFormulaSide(await ocr(worker, loc.right, psm));
      lefts.push(L); rights.push(R);
      if (L && R) candidates.push(`${L} → ${R}`);
      const eq = candidates[candidates.length - 1];
      if (eq && accept(eq)) break;
    }
  }
  // Nothing balances: the readings' sides with a character or two swapped for what OCR confuses it
  // with ("NaSPO4" → "Na3PO4", an unread "₃"), picking the version that balances with fewest changes
  let repaired = 0;
  if (!candidates.some(c => accept(c))) {
    const fixed = repairEquation(lefts, rights, 2, keepsSubs);
    if (fixed) { candidates.unshift(fixed.equation); repaired = fixed.edits; }
  }
  if (!candidates.some(c => accept(c))) {
    // No coloured arrow found, or the halves didn't parse: read the whole line
    const whole = await ocr(worker, loc.whole, '7');
    candidates.push(whole.replace(/\s*[-—–=]+\s*/, ' → '));
  }
  const good = candidates.find(c => accept(c));
  // nothing passed, but a reading balances: show it, flagged — a subscript is likely missing
  const doubtful = !good && candidates.find(c => readsBalanced(c));
  return { ok: true, equation: good || doubtful || candidates[0] || '', parsed: !!good, doubtful: !!doubtful, repaired: good && good === candidates[0] ? repaired : 0, raw: candidates, debug: loc };
}
