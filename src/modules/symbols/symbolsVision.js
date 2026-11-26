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
        tiles.push({ x: minX, y: minY, bw, bh, n, cx: sx / n, cy: sy / n });
      }
    }
  }
  // The white inside a symbol (©'s ring, ☆'s outline, Ϙ's loop) is its own white area too, and in a
  // picture bigger than the game's 440 px it passes for a tile: it took ©'s place in the order and
  // pushed ☆ out. A tile is never inside another tile, and there are 4 of them, the biggest.
  const inside = (a, b) => a !== b && a.x >= b.x && a.y >= b.y && a.x + a.bw <= b.x + b.bw && a.y + a.bh <= b.y + b.bh;
  const keys = tiles.filter(t => !tiles.some(o => inside(t, o)));
  tiles.length = 0;
  tiles.push(...keys.sort((a, b) => b.n - a.n).slice(0, 4));
  if (tiles.length >= 4) {
    // top row first (above the keypad's middle, wherever the keypad sits in the picture), each row left to right
    const midY = tiles.reduce((s, t) => s + t.cy, 0) / tiles.length;
    tiles.sort((a, b) => {
      const at = a.cy < midY, bt = b.cy < midY;
      return at !== bt ? (at ? -1 : 1) : a.cx - b.cx;
    });
  }
  const out = [null, null, null, null];
  for (let i = 0; i < Math.min(4, tiles.length); i++) {
    const t = tiles[i];
    const res = syReadKeypadTile(img, t);
    if (res && res.symbol !== '?') out[i] = res.symbol;
  }
  return { buttons: out, tiles: tiles.length };
}

