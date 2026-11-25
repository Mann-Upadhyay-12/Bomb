// Shape matching for small printed glyphs (card ranks, legend digits): a glyph's ink is cut to its
// bounding box, padded to 3:4 and sampled into a 12×16 coverage grid; two grids are compared by
// correlation. Grids are stored as strings of 0–9.

export const GW = 12, GH = 16;

/** Ink inside a box → GW×GH coverage grid, centred and padded to 3:4 (a wide "10" stays wide). */
export function inkGlyph(data, W, x0, y0, x1, y1, ink) {
  let gx0 = x1, gx1 = x0 - 1, gy0 = y1, gy1 = y0 - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4;
      if (ink(data[p], data[p + 1], data[p + 2])) {
        if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
      }
    }
  }
  if (gx1 < gx0) return null;
  let w = gx1 - gx0 + 1, h = gy1 - gy0 + 1;
  const aspect = w / h;
  const cx = (gx0 + gx1 + 1) / 2, cy = (gy0 + gy1 + 1) / 2;
  if (w / h < GW / GH) w = h * GW / GH; else h = w * GH / GW;
  const out = new Float32Array(GW * GH);
  const S = 3;
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = Math.floor(cx - w / 2 + (gx + (sx + 0.5) / S) * w / GW);
          const y = Math.floor(cy - h / 2 + (gy + (sy + 0.5) / S) * h / GH);
          if (x < gx0 || y < gy0 || x > gx1 || y > gy1) continue;
          const p = (y * W + x) * 4;
          if (ink(data[p], data[p + 1], data[p + 2])) n++;
        }
      }
      out[gy * GW + gx] = n / (S * S);
    }
  }
  return { v: out, aspect };
}

export function shapeScore(a, b) {
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

export const encodeShape = g => Array.from(g, v => Math.round(v * 9)).join('');
export const decodeShape = s => Float32Array.from(String(s), c => Number(c) / 9);

/** Score of a glyph against a reference: shape correlation, less a penalty for a different width/height. */
export const glyphScore = (glyph, ref) => shapeScore(glyph.v, ref.v) - 0.5 * Math.abs(Math.log(glyph.aspect / ref.aspect));
