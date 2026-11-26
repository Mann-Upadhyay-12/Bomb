// Batteries — pixel readers for the two pictures (no OCR here, no DOM: works on ImageData-like
// { data, width, height }, so the tests run them on the fixture PNGs).
//
//  • the rules TABLE (changes every game): brown header band with the module names, a condition
//    column down the left ("Under 9V total", "Has 🔋", …) and one badge per cell:
//      digit  — bright green digit on a near-black badge (only disarm while that digit is on the timer)
//      ANY    — pale green "ANY" (disarm whenever)
//      FIRST / THEN — one colour per pair in a row (blue, orange, …): disarm FIRST before THEN
//    tests/fixtures/batteries_table.png
//  • the BOMB's batteries: a dark panel with cylinders (1.5V, label colour = kind) and 9V blocks
//    (two terminals on top). tests/fixtures/batteries_bomb.png
//
// What needs reading text (module names, condition words, digits the templates don't know, label
// voltages) is left to batteriesOCR.js; this file returns the boxes to read.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx / 255 };
}

/** Colour name of a saturated label / text colour: the battery kind and the FIRST/THEN pair key. */
export function hueName(r, g, b) {
  const { h, s } = hsv(r, g, b);
  if (s < 0.2) return 'grey';
  if (h < 15 || h >= 340) return 'red';
  if (h < 38) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 250) return 'blue';
  return 'purple';
}

function view(img) {
  const { data, width: W, height: H } = img;
  const at = (x, y) => (y * W + x) * 4;
  const L = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) L[i] = lum(data[p], data[p + 1], data[p + 2]);
  return { data, W, H, at, L };
}

const isBrown = (r, g, b) => r - b > 12 && r >= 30 && r <= 95 && g >= b && g <= r;

/** Rows of the brown header band, or null. */
function findHeader(v) {
  const { data, W, H, at } = v;
  let y0 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x += 2) { const p = at(x, y); if (isBrown(data[p], data[p + 1], data[p + 2])) n++; }
    if (n > W * 0.25) { if (y0 < 0) y0 = y; y1 = y; } else if (y0 >= 0 && y - y1 > 2) break;
  }
  if (y0 < 0 || y1 - y0 < 12) return null;
  // x extent of the band at its middle row
  const ym = (y0 + y1) >> 1;
  let x0 = -1, x1 = -1;
  for (let x = 0; x < W; x++) { const p = at(x, ym); if (isBrown(data[p], data[p + 1], data[p + 2])) { if (x0 < 0) x0 = x; x1 = x; } }
  return { y0, y1, x0, x1 };
}

// Grid lines are 1–2 px a little brighter than both neighbouring rows / columns, across nearly the
// whole table (badges and arrows only cover part of a line, so they never pass the 60 % test).
// Only grey pixels count: a long coloured FIRST → THEN arrow across most of a row is not a grid line.
function findLines(v, along, from, to, a0, a1) {
  const { W, L, data } = v;
  const out = [];
  for (let t = from + 3; t < to - 3; t++) {
    let n = 0, tot = 0;
    for (let s = a0; s < a1; s += 2) {
      tot++;
      const q = (along === 'y' ? t * W + s : s * W + t) * 4;
      if (Math.max(data[q], data[q + 1], data[q + 2]) - Math.min(data[q], data[q + 1], data[q + 2]) > 30) continue;
      const c = along === 'y' ? L[t * W + s] : L[s * W + t];
      const m = along === 'y' ? L[(t - 3) * W + s] : L[s * W + t - 3];
      const p = along === 'y' ? L[(t + 3) * W + s] : L[s * W + t + 3];
      if (c > m + 1.2 && c > p + 1.2) n++;
    }
    if (tot && n / tot > 0.6) out.push(t);
  }
  // merge 1–2 px thick lines
  const merged = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && t - last.b <= 2) last.b = t; else merged.push({ a: t, b: t });
  }
  return merged.map(m => ({ a: m.a, b: m.b }));
}