// ── The defuser's keypad tiles ────────────────────────────────────────────────────────────────
// How the game draws each keypad symbol: its ink averaged over 184 tiles from 38 real keypad
// screenshots (2026-11-23), 0 = paper … 9 = full ink, on syClassify's 16×16 grid (the symbol's box
// scaled to 14 cells and centred). The hand-drawn SY_BITMAPS above are kept for the helpers' grids.
// Rebuilt from real screenshots, these read every one of them right at 0.7×–1.6× their size, each
// screenshot judged by patterns made without it; the hand-drawn ones read ☆ as Ω and © as Ѿ.
const SY_KEYPAD = {
  OMEGA: [ // 15 tiles
    '0000000000000000',
    '0002661002651000',
    '0038500000167200',
    '0287100000028710',
    '0594000000005940',
    '0892000000003970',
    '0892000000003980',
    '0892000000003970',
    '0594000000005930',
    '0187200000038710',
    '0027720000376100',
    '0001354004420000',
    '0221126006211320',
    '0687777017778840',
    '0488885006888730',
    '0000000000000000'
  ],
  YAT: [ // 16 tiles
    '0000000000000000',
    '0016888740000000',
    '0003798410000000',
    '0122697322000000',
    '0663697357100000',
    '0630496027100000',
    '0100497113100000',
    '0000499767631000',
    '0000497323687200',
    '0000496000169600',
    '0000496000059800',
    '0000496000059800',
    '0000496000169700',
    '0001697213687200',
    '0026777776531000',
    '0000000000000000'
  ],
  COPYRIGHT: [ // 13 tiles
    '0000000000000000',
    '0000144554311000',
    '0003531112453100',
    '0036211222126210',
    '0162148768502520',
    '0340495104600440',
    '0521871001200270',
    '0612961000000170',
    '0612961000000270',
    '0522872101200370',
    '0331594114601530',
    '0151158658512500',
    '0024112222125100',
    '0002521112351000',
    '0000134544200000',
    '0000000000000000'
  ],
  LAMBDA_STROKE: [ // 15 tiles
    '0000000000000000',
    '0157631200000000',
    '0386577510000000',
    '0252377300000000',
    '0012687200000000',
    '0004437400000000',
    '0000038610000000',
    '0000169820000000',
    '0000386650000000',
    '0001673352000000',
    '0004851164000000',
    '0016720045100000',
    '0048400026314500',
    '0167200004647700',
    '0142000001576300',
    '0000000000000000'
  ],
  OT: [ // 19 tiles
    '0000000000000000',
    '0000255200100000',
    '0004841025763000',
    '0048400175248300',
    '0287100582017710',
    '0594001870005930',
    '0793002970005940',
    '0892003960005950',
    '0792003970005950',
    '0693002971006940',
    '0395001893028820',
    '0068200597259500',
    '0027720179887100',
    '0001564359995440',
    '0000023443345310',
    '0000000000000000'
  ],
  PSI: [ // 15 tiles
    '0000000000000000',
    '0320001650000230',
    '0571001880000750',
    '0392000870002930',
    '0393000870003930',
    '0393000870004930',
    '0294000870005920',
    '0185000870006810',
    '0048200870028400',
    '0003544884453000',
    '0000112881110000',
    '0000000870000000',
    '0000001880000000',
    '0000003883000000',
    '0000000000000000',
    '0000000000000000'
  ],
  DOUBLE_CROSS: [ // 11 tiles
    '0000000000000000',
    '0000001001541000',
    '0000157314984000',
    '0000279878972000',
    '0000158999950000',
    '0000002799984100',
    '0000001699999600',
    '0046313896579600',
    '0279888972014200',
    '0158999950000000',
    '0002799984100000',
    '0001699999610000',
    '0003896579610000',
    '0015983014200000',
    '0002650000000000',
    '0000000000000000'
  ],
  STAR_SOLID: [ // 16 tiles
    '0000000000000000',
    '0000000120000000',
    '0000000450000000',
    '0000001781000000',
    '0000003882000000',
    '0222226996322220',
    '0378889999888730',
    '0037999999997300',
    '0002599999962000',
    '0000189999810000',
    '0000289999930000',
    '0000498558950000',
    '0000773103771000',
    '0001510000151000',
    '0000100000010000',
    '0000000000000000'
  ],
  STAR_HOLLOW: [ // 24 tiles
    '0000000000000000',
    '0000000340000000',
    '0000000750000000',
    '0000001771000000',
    '0000004442000000',
    '0233337117333320',
    '0596553004556950',
    '0036200000036300',
    '0002540000452000',
    '0000270000520000',
    '0000340330520000',
    '0000635555360000',
    '0001973013680000',
    '0002820000273000',
    '0001000000000000',
    '0000000000000000'
  ],
  ZHE: [ // 16 tiles
    '0000000000000000',
    '0685015663017850',
    '0445301850054430',
    '0001501840150000',
    '0000511840330000',
    '0000241841610000',
    '0000077987400000',
    '0000572853830000',
    '0003931840681000',
    '0018601840185000',
    '0058101850039200',
    '0463014662006860',
    '0000000000000580',
    '0000000000000170',
    '0000000000000050',
    '0000000000000000'
  ],
  KOPPA: [ // 9 tiles
    '0000000000000000',
    '0000037887400000',
    '0000583113860000',
    '0003920000293000',
    '0006700000067000',
    '0009500000059000',
    '0009400000059000',
    '0009500000059000',
    '0006700000066000',
    '0002930000393000',
    '0000485224850000',
    '0000026997300000',
    '0000000570000000',
    '0000000570000000',
    '0000000450000000',
    '0000000000000000'
  ],
  INV_QUESTION: [ // 15 tiles
    '0000000000000000',
    '0000000373000000',
    '0000000495000000',
    '0000000141000000',
    '0000000000000000',
    '0000000061000000',
    '0000000071000000',
    '0000001671000000',
    '0000038510000000',
    '0000296000000000',
    '0000592000000000',
    '0000892000000000',
    '0000594002710000',
    '0000188316910000',
    '0000015877400000',
    '0000000000000000'
  ],
};
const SY_KEYPAD_TPL = {};
for (const [k, rows] of Object.entries(SY_KEYPAD)) {
  const v = Float32Array.from(rows.join(''), Number);
  const mean = v.reduce((a, x) => a + x, 0) / 256;
  let ss = 0;
  for (let i = 0; i < 256; i++) { v[i] -= mean; ss += v[i] * v[i]; }
  SY_KEYPAD_TPL[k] = { vec: v, norm: Math.sqrt(ss) };
}

