// Balance letters by shape: each glyph the reader cuts out is compared with glyphs cut from real game
// pictures (balanceGlyphBank.js), like Word Search's letters. The game always draws the equation in
// one font, so for the characters we have samples of this is far more reliable than Tesseract, which
// read a clean "Z" as "4" and a clean "₃" as nothing (2026-11-27). Characters with no sample yet still
// go to Tesseract (balanceVision.js ocrGlyph).
import { BALANCE_GLYPH_BANK } from './balanceGlyphBank.js';

export const BG_N = 12; // shape grid size

/**
 * Shape and place of one glyph.
 * ink(x, y): is (x, y) — 0 ≤ x < w, 0 ≤ y < h, inside the glyph's box — this glyph's ink.
 * line: { top, capTop, base, capH } — the glyph box's top row and the line's cap line / baseline, in
 * the same pixels, so the glyph's height and height on the line are known (c / C, o / O, + / t …).
 * @returns {{ v: Float32Array, aspect: number, relH: number, relTop: number, relBot: number } | null}
 */
export function glyphFeature(ink, w, h, line) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const v = new Float32Array(BG_N * BG_N);
  for (let gy = 0; gy < BG_N; gy++) for (let gx = 0; gx < BG_N; gx++) {
    const sx0 = x0 + gx * bw / BG_N, sx1 = x0 + (gx + 1) * bw / BG_N;
    const sy0 = y0 + gy * bh / BG_N, sy1 = y0 + (gy + 1) * bh / BG_N;
    let sum = 0, n = 0;
    // area sampling: each source pixel weighted by how much of it falls in this cell
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
      const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
      for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
        const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
        if (wx <= 0 || wy <= 0) continue;
        if (ink(x, y)) sum += wx * wy;
        n += wx * wy;
      }
    }
    v[gy * BG_N + gx] = n ? sum / n : 0;
  }
  const { top = 0, capTop = 0, base = h, capH = h } = line || {};
  return {
    v,
    aspect: bw / bh,
    relH: bh / capH,
    relTop: (top + y0 - capTop) / capH,
    relBot: (top + y1 - base) / capH
  };
}

function corr(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * Similarity of a glyph to one sample: shape correlation, minus penalties for a different width /
 * height ratio and, for main-line glyphs, a different height or place on the line (that is what tells
 * "c" from "C", "o" from "O", "+" from "t"). A subscript's place varies from line to line: shape only.
 */
export function glyphScore(f, t) {
  let s = corr(f.v, t.v) - 0.5 * Math.abs(Math.log(f.aspect / t.aspect));
  if (!t.sub) s -= 0.8 * Math.abs(f.relH - t.relH) + 0.8 * Math.abs(f.relTop - t.relTop);
  return s;
}

export function decodeBank(bank) {
  return bank.map(([ch, sub, aspect, relH, relTop, relBot, v, src]) => ({
    ch, sub: !!sub, aspect, relH, relTop, relBot, src,
    v: Float32Array.from(v, c => Number(c) / 9)
  }));
}

export const BALANCE_GLYPHS = decodeBank(BALANCE_GLYPH_BANK);

/**
 * Best character for a glyph: subscripts only against digit samples, main-line glyphs against letters,
 * brackets and "+". `sure` = close to a sample and clearly ahead of every other character — then it is
 * used without asking Tesseract. `exclude` (a picture's name) leaves that picture's own samples out,
 * for checking the reader on a picture it didn't learn from.
 * @returns {{ ch: string, score: number, margin: number, sure: boolean, second: string }}
 */
export function classifyGlyph(f, { sub = false, exclude = null, bank = BALANCE_GLYPHS } = {}) {
  const none = { ch: '', score: -1, margin: 0, sure: false, second: '' };
  if (!f || exclude === '*') return none; // '*': no samples at all (the reader as it was before them)
  const best = new Map(); // character → its best sample's score
  for (const t of bank) {
    if (t.sub !== sub || (exclude && t.src === exclude)) continue;
    const s = glyphScore(f, t);
    if (!best.has(t.ch) || s > best.get(t.ch)) best.set(t.ch, s);
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return none;
  const [ch, score] = ranked[0];
  const [second, s2] = ranked[1] || ['', -1];
  const margin = score - s2;
  const sure = score >= SURE_SCORE && margin >= SURE_MARGIN;
  return { ch, score, margin, sure, second };
}

// tuned on the 18 real pictures, each read with its own samples left out (2026-11-27)
export const SURE_SCORE = 0.8;
export const SURE_MARGIN = 0.08;