// connected components of a mask (8-neighbour); returns [{ n, x0, y0, x1, y1 }]
function components(mask, W, H, minN = 1) {
  const seen = new Uint8Array(W * H);
  const out = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % W, y = (j / W) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n >= minN) out.push({ n, x0, y0, x1, y1 });
  }
  return out;
}

const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);

/** Most common colours in a box (exact RGB), most frequent first. */
function colourCounts(v, x0, y0, x1, y1) {
  const { data, at } = v;
  const m = new Map();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = at(x, y);
    const k = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ c: [k >> 16, (k >> 8) & 255, k & 255], n }));
}

// ── digit templates ──
// Glyphs of the table's digit font, 8×12 cells of the glyph's ink box ('#' = mostly ink), taken from
// tests/fixtures/batteries_table.png. Digits not seen yet (6–9) are read by OCR instead.
const GW = 8, GH = 12;
export const DIGIT_TEMPLATES = {};

function glyphBits(mask, W, box) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  let s = '';
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const xa = box.x0 + Math.floor(gx * bw / GW), xb = box.x0 + Math.max(Math.floor(gx * bw / GW), Math.ceil((gx + 1) * bw / GW) - 1);
    const ya = box.y0 + Math.floor(gy * bh / GH), yb = box.y0 + Math.max(Math.floor(gy * bh / GH), Math.ceil((gy + 1) * bh / GH) - 1);
    let n = 0, t = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { t++; if (mask[y * W + x]) n++; }
    s += n * 2 >= t ? '#' : '.';
  }
  return { bits: s, aspect: bw / bh };
}

/** Best template digit for a glyph, with its score (1 = identical); null when no template is close. */
export function matchDigit(g) {
  let best = null, second = -Infinity;
  for (const [d, list] of Object.entries(DIGIT_TEMPLATES)) {
    let ds = -Infinity;
    for (const t of list) {
      let same = 0;
      for (let i = 0; i < t.bits.length; i++) if (t.bits[i] === g.bits[i]) same++;
      ds = Math.max(ds, same / t.bits.length - Math.min(0.3, Math.abs(Math.log(t.aspect / g.aspect)) * 0.5));
    }
    if (!best || ds > best.score) { if (best) second = best.score; best = { d: Number(d), score: ds }; }
    else if (ds > second) second = ds;
  }
  if (best) best.margin = best.score - second;
  return best;
}

/**
 * One cell's badge: null (empty), or { kind: 'digit' | 'any' | 'first' | 'then', pair, digit, glyph,
 * box, text }. `pair` is the FIRST/THEN colour (the two ends of one arrow share it).
 */
