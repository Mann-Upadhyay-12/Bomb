// The colour legend picture (colour → ohms): coloured chips on a dark page, each with the colour's
// name on the left and its value + "Ω" on the right. The values change from game to game, so they
// are read from the picture: chip colour → name, digits matched by shape.

import { components, classifyColor } from './circuitVision.js';
import { inkGlyph, encodeShape, decodeShape, glyphScore } from '../../utils/glyph.js';
import { DIGIT_REFS } from './circuitDigits.js';

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const dist2 = (data, i, c) => (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;

/** Most common colour in a box (5-bit buckets) → [r, g, b]. */
function modeColour(data, W, x0, y0, x1, y1) {
  const hist = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      const k = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  let bestK = 0, bestN = -1;
  hist.forEach((n, k) => { if (n > bestN) { bestN = n; bestK = k; } });
  // average the real pixels in that bucket
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3)) !== bestK) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

let refCache = null;
const builtIn = () => (refCache = refCache || DIGIT_REFS.map(r => ({ ch: r.ch, aspect: r.aspect, v: decodeShape(r.fp) })));

/** Best character ('0'–'9' or 'Ω') for a glyph. learned: { ch: [{ aspect, fp }] }. */
export function classifyDigit(glyph, learned = {}) {
  const refs = builtIn().concat(Object.entries(learned).flatMap(([ch, list]) => list.map(r => ({ ch, aspect: r.aspect, v: decodeShape(r.fp) }))));
  const best = {};
  for (const r of refs) {
    const s = glyphScore(glyph, r);
    if (!(r.ch in best) || s > best[r.ch]) best[r.ch] = s;
  }
  const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { ch: null, score: 0, margin: 0, second: null };
  return { ch: ranked[0][0], score: ranked[0][1], margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : 1, second: ranked[1] ? ranked[1][0] : null };
}

/** Split a glyph box that is too wide for one digit (two digits touching) at its thinnest columns. */
function splitWide(c, inkAt) {
  const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
  const parts = Math.round(w / (h * 0.62));
  if (parts < 2) return [c];
  const col = [];
  for (let x = c.x0; x <= c.x1; x++) {
    let n = 0;
    for (let y = c.y0; y <= c.y1; y++) if (inkAt(x, y)) n++;
    col.push(n);
  }
  const cuts = [];
  for (let k = 1; k < parts; k++) {
    const mid = Math.round((w * k) / parts), lo = Math.max(1, mid - Math.round(h * 0.2)), hi = Math.min(w - 2, mid + Math.round(h * 0.2));
    let at = mid;
    for (let x = lo; x <= hi; x++) if (col[x] < col[at]) at = x;
    cuts.push(c.x0 + at);
  }
  const edges = [c.x0, ...cuts, c.x1 + 1];
  return edges.slice(0, -1).map((x0, k) => ({ ...c, x0, x1: edges[k + 1] - 1, split: true }));
}

/**
 * Read a legend picture.
 * → { ok, reason?, chips: [{ box, rgb, color, value, glyphs: [{ box, glyph, ch, score, margin }], sure }] }
 *   value: the number read (string) or null; sure: every digit read with a clear margin.
 */