/**
 * One keypad tile → { symbol, score } (null when it has no ink).
 *  - The ink cut-off is halfway between this tile's paper and its darkest ink: a small or blurry
 *    picture draws the thin lines of ☆ and © grey, and a fixed cut-off lost most of them.
 *  - Only ink that reaches the middle of the tile is the symbol: the press-order number in the
 *    top-left corner, and a mouse cursor left on the tile, are not.
 *  - Each of the 16×16 cells is the average ink over its part of the symbol, compared with SY_KEYPAD.
 *  - ★ or ☆ is whether the middle of the star is ink or paper, which blur doesn't change.
 */
function syReadKeypadTile(img, t) {
  const { data, width: W } = img, w = t.bw, h = t.bh;
  const mg = Math.max(4, Math.round(Math.min(w, h) * 0.12));
  const cornerW = Math.floor(w * 0.32), cornerH = Math.floor(h * 0.32); // the press-order number
  const gray = (x, y) => syGray(data, ((t.y + y) * W + t.x + x) * 4);
  const inTile = (x, y) => y >= mg && y < h - mg && x >= mg && x < w - mg && !(y < cornerH && x < cornerW);

  const vals = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inTile(x, y)) vals.push(gray(x, y));
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const ink = vals[Math.floor(vals.length * 0.01)], paper = vals[Math.floor(vals.length * 0.6)];
  if (paper - ink < 40) return null; // a blank tile
  const thr = paper - 0.5 * (paper - ink);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inTile(x, y) && gray(x, y) < thr) m[y * w + x] = 1;

  // connected pieces of ink; keep those whose box reaches the middle 40% of the tile
  const lab = new Int32Array(w * h), keep = new Set(), stack = [];
  const c0 = 0.3 * w, c1 = 0.7 * w, r0 = 0.3 * h, r1 = 0.7 * h;
  let id = 0;
  for (let p = 0; p < w * h; p++) {
    if (!m[p] || lab[p]) continue;
    lab[p] = ++id; stack.push(p);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    while (stack.length) {
      const q = stack.pop(), qx = q % w, qy = (q / w) | 0;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (m[r] && !lab[r]) { lab[r] = id; stack.push(r); }
      }
    }
    if (x1 >= c0 && x0 <= c1 && y1 >= r0 && y0 <= r1) keep.add(id);
  }
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (keep.has(lab[y * w + x])) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;

  // 0 … 1 ink of a symbol pixel, averaged into 16×16 cells
  const inkAt = (x, y) => (keep.has(lab[y * w + x]) ? Math.min(1, Math.max(0, (paper - gray(x, y)) / (paper - ink))) : 0);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const sc = Math.min(14 / bw, 14 / bh), tw = Math.max(1, Math.round(bw * sc)), th = Math.max(1, Math.round(bh * sc));
  const ox = Math.floor((16 - tw) / 2), oy = Math.floor((16 - th) / 2);
  const v = new Float32Array(256);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const ya = ty / sc, yb = Math.min(bh, (ty + 1) / sc), xa = tx / sc, xb = Math.min(bw, (tx + 1) / sc);
    let sum = 0, area = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
      const a = (Math.min(y + 1, yb) - Math.max(y, ya)) * (Math.min(x + 1, xb) - Math.max(x, xa));
      if (a > 0) { sum += inkAt(minX + x, minY + y) * a; area += a; }
    }
    v[(oy + ty) * 16 + ox + tx] = area ? sum / area : 0;
  }
  const mean = v.reduce((a, x) => a + x, 0) / 256;
  let ss = 0;
  for (let i = 0; i < 256; i++) { v[i] -= mean; ss += v[i] * v[i]; }
  const norm = Math.sqrt(ss);
  if (!norm) return null;
  let best = '?', bs = -2;
  for (const [k, tp] of Object.entries(SY_KEYPAD_TPL)) {
    let dot = 0;
    for (let i = 0; i < 256; i++) dot += v[i] * tp.vec[i];
    if (dot / (norm * tp.norm) > bs) { bs = dot / (norm * tp.norm); best = k; }
  }
  if (best === 'STAR_SOLID' || best === 'STAR_HOLLOW') {
    const cx = (minX + maxX) / 2, cy = minY + 0.55 * (maxY - minY), r = Math.max(1, 0.08 * bw);
    let sum = 0, n = 0;
    for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) { sum += gray(x, y); n++; }
    best = paper - sum / n > 0.5 * (paper - ink) ? 'STAR_SOLID' : 'STAR_HOLLOW';
  }
  return { symbol: best, score: bs };
}