function readBadge(v, x0, y0, x1, y1) {
  const { W, data, at, L } = v;
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const cc = colourCounts(v, x0, y0, x1, y1);
  if (!cc.length) return null;
  const bg = cc[0].c;
  // the badge fill: a big flat colour that isn't the cell background
  const fill = cc.find(e => e.n > area * 0.08 && dist(e.c, bg) > 6);
  if (!fill) return null;
  let bx0 = x1, by0 = y1, bx1 = x0, by1 = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = at(x, y);
    if (dist([data[p], data[p + 1], data[p + 2]], fill.c) <= 6) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  if (bx1 - bx0 < 12 || by1 - by0 < 8) return null;
  // the text: pixels well brighter than the fill, inside the badge
  const fl = lum(...fill.c);
  let top = fl;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) top = Math.max(top, L[y * W + x]);
  if (top - fl < 40) return null;
  const thr = (fl + top) / 2;
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[(by0 + y) * W + bx0 + x] > thr) mask[y * w + x] = 1;
  // letters never touch the badge's side; an arrow running into the badge does (the blue line out of
  // a FIRST would otherwise be taken for its first letter)
  const all = components(mask, w, h, 2);
  const inner = all.filter(c => c.x0 > 0 && c.x1 < w - 1);
  const comps = inner.length ? inner : all;
  if (!comps.length) return null;
  let tx0 = w, ty0 = h, tx1 = -1, ty1 = -1;
  for (const c of comps) { tx0 = Math.min(tx0, c.x0); ty0 = Math.min(ty0, c.y0); tx1 = Math.max(tx1, c.x1); ty1 = Math.max(ty1, c.y1); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < tx0 || x > tx1 || y < ty0 || y > ty1) mask[y * w + x] = 0;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (mask[y * w + x]) { const p = at(bx0 + x, by0 + y); r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; }
  if (n < 6) return null;
  const text = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  const box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  const tbox = { x0: bx0 + tx0, y0: by0 + ty0, x1: bx0 + tx1, y1: by0 + ty1 };
  const textW = tx1 - tx0 + 1;
  // one glyph, narrow → a digit
  if (comps.length <= 2 && textW < w * 0.5) {
    const glyph = glyphBits(mask, w, { x0: tx0, y0: ty0, x1: tx1, y1: ty1 });
    const m = matchDigit(glyph);
    // a clear winner: wrong digits never scored above 0.77 on either table seen
    const sure = m && (m.score > 0.86 || (m.score > 0.8 && m.margin > 0.08));
    return { kind: 'digit', digit: sure ? m.d : null, score: m ? m.score : 0, glyph, box, tbox, text };
  }
  // a word: its first letter's left edge tells FIRST (F: full-height stem), THEN (T: only the top
  // bar) and ANY (A: only the bottom of the left leg)
  const th = ty1 - ty0 + 1;
  let topInk = 0, botInk = 0;
  for (let y = ty0; y <= ty1; y++) {
    let ink = false;
    for (let x = tx0; x <= Math.min(tx1, tx0 + 1); x++) if (mask[y * w + x]) ink = true;
    if (!ink) continue;
    if (y - ty0 < th / 2) topInk++; else botInk++;
  }
  const half = th / 2;
  const word = topInk > half * 0.6 && botInk > half * 0.6 ? 'FIRST' : topInk > botInk ? 'THEN' : 'ANY';
  if (word === 'ANY') return { kind: 'any', box, tbox, text };
  return { kind: word === 'FIRST' ? 'first' : 'then', pair: hueName(...text), box, tbox, text };
}

/** The battery icon in a condition cell: its label colour (= battery kind) and box, or null. */
function readIcon(v, x0, y0, x1, y1) {
  const { W, data, at } = v;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x0 + x, y0 + y);
    const { s, v: val } = hsv(data[p], data[p + 1], data[p + 2]);
    if (s > 0.45 && val > 0.35) mask[y * w + x] = 1;
  }
  const comps = components(mask, w, h, 6).sort((a, b) => b.n - a.n);
  if (!comps.length) return null;
  const c = comps[0];
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (mask[y * w + x]) {
    const p = at(x0 + x, y0 + y); r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
  }
  const rgb = [r / n, g / n, b / n].map(Math.round);
  // the icon is the label band plus the grey body under it and the cap over it
  const bw = c.x1 - c.x0 + 1;
  return {
    color: hueName(...rgb), rgb,
    box: { x0: x0 + c.x0 - 2, y0: Math.max(y0, y0 + c.y0 - Math.round(bw * 0.8)), x1: x0 + c.x1 + 2, y1: Math.min(y1, y0 + c.y1 + Math.round(bw * 2.6)) }
  };
}

/**
 * The rules table: { ok, columns: [{ x0, x1, header box }], rows: [{ y0, y1, condBox, icon,
 * cells: [badge|null] }] } — module names and condition words are read by OCR from the boxes.
 */