export function readLegend(data, W, H, learned = {}) {
  // the page colour: the most common colour along the picture's edge
  const edge = new Map();
  const addEdge = (x, y) => { const i = (y * W + x) * 4; const k = `${data[i] >> 2},${data[i + 1] >> 2},${data[i + 2] >> 2}`; edge.set(k, (edge.get(k) || 0) + 1); };
  for (let x = 0; x < W; x++) { addEdge(x, 0); addEdge(x, H - 1); }
  for (let y = 0; y < H; y++) { addEdge(0, y); addEdge(W - 1, y); }
  const page = [...edge.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => Number(v) * 4 + 2);

  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (dist2(data, p * 4, page) > 1600) mask[p] = 1;
  const { comps } = components(mask, W, H, false);
  const boxes = comps.filter(c => {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    return c.n >= W * H * 0.01 && bw / bh >= 1.4 && bw / bh <= 6 && c.n >= bw * bh * 0.6;
  });
  if (boxes.length < 2) return { ok: false, reason: 'no colour chips found', chips: [] };

  // rows top to bottom, then left to right
  const rowH = Math.min(...boxes.map(b => b.y1 - b.y0 + 1)) * 0.5;
  boxes.sort((a, b) => (Math.abs(a.cy - b.cy) < rowH ? a.x0 - b.x0 : a.cy - b.cy));

  const chips = boxes.map(b => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const ix0 = b.x0 + Math.round(bw * 0.05), ix1 = b.x1 - Math.round(bw * 0.05);
    const iy0 = b.y0 + Math.round(bh * 0.1), iy1 = b.y1 - Math.round(bh * 0.1);
    const rgb = modeColour(data, W, ix0, iy0, ix1, iy1);
    const fillL = lum(...rgb);
    // text is either light on a dark chip or dark on a light one: take the side with more pixels
    let light = 0, dark = 0, lo = 255, hi = 0;
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        const i = (y * W + x) * 4, L = lum(data[i], data[i + 1], data[i + 2]);
        if (L > fillL + 50) light++;
        if (L < fillL - 50) dark++;
        if (L < lo) lo = L;
        if (L > hi) hi = L;
      }
    }
    const isLight = light >= dark;
    const cut = isLight ? (fillL + hi) / 2 : (fillL + lo) / 2;
    const ink = (r, g, bl) => (isLight ? lum(r, g, bl) > cut : lum(r, g, bl) < cut);
    const inkAt = (x, y) => { const i = (y * W + x) * 4; return ink(data[i], data[i + 1], data[i + 2]); };

    const iw = ix1 - ix0 + 1, ih = iy1 - iy0 + 1;
    const tmask = new Uint8Array(iw * ih);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) tmask[y * iw + x] = inkAt(ix0 + x, iy0 + y) ? 1 : 0;
    const glyphs = components(tmask, iw, ih, true).comps
      .filter(c => c.n >= ih * 0.15)
      .map(c => ({ x0: c.x0 + ix0, x1: c.x1 + ix0, y0: c.y0 + iy0, y1: c.y1 + iy0 }))
      .sort((p, q) => p.x0 - q.x0);
    // join pieces that touch or overlap (the Ω is drawn as two halves that meet in the middle)
    const merged = [];
    for (const g of glyphs) {
      const last = merged[merged.length - 1];
      if (last && g.x0 <= last.x1 + 1) {
        last.x0 = Math.min(last.x0, g.x0); last.x1 = Math.max(last.x1, g.x1); last.y0 = Math.min(last.y0, g.y0); last.y1 = Math.max(last.y1, g.y1);
      } else merged.push({ ...g });
    }

    // the number: the run of tall glyphs at the right end (… "2" "0" "Ω"), with only small gaps between
    const run = [];
    for (let k = merged.length - 1; k >= 0; k--) {
      const g = merged[k];
      if (!run.length) { run.unshift(g); continue; }
      const tall = Math.max(...run.map(q => q.y1 - q.y0 + 1));
      if (g.y1 - g.y0 + 1 < tall * 0.6 || run[0].x0 - g.x1 - 1 > tall * 0.45) break;
      run.unshift(g);
    }
    const readBox = (g) => {
      const glyph = inkGlyph(data, W, g.x0, g.y0, g.x1 + 1, g.y1 + 1, ink);
      return { box: g, glyph, ...(glyph ? classifyDigit(glyph, learned) : { ch: null, score: 0, margin: 0 }) };
    };
    // a glyph that matches nothing and is too wide for one digit may be two digits touching
    const read = run.flatMap(g => {
      const whole = readBox(g);
      if (whole.score >= 0.75) return [whole];
      const parts = splitWide(g, inkAt);
      if (parts.length < 2) return [whole];
      const split = parts.map(readBox);
      return split.reduce((a, q) => a + q.score, 0) / split.length > whole.score ? split : [whole];
    });
    const digits = read.filter(g => g.ch !== 'Ω');
    const value = digits.length && digits.every(g => g.ch && /\d/.test(g.ch)) ? String(Number(digits.map(g => g.ch).join(''))) : null;
    const sure = value !== null && digits.every(g => g.score >= 0.75 && g.margin >= 0.1);
    return { box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, rgb, color: classifyColor(...rgb), value, glyphs: read, digits, sure, light: isLight };
  });
  return { ok: true, chips };
}

/** Legend chips → manual text ("Red = 4 Ω" per line), the format the solver reads. */
export function legendToManual(chips) {
  return chips.filter(c => c.value !== null).map(c => `${c.color[0].toUpperCase()}${c.color.slice(1)} = ${c.value} Ω`).join('\n');
}

export { encodeShape };
