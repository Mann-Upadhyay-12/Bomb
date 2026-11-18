// Computer vision for Symbols 5x5 reference grids and 2x2 keypad tiles

import { SY } from './symbolsConstants.js';

export const SY_BITMAPS = {
  OMEGA: [0,1584,6172,12302,12294,24582,24582,24582,24582,12294,12300,7192,512,16384,32318,0],
  YAT: [0,8064,8064,1536,32704,26208,18016,1536,1912,1564,1564,1548,1564,1564,8184,0],
  COPYRIGHT: [0,448,1040,2056,9190,9762,17440,19456,19456,19456,17442,9762,12772,2056,1584,0],
  LAMBDA_STROKE: [0,2048,15872,13056,1792,3328,2304,768,896,1664,3264,3136,6240,6180,12348,0],
  OT: [0,2884,7292,14590,31182,29134,29062,29062,25030,29126,29134,14830,14590,7420,1650,0],
  PSI: [0,992,12482,12482,12486,12486,12486,12486,6342,3276,992,192,192,192,0,0],
  DOUBLE_CROSS: [0,32,568,1912,4080,1008,508,12796,15260,32640,7936,4064,4064,7904,7168,0],
  STAR_SOLID: [0,128,128,128,448,448,32766,8188,4088,2032,2032,2032,1584,1040,0,0],
  STAR_HOLLOW: [0,128,128,0,320,0,32318,4,2056,1040,1040,1168,544,1040,0,0],
  ZHE: [0,0,31726,2176,144,1168,1184,2016,1168,3224,6284,12740,6,2,0,0],
  KOPPA: [0,448,992,1048,3096,2056,6152,6152,2056,3080,1048,1008,192,128,128,0],
  INV_QUESTION: [0,128,192,128,0,128,128,128,768,1536,1536,3584,3584,1568,864,0]
};

const SY_TPL = {};
for (const [k, rows] of Object.entries(SY_BITMAPS)) {
  const v = new Float32Array(256);
  let on = 0;
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      if (rows[r] & (1 << (15 - c))) {
        v[r * 16 + c] = 1;
        on++;
      }
    }
  }
  const mean = on / 256;
  let ss = 0;
  for (let i = 0; i < 256; i++) {
    v[i] -= mean;
    ss += v[i] * v[i];
  }
  SY_TPL[k] = { vec: v, norm: Math.sqrt(ss) };
}

export function syClassify(bits) {
  if (!bits || !bits.length || !bits[0] || !bits[0].length) {
    return { symbol: '?', score: 0 };
  }
  const H = bits.length, W = bits[0].length;
  let on = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bits[y][x]) on++;
  const density = on / (H * W);
  const sc = Math.min(14 / W, 14 / H), tw = Math.max(1, Math.round(W * sc)), th = Math.max(1, Math.round(H * sc));
  const ox = Math.floor((16 - tw) / 2), oy = Math.floor((16 - th) / 2);
  const v = new Float32Array(256);
  let n = 0;
  for (let y = 0; y < th; y++) {
    const sy = Math.min(H - 1, Math.floor(y / sc));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(W - 1, Math.floor(x / sc));
      if (bits[sy][sx]) {
        v[(oy + y) * 16 + (ox + x)] = 1;
        n++;
      }
    }
  }
  const mean = n / 256;
  let ss = 0;
  for (let i = 0; i < 256; i++) {
    v[i] -= mean;
    ss += v[i] * v[i];
  }
  const norm = Math.sqrt(ss);
  if (norm === 0) return { symbol: '?', score: 0 };
  let best = '?', bs = -999;
  for (const [k, t] of Object.entries(SY_TPL)) {
    if (!t.norm) continue;
    let dot = 0;
    for (let i = 0; i < 256; i++) dot += v[i] * t.vec[i];
    const s = dot / (norm * t.norm);
    if (s > bs) { bs = s; best = k; }
  }
  if (best === 'STAR_SOLID' || best === 'STAR_HOLLOW') {
    best = density > 0.24 ? 'STAR_SOLID' : 'STAR_HOLLOW';
  }
  return { symbol: best, score: bs };
}

const syGray = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