export function readTableLayout(img) {
  const v = view(img);
  const { W, H } = v;
  const hdr = findHeader(v);
  if (!hdr || hdr.x1 - hdr.x0 < W * 0.5) return { ok: false, reason: 'No table header (brown band) found.' };
  const bodyY0 = hdr.y1 + 1;
  const hl = findLines(v, 'y', bodyY0, H, hdr.x0 + 4, hdr.x1 - 4);
  if (hl.length < 1) return { ok: false, reason: 'No table rows found.' };
  const vl = findLines(v, 'x', hdr.x0, Math.min(W, hdr.x1 + 6), bodyY0 + 2, Math.min(H, hl[hl.length - 1].b + 20));
  if (vl.length < 2) return { ok: false, reason: 'No table columns found.' };
  // rows: header bottom → each line; the last row is as tall as the others
  const gaps = [];
  for (let i = 1; i < hl.length; i++) gaps.push(hl[i].a - hl[i - 1].b - 1);
  const rowH = gaps.length ? gaps.slice().sort((a, b) => a - b)[gaps.length >> 1] : hl[0].a - bodyY0;
  const ys = [{ a: bodyY0, b: bodyY0 - 1 }, ...hl];
  const rowsB = [];
  for (let i = 0; i < ys.length; i++) {
    const y0 = ys[i].b + 1;
    const y1 = i + 1 < ys.length ? ys[i + 1].a - 1 : Math.min(H - 1, y0 + rowH - 1);
    if (y1 - y0 >= rowH * 0.6) rowsB.push({ y0, y1 });
  }
  // columns: the first line ends the condition column; the last one may be the table's right edge
  const xs = [{ a: hdr.x0, b: hdr.x0 - 1 }, ...vl];
  const colsB = [];
  for (let i = 0; i < xs.length; i++) {
    const x0 = xs[i].b + 1;
    const x1 = i + 1 < xs.length ? xs[i + 1].a - 1 : hdr.x1;
    if (x1 - x0 >= 20) colsB.push({ x0, x1 });
  }
  if (colsB.length < 2) return { ok: false, reason: 'No module columns found.' };
  const cond = colsB[0];
  const columns = colsB.slice(1).map(c => ({ ...c, header: { x0: c.x0, y0: hdr.y0, x1: c.x1, y1: hdr.y1 } }));
  const rows = rowsB.map(r => {
    const icon = readIcon(v, cond.x0 + 2, r.y0 + 2, cond.x1 - 2, r.y1 - 2);
    return {
      ...r,
      condBox: { x0: cond.x0, y0: r.y0, x1: cond.x1, y1: r.y1 },
      icon,
      cells: columns.map(c => readBadge(v, c.x0 + 2, r.y0 + 2, c.x1 - 2, r.y1 - 2))
    };
  });
  return { ok: true, header: hdr, condCol: cond, columns, rows };
}

/**
 * The bomb's batteries: [{ color, rgb, round, terminals, x0, y0, x1, y1, size, label }] left to right.
 * `size` is the battery's area in pixels (for "biggest round"); `label` is the box of the coloured
 * label with the voltage on it.
 */
