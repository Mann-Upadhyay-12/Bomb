// Hangman screenshot reader: how many blanks, which ones show a letter (and that letter's shape),
// and how much of the stick figure is drawn. The letters are not read like text: the app knows which
// letter was just guessed, so the newly filled blanks are where that letter is. Shapes are kept so a
// letter seen once is recognised by its shape after that.
//
// Picture: blanks are dark slate boxes (43,48,56) with a dim grey underscore; a revealed letter is
// bright (green 72,255,106); the stick figure is white; the gallows is brown.

export const GLYPH_W = 12, GLYPH_H = 16;

const isSlot = (r, g, b) => Math.abs(r - 43) <= 4 && Math.abs(g - 48) <= 4 && Math.abs(b - 56) <= 4;
const isInk = (r, g, b) => Math.max(r, g, b) > 130;     // the underscore peaks around 87
const isFigure = (r, g, b) => Math.min(r, g, b) > 200; // white stick figure

/** Runs of `true` → [[start, end)] at least minLen long. */
function runs(on, minLen) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= on.length; i++) {
    const v = i < on.length && on[i];
    if (v && s < 0) s = i;
    if (!v && s >= 0) { if (i - s >= minLen) out.push([s, i]); s = -1; }
  }
  return out;
}

/** Ink inside a box → a GLYPH_W×GLYPH_H coverage grid, centred, padded to that 3:4 shape. */
function glyphOf(data, W, x0, y0, x1, y1) {
  let gx0 = x1, gx1 = x0 - 1, gy0 = y1, gy1 = y0 - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4;
      if (isInk(data[p], data[p + 1], data[p + 2])) {
        if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
      }
    }
  }
  if (gx1 < gx0) return null;
  let w = gx1 - gx0 + 1, h = gy1 - gy0 + 1;
  // pad to 3:4 so a narrow I is not stretched into a block
  const cx = (gx0 + gx1 + 1) / 2, cy = (gy0 + gy1 + 1) / 2;
  if (w / h < GLYPH_W / GLYPH_H) w = h * GLYPH_W / GLYPH_H; else h = w * GLYPH_H / GLYPH_W;
  const out = new Float32Array(GLYPH_W * GLYPH_H);
  const S = 3; // 3×3 samples per cell
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = Math.floor(cx - w / 2 + (gx + (sx + 0.5) / S) * w / GLYPH_W);
          const y = Math.floor(cy - h / 2 + (gy + (sy + 0.5) / S) * h / GLYPH_H);
          if (x < x0 || y < y0 || x >= x1 || y >= y1) continue;
          const p = (y * W + x) * 4;
          if (isInk(data[p], data[p + 1], data[p + 2])) n++;
        }
      }
      out[gy * GLYPH_W + gx] = n / (S * S);
    }
  }
  return out;
}

/** Shape similarity of two glyphs (correlation, −1…1). */
export function glyphScore(a, b) {
  if (!a || !b) return -1;
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    d += x * y; na += x * x; nb += y * y;
  }
  return d / Math.sqrt(na * nb + 1e-9);
}

export const encodeGlyph = g => Array.from(g, v => Math.round(v * 9)).join('');
export const decodeGlyph = s => Float32Array.from(String(s), c => Number(c) / 9);

// Letter shapes seen in real screenshots (more are learned while playing and kept in the browser)
export const SEED_GLYPHS = {
  // 2026-11-22 screenshot, T in the 3rd of 9 blanks
  T: '133333333331799999999993999999999999953599995359000399993000000399993000000399993000000399993000000399993000000399993000000399993000000399993000000399993000000399971000000288600000000022000000'
};

/**
 * Read a Hangman screenshot.
 * → { ok, reason?, length, slots: [{ x0, x1, filled, glyph }], figure: { ink, headOnly } }
 */
export function readHangman(data, W, H) {
  const ix0 = Math.round(W * 0.08), ix1 = Math.round(W * 0.92);
  // the row of blanks: lower part of the picture, slot colour over ≥30% of the inner width
  let by0 = -1, by1 = -1;
  for (let y = Math.round(H * 0.55); y < Math.round(H * 0.95); y++) {
    let n = 0;
    for (let x = ix0; x < ix1; x++) {
      const p = (y * W + x) * 4;
      if (isSlot(data[p], data[p + 1], data[p + 2])) n++;
    }
    if (n > (ix1 - ix0) * 0.3) { if (by0 < 0) by0 = y; by1 = y; } else if (by0 >= 0 && y - by1 > 3) break;
  }
  if (by0 < 0) return { ok: false, reason: 'could not find the blanks' };
  const bh = by1 - by0 + 1;
  const col = new Array(W).fill(false);
  for (let x = ix0; x < ix1; x++) {
    let n = 0;
    for (let y = by0; y <= by1; y++) {
      const p = (y * W + x) * 4;
      if (isSlot(data[p], data[p + 1], data[p + 2])) n++;
    }
    col[x] = n > bh * 0.2;
  }
  const spans = runs(col, Math.max(6, Math.round(W * 0.03)));
  if (spans.length < 3) return { ok: false, reason: 'could not find the blanks' };

  const slots = spans.map(([x0, x1]) => {
    let ink = 0;
    for (let y = by0; y <= by1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        if (isInk(data[p], data[p + 1], data[p + 2])) ink++;
      }
    }
    const filled = ink > (x1 - x0) * bh * 0.04;
    return { x0, x1, filled, glyph: filled ? glyphOf(data, W, x0, by0, x1, by1 + 1) : null };
  });

  // stick figure: white ink between the title and the blanks
  let ink = 0, fx0 = W, fx1 = -1, fy0 = H, fy1 = -1;
  for (let y = Math.round(H * 0.15); y < by0 - 2; y++) {
    for (let x = ix0; x < ix1; x++) {
      const p = (y * W + x) * 4;
      if (isFigure(data[p], data[p + 1], data[p + 2])) {
        ink++;
        if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
      }
    }
  }
  const scale = (W * H) / (440 * 440);
  const figure = {
    ink: Math.round(ink / scale), // in 440×440 pixels, so pictures of other sizes compare
    headOnly: ink > 0 && (fy1 - fy0 + 1) <= (fx1 - fx0 + 1) * 1.25
  };
  return { ok: true, length: slots.length, slots, figure };
}