export function syReadBox(img, x0, y0, w, h, margin, thresh, skip) {
  const { data, width: W } = img;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  const ink = [];
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      if (y < margin || y >= h - margin || x < margin || x >= w - margin) continue;
      if (skip && skip(y, x)) continue;
      if (syGray(data, ((y0 + y) * W + (x0 + x)) * 4) < thresh) {
        row[x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    ink.push(row);
  }
  if (maxX < minX || maxY < minY) return null;
  const cw = maxX - minX + 1, rows = [];
  for (let y = minY; y <= maxY; y++) rows.push(ink[y].slice(minX, maxX + 1));
  return syClassify(rows);
}

// Splits a screenshot into its 5×5 reference grids.
// The game stacks one grid per panel; when there is more than one, each panel sits under a dark
// "SYMBOLS #n" header strip. A single grid comes with no header at all.
// Returns { panels: [{ x, y, w, h, cells: [25 symbol keys | null], counts }], hasHeader }.
/**
 * Where the 5×5 grids are, and which puzzle each belongs to.
 * Grids side by side in one row are one puzzle's grids (added together). Between rows:
 *  - when the strip has headers ("SYMBOLS #1" …) between grids, a header starts the next puzzle,
 *    so every grid under header #n is added for puzzle #n;
 *  - without headers, each row is the next puzzle (#1 on top, #2 below …).
 * @returns {{ rects: [{x,y,w,h,group}], hasHeader, groups }}
 */
export function syLayoutPanels(img) {
  const { data, width: W, height: H } = img;
  const isLight = i => syGray(data, i) > 150;

  // 1. rows with enough light pixels belong to a grid row; dark rows are headers / gaps
  const rowN = new Uint32Array(H);
  let maxN = 0;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (isLight((y * W + x) * 4)) n++;
    rowN[y] = n; if (n > maxN) maxN = n;
  }
  const minSide = Math.max(40, Math.min(W, H) * 0.08);
  // relative to the fullest row, so a row with fewer grids than another still counts
  const rowThr = Math.max(minSide * 0.6, Math.min(W * 0.45, maxN * 0.4));
  const bands = [];
  for (let y = 0; y < H;) {
    if (rowN[y] < rowThr) { y++; continue; }
    let y2 = y;
    // tolerate 1-2px dark rows (thick grid lines) inside a band
    while (y2 < H && (rowN[y2] >= rowThr || (y2 + 2 < H && (rowN[y2 + 1] >= rowThr || rowN[y2 + 2] >= rowThr)))) y2++;
    if (y2 - y >= minSide) bands.push({ y1: y, y2 });
    y = y2;
  }
  if (!bands.length) bands.push({ y1: 0, y2: H });

  // 2. is there a header (text) in the gap above each band?
  const textIn = (y0, y1) => {
    y0 = Math.max(0, y0 + 2); y1 = Math.min(H, y1 - 2);
    if (y1 - y0 < 6) return false;
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = data[i], b = data[i + 2];
      if (syGray(data, i) > 120 || (r > 150 && r - b > 60)) n++;
    }
    return n >= Math.max(15, (y1 - y0) * W * 0.002);
  };
  const headerAbove = bands.map((b, k) => textIn(k ? bands[k - 1].y2 : 0, b.y1));
  const hasHeader = headerAbove.some(Boolean) || bands[0].y1 >= Math.max(8, H * 0.03);
  const splitByHeaders = headerAbove.slice(1).some(Boolean);

  // 3. grids inside each band: runs of light columns (two grids side by side = two runs)
  const rects = [];
  let group = 0;
  bands.forEach((b, k) => {
    if (k > 0 && (!splitByHeaders || headerAbove[k])) group++;
    const bh = b.y2 - b.y1;
    const colGap = Math.max(4, Math.round(bh * 0.06)); // cell separators are thinner than the gap between grids
    const runs = [];
    let s = -1, last = -1;
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let y = b.y1; y < b.y2; y++) if (isLight((y * W + x) * 4)) n++;
      if (n > bh * 0.45) { if (s < 0) s = x; last = x; }
      else if (s >= 0 && x - last > colGap) { runs.push([s, last + 1]); s = -1; }
    }
    if (s >= 0) runs.push([s, last + 1]);
    if (!runs.length) runs.push([0, W]);
    for (const [x1, x2] of runs) {
      const pw = x2 - x1;
      // grids touching each other read as one wide run: cut it into square pieces
      const k2 = pw / bh > 1.6 ? Math.round(pw / bh) : 1;
      for (let q = 0; q < k2; q++) {
        const qx = Math.round(x1 + q * pw / k2), qw = Math.round(pw / k2);
        if (qw < minSide || qw / bh > 2.2 || bh / qw > 2.2) continue; // not a square-ish grid
        rects.push({ x: qx, y: b.y1, w: qw, h: bh, group });
      }
    }
  });
  // renumber groups so they run 0,1,2… even if a band had no grid
  const used = [...new Set(rects.map(r => r.group))].sort((a, b) => a - b);
  rects.forEach(r => { r.group = used.indexOf(r.group); });
  return { rects, hasHeader, groups: used.length };
}

