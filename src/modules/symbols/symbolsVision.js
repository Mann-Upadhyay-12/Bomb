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

export function syReadGrids(img) {
  const { data, width: W, height: H } = img;
  const bands = [];
  let inBand = false, y1 = 0;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += syGray(data, (y * W + x) * 4);
    const light = s / W > 140;
    if (light && !inBand) { inBand = true; y1 = y; }
    else if (!light && inBand) { inBand = false; if (y - y1 > 45) bands.push({ y1, h: y - y1 }); }
  }
  if (inBand && H - y1 > 45) bands.push({ y1, h: H - y1 });
  if (!bands.length) bands.push({ y1: 0, h: H });
  const counts = {};
  let cells = 0;
  for (const b of bands) {
    const cw = W / 5, ch = b.h / 5;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const x0 = Math.floor(c * cw), x1 = Math.floor((c + 1) * cw);
        const yy0 = Math.floor(b.y1 + r * ch), yy1 = Math.floor(b.y1 + (r + 1) * ch);
        if (x1 - x0 <= 0 || yy1 - yy0 <= 0) continue;
        const res = syReadBox(img, x0, yy0, x1 - x0, yy1 - yy0, 2, 110, null);
        if (res && res.symbol !== '?') {
          counts[res.symbol] = (counts[res.symbol] || 0) + 1;
          cells++;
        }
      }
    }
  }
  return { counts, grids: bands.length, cells };
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