export function readBatteryLayout(img) {
  const v = view(img);
  const { W, H, data, at, L } = v;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const { s, v: val } = hsv(data[p], data[p + 1], data[p + 2]);
    if (s > 0.4 && val > 0.3) mask[i] = 1;
  }
  const bands = components(mask, W, H, Math.max(40, (W * H) / 2500)).filter(c => c.x1 - c.x0 >= 12 && c.y1 - c.y0 >= 8);
  if (!bands.length) return { ok: false, reason: 'No battery labels found.' };
  // panel colour = most common colour of the picture
  const cc = colourCounts(v, 0, 0, W - 1, H - 1);
  const bg = cc[0].c;
  const isBg = (x, y) => { const p = at(x, y); return dist([data[p], data[p + 1], data[p + 2]], bg) <= 12; };
  const rowHasInk = (y, xa, xb) => { for (let x = xa; x <= xb; x++) if (!isBg(x, y)) return true; return false; };
  const rowInk = (y, xa, xb) => { let n = 0; for (let x = xa; x <= xb; x++) if (!isBg(x, y)) n++; return n; };
  const out = [];
  for (const b of bands.sort((p, q) => p.x0 - q.x0)) {
    let r = 0, g = 0, bl = 0, n = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (mask[y * W + x]) {
      const p = at(x, y); r += data[p]; g += data[p + 1]; bl += data[p + 2]; n++;
    }
    const rgb = [r / n, g / n, bl / n].map(Math.round);
    const bw = b.x1 - b.x0 + 1;
    const xa = Math.max(0, b.x0 - Math.round(bw * 0.15)), xb = Math.min(W - 1, b.x1 + Math.round(bw * 0.15));
    let top = b.y0, bottom = b.y1;
    while (top > 0 && rowHasInk(top - 1, xa, xb)) top--;
    while (bottom < H - 1 && rowHasInk(bottom + 1, xa, xb)) bottom++;
    // body top: going up from the label, the first row that is clearly narrower than the body
    let bodyTop = b.y0;
    while (bodyTop > top && rowInk(bodyTop - 1, xa, xb) >= bw * 0.7) bodyTop--;
    // terminals / cap: light grey blobs above the body
    let terminals = 0;
    if (bodyTop > top) {
      const tw = xb - xa + 1, th = bodyTop - top;
      const tm = new Uint8Array(tw * th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (L[(top + y) * W + xa + x] > 130) tm[y * tw + x] = 1;
      terminals = components(tm, tw, th, 4).length;
    }
    out.push({
      color: hueName(...rgb), rgb,
      round: terminals <= 1,
      terminals,
      x0: b.x0, x1: b.x1, y0: top, y1: bottom,
      size: bw * (bottom - top + 1),
      label: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }
    });
  }
  return { ok: true, batteries: out };
}

/** 'table', 'batteries' or null — which of the two pictures this is. */
export function classifyPicture(img) {
  const t = readTableLayout(img);
  if (t.ok && t.rows.length >= 1 && t.columns.length >= 1) return { type: 'table', layout: t };
  const b = readBatteryLayout(img);
  if (b.ok && b.batteries.length >= 1 && b.batteries.length <= 12) return { type: 'batteries', layout: b };
  return { type: null, reason: t.reason || b.reason };
}

// The digit font as 8×12 ink grids (rows split by '/'), with the ink box's width / height
const DIGIT_GLYPHS = {
  0: [0.857, '..####../.######./###.####/###..###/###..###/###..###/###..###/###..###/###..###/###.####/.######./..####..'],
  1: [0.467, '....####/..######/########/########/...#####/...#####/...#####/...#####/...#####/...#####/...#####/...#####'],
  2: [0.786, '.#####../#######./###.####/###.####/##..####/##..####/..####../.####.../####..../########/########/########'],
  3: [0.786, '.######./########/###..###/###..###/.#...###/...#####/...#####/##...###/###..###/########/########/.######.'],
  4: [0.929, '...###../...###../..####../..####../.#####../.#####../########/########/########/#######./....##../....##..'],
  5: [0.857, '.#######/.######./.#####../.###..../.####.../######../.##.####/.#...###/##...###/###..###/########/.######.'],
};
for (const [d, [aspect, rows]] of Object.entries(DIGIT_GLYPHS)) DIGIT_TEMPLATES[d] = [{ aspect, bits: rows.replace(/\//g, '') }];
// The same digits drawn a little differently on a wider table (23 Nov, 20 modules): second templates
const MORE_DIGIT_GLYPHS = [
  [0, 0.800, '..####../.#####../###.###./###..###/###..###/###..###/###..###/###..###/###.####/#######./.#####../..####..'],
  [3, 0.714, '.######./########/###.####/###.####/##..####/...#####/...#####/##...###/###..###/########/########/.######.'],
  [4, 0.857, '....###./...####./..#####./..#####./..#####./.##.###./########/########/########/.#######/....##../....##..'],
  [5, 0.733, '..######/.######./.#####../.##...../######../#######./.#######/.....###/##...###/########/#######./.#####..']
];
for (const [d, aspect, rows] of MORE_DIGIT_GLYPHS) DIGIT_TEMPLATES[d].push({ aspect, bits: rows.replace(/\//g, '') });