export function syReadPanels(img) {
  const { rects, hasHeader, groups } = syLayoutPanels(img);
  const panels = [];
  for (const { x: x1, y: y1, w: pw, h: bh, group } of rects) {
    // classify the 25 cells
    const cw = pw / 5, ch = bh / 5;
    const cells = [];
    const counts = {};
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cx0 = Math.floor(x1 + c * cw), cx1 = Math.floor(x1 + (c + 1) * cw);
        const cy0 = Math.floor(y1 + r * ch), cy1 = Math.floor(y1 + (r + 1) * ch);
        const mg = Math.max(2, Math.round(Math.min(cw, ch) * 0.06));
        const res = syReadBox(img, cx0, cy0, cx1 - cx0, cy1 - cy0, mg, 110, null);
        const k = res && res.symbol !== '?' ? res.symbol : null;
        cells.push(k);
        if (k) counts[k] = (counts[k] || 0) + 1;
      }
    }
    if (cells.some(Boolean)) panels.push({ x: x1, y: y1, w: pw, h: bh, group, cells, counts });
  }
  return { panels, hasHeader, groups };
}

// Back-compat: summed counts across every grid in the image
export function syReadGrids(img) {
  const { panels } = syReadPanels(img);
  const counts = {};
  let cells = 0;
  for (const p of panels) {
    for (const k of p.cells) if (k) { counts[k] = (counts[k] || 0) + 1; cells++; }
  }
  return { counts, grids: panels.length, cells };
}

export function syReadModule(img) {
  const { data, width: W, height: H } = img;
  const white = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4] > 195 && data[i * 4 + 1] > 195 && data[i * 4 + 2] > 195) white[i] = 1;
  }
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H * 2), tiles = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!white[p] || seen[p]) continue;
      let sp = 0, rp = 0;
      stack[sp++] = x; stack[sp++] = y; seen[p] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, n = 0, sx = 0, sy = 0;
      while (rp < sp) {
        const cx = stack[rp++], cy = stack[rp++];
        n++; sx += cx; sy += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const q = ny * W + nx;
          if (white[q] && !seen[q]) {
            seen[q] = 1;
            stack[sp++] = nx; stack[sp++] = ny;
          }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (n > 500 && bw >= 30 && bh >= 30 && bw <= W * 0.6 && bh <= H * 0.6) {
        tiles.push({ x: minX, y: minY, bw, bh, cx: sx / n, cy: sy / n });
      }
    }
  }
  if (tiles.length >= 4) {
    tiles.sort((a, b) => {
      const at = a.cy < H * 0.5, bt = b.cy < H * 0.5;
      return at !== bt ? (at ? -1 : 1) : a.cx - b.cx;
    });
  }
  const out = [null, null, null, null];
  for (let i = 0; i < Math.min(4, tiles.length); i++) {
    const t = tiles[i], mh = Math.floor(t.bh * 0.32), mw = Math.floor(t.bw * 0.32);
    const mg = Math.max(4, Math.round(Math.min(t.bw, t.bh) * 0.12));
    const res = syReadBox(img, t.x, t.y, t.bw, t.bh, mg, 120, (y, x) => y < mh && x < mw);
    if (res && res.symbol !== '?') out[i] = res.symbol;
  }
  return { buttons: out, tiles: tiles.length };
}
