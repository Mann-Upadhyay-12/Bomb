// Pipes vision: find the grid of tiles, then for each tile which of its four sides a pipe reaches
// (that's the piece) and, on the helper's picture, the pipe's colour.
// Tiles are the same dark slate (42,47,56) on both pictures; pipes are grey (defuser) or a bright
// colour (helper) with a dark outline.

import { N, E, S, W } from './pipesSolver.js';

const isTile = (r, g, b) => Math.abs(r - 42) <= 1 && Math.abs(g - 47) <= 1 && Math.abs(b - 56) <= 1;
const isGap = (r, g, b) => Math.abs(r - 31) <= 3 && Math.abs(g - 34) <= 3 && Math.abs(b - 40) <= 3;
const isPipe = (r, g, b) => Math.max(r, g, b) > 100;

/** Saturated RGB → colour name (null for grey / dark). */
export function pipeColorName(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 90 || d < 60) return null;
  let h;
  if (mx === r) h = ((g - b) / d + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 15 || h >= 335) return 'red';
  if (h < 38) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 195) return 'cyan';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** Runs of `true` in a boolean profile → [[start, end)] longer than minLen. */
function runs(profile, minLen) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= profile.length; i++) {
    const on = i < profile.length && profile[i];
    if (on && s < 0) s = i;
    if (!on && s >= 0) { if (i - s >= minLen) out.push([s, i]); s = -1; }
  }
  return out;
}

/**
 * Read a Pipes picture (helper's coloured one or the defuser's grey one).
 * Returns { ok, reason?, cols, rows, cells: [{ mask, color, box }], colored }.
 */
export function readPipes(data, Wd, Hd) {
  // Board: where the tile colour is (the board frame around it is a near-identical slate, so be exact)
  const tileCol = new Float64Array(Wd), tileRow = new Float64Array(Hd);
  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const p = (y * Wd + x) * 4;
      if (isTile(data[p], data[p + 1], data[p + 2])) { tileCol[x]++; tileRow[y]++; }
    }
  }
  const span = (prof, len) => {
    const mx = Math.max(...prof);
    let lo = 0, hi = len - 1;
    while (lo < len && prof[lo] < mx * 0.1) lo++;
    while (hi > lo && prof[hi] < mx * 0.1) hi--;
    return [lo, hi + 1];
  };
  const [bx0, bx1] = span(tileCol, Wd), [by0, by1] = span(tileRow, Hd);
  if (bx1 - bx0 < Wd * 0.2 || by1 - by0 < Hd * 0.2) return { ok: false, reason: 'could not find the pipe tiles' };
  // Tiles: inside the board, the columns / rows that are NOT mostly gap colour
  const gapCol = new Float64Array(Wd), gapRow = new Float64Array(Hd);
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const p = (y * Wd + x) * 4;
      if (isGap(data[p], data[p + 1], data[p + 2])) { gapCol[x]++; gapRow[y]++; }
    }
  }
  const minTile = Math.round(Math.min(Wd, Hd) * 0.05);
  const xs = runs(Array.from(gapCol.subarray(bx0, bx1), v => v < (by1 - by0) * 0.5), minTile).map(([a0, a1]) => [a0 + bx0, a1 + bx0]);
  const ys = runs(Array.from(gapRow.subarray(by0, by1), v => v < (bx1 - bx0) * 0.5), minTile).map(([a0, a1]) => [a0 + by0, a1 + by0]);
  if (xs.length < 2 || ys.length < 2) return { ok: false, reason: 'could not find the pipe tiles' };

  const cells = [];
  let colored = 0;
  for (const [y0, y1] of ys) {
    for (const [x0, x1] of xs) {
      const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
      const tw = x1 - x0, th = y1 - y0;
      // a side is open when the pipe reaches it: sample a short line just inside the tile edge
      const side = (sx, sy, dx, dy) => {
        let on = 0, n = 0;
        for (let t = -3; t <= 3; t++) {
          const x = sx + dx * t, y = sy + dy * t;
          if (x < 0 || y < 0 || x >= Wd || y >= Hd) continue;
          const p = (y * Wd + x) * 4;
          n++;
          if (isPipe(data[p], data[p + 1], data[p + 2])) on++;
        }
        return n && on / n > 0.5;
      };
      const inset = Math.max(2, Math.round(Math.min(tw, th) * 0.06));
      let mask = 0;
      if (side(cx, y0 + inset, 1, 0)) mask |= N;
      if (side(x1 - 1 - inset, cy, 0, 1)) mask |= E;
      if (side(cx, y1 - 1 - inset, 1, 0)) mask |= S;
      if (side(x0 + inset, cy, 0, 1)) mask |= W;
      // colour: most common pipe colour in the middle of the tile
      const votes = {};
      for (let y = y0 + Math.round(th * 0.2); y < y1 - th * 0.2; y++) {
        for (let x = x0 + Math.round(tw * 0.2); x < x1 - tw * 0.2; x++) {
          const p = (y * Wd + x) * 4;
          const c = pipeColorName(data[p], data[p + 1], data[p + 2]);
          if (c) votes[c] = (votes[c] || 0) + 1;
        }
      }
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      const color = top && top[1] > tw * th * 0.03 ? top[0] : null;
      if (color) colored++;
      cells.push({ mask, color, box: { x0, y0, x1, y1 } });
    }
  }
  return { ok: true, cols: xs.length, rows: ys.length, cells, colored: colored > cells.length / 2 };
}
