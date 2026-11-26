// Laundry — reads which care symbol each of the module's four white tiles shows right now
// (top: Wash | Dry, bottom: Iron | Special care), so the answer can say how many presses each
// button needs. No OCR, no DOM: works on ImageData-like { data, width, height }.
//
// The symbols are matched against templates cut from the helper's symbol sheet
// (tests/fixtures/laundry_manual.png). Two looks at each symbol:
//   full  — all its ink, its box stretched to ICON×ICON
//   marks — only the small marks inside the outline (the digits in the tub, the dots in the iron
//           or the drying circle, the letter in a special-care circle), stretched to MARK_W×MARK_H.
//           Symbols of one group share their outline, so the marks are what tells them apart.
// buildIconTemplates() makes the templates; laundryIcons.js holds them.

import { WASH, DRY, IRON, CARE } from './laundrySolver.js';
import { ICON_TEMPLATES } from './laundryIcons.js';

export const ICON = 24, MARK_W = 24, MARK_H = 12;
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Box of the set samples of a mask (optionally only those with label in `keep`). */
function boxOf(mask, w, h, keep = null, labels = null) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i] || (keep && !keep.has(labels[i]))) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Ink fractions of `box` stretched to gw×gh. */
function sample(mask, w, box, gw, gh, keep = null, labels = null) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const g = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = box.x0 + gx * bw / gw, sx1 = box.x0 + (gx + 1) * bw / gw;
    const sy0 = box.y0 + gy * bh / gh, sy1 = box.y0 + (gy + 1) * bh / gh;
    let ink = 0, n = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      n++;
      const i = y * w + x;
      if (mask[i] && (!keep || keep.has(labels[i]))) ink++;
    }
    g[gy * gw + gx] = n ? ink / n : 0;
  }
  return g;
}

/**
 * The symbol inside `box` → { full, marks, count } or null for a blank tile. Ink = darker than
 * `level` of the way from the darkest line to the paper: low keeps a blurred copy's thick, grey lines
 * thin and its dots apart.
 */
export function iconGlyph(img, box, level = 0.25) {
  const { data, width: W } = img;
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const L = new Float32Array(w * h);
  let lo = 255, hi = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = ((box.y0 + y) * W + box.x0 + x) * 4;
    const v = lum(data[p], data[p + 1], data[p + 2]);
    L[y * w + x] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 60) return null;
  const cut = lo + (hi - lo) * level;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = L[i] < cut ? 1 : 0;
  const all = boxOf(mask, w, h);
  if (!all) return null;
  // blobs (8-connected)
  const labels = new Int32Array(w * h).fill(-1);
  const blobs = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i] >= 0) continue;
    const id = blobs.length, st = [i];
    labels[i] = id;
    const b = { id, n: 0, x0: w, y0: h, x1: -1, y1: -1 };
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j - x) / w;
      b.n++;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (mask[k] && labels[k] < 0) { labels[k] = id; st.push(k); }
      }
    }
    blobs.push(b);
  }
  const outline = blobs.reduce((a, b) => (b.n > a.n ? b : a));
  const ow = outline.x1 - outline.x0 + 1, oh = outline.y1 - outline.y0 + 1;
  // marks: small blobs inside the outline's box, not specks
  const marks = blobs.filter(b => b !== outline && b.n >= Math.max(3, outline.n * 0.004)
    && (b.x1 - b.x0 + 1) < ow * 0.45 && (b.y1 - b.y0 + 1) < oh * 0.6
    && b.x0 >= outline.x0 && b.x1 <= outline.x1 && b.y0 >= outline.y0 && b.y1 <= outline.y1);
  const keep = new Set(marks.map(b => b.id));
  const mbox = marks.length ? boxOf(mask, w, h, keep, labels) : null;
  return {
    full: sample(mask, w, all, ICON, ICON),
    marks: mbox ? sample(mask, w, mbox, MARK_W, MARK_H, keep, labels) : null,
    count: marks.length
  };
}

// 3×3 box blur: a line one sample off still overlaps its template
function soften(g, gw, gh) {
  const out = new Float32Array(g.length);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      s += g[yy * gw + xx]; n++;
    }
    out[y * gw + x] = s / n;
  }
  return out;
}

// Correlation weighted per sample: `w` puts the weight where a group's symbols differ.
function correlate(a, b, w) {
  let sw = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { sw += w[i]; ma += w[i] * a[i]; mb += w[i] * b[i]; }
  ma /= sw; mb /= sw;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += w[i] * x * y; da += w[i] * x * x; db += w[i] * y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export const encodeIcon = g => (g ? Array.from(g, v => Math.round(v * 15).toString(16)).join('') : '');
const decodeIcon = s => (s ? Float32Array.from(s, ch => parseInt(ch, 16) / 15) : null);

// per-sample weight = how much the group's symbols disagree there (+ a floor)
function spread(list, n) {
  const w = new Float32Array(n);
  if (!list.length) return w.fill(1);
  for (let i = 0; i < n; i++) {
    let m = 0;
    list.forEach(t => { m += t[i]; });
    m /= list.length;
    let v = 0;
    list.forEach(t => { v += (t[i] - m) ** 2; });
    w[i] = Math.sqrt(v / list.length) + 0.03;
  }
  return w;
}

const groups = {};
function groupOf(name) {
  if (groups[name]) return groups[name];
  const names = Object.keys(ICON_TEMPLATES[name]);
  const temps = names.map(n => {
    const t = ICON_TEMPLATES[name][n];
    const m = decodeIcon(t.m);
    return { full: soften(decodeIcon(t.f), ICON, ICON), marks: m ? soften(m, MARK_W, MARK_H) : null, count: t.c };
  });
  const wFull = spread(temps.map(t => t.full), ICON * ICON);
  const wMarks = spread(temps.filter(t => t.marks).map(t => t.marks), MARK_W * MARK_H);
  return (groups[name] = { names, temps, wFull, wMarks });
}

/** Best symbol of `group` ('wash' | 'dry' | 'iron' | 'care') for a glyph: { name, score, margin }. */
export function matchIcon(group, glyph) {
  const { names, temps, wFull, wMarks } = groupOf(group);
  const full = soften(glyph.full, ICON, ICON);
  const marks = glyph.marks ? soften(glyph.marks, MARK_W, MARK_H) : null;
  const all = names.map((name, i) => {
    const t = temps[i];
    const a = correlate(full, t.full, wFull);
    // no marks on either side: the outline alone decides (no free bonus for mark-less symbols)
    const b = marks && t.marks ? correlate(marks, t.marks, wMarks) : !marks && !t.marks ? a : 0;
    const c = glyph.count === t.count ? 0 : -0.15;
    return { name, score: (a + b) / 2 + c };
  });
  all.sort((a, b) => b.score - a.score);
  return { ...all[0], margin: all.length > 1 ? all[0].score - all[1].score : 1 };
}

/** The white tiles: big near-white blobs, roughly square. → [{ x0, y0, x1, y1 }] */
function whiteTiles(img) {
  const { data, width: W, height: H } = img;
  const white = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) white[i] = Math.min(data[p], data[p + 1], data[p + 2]) > 225 ? 1 : 0;
  const seen = new Uint8Array(W * H), out = [];
  const minSide = Math.max(12, Math.min(W, H) * 0.05);
  for (let i = 0; i < W * H; i++) {
    if (!white[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && white[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; st.push(j - 1); }
      if (x < W - 1 && white[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; st.push(j + 1); }
      if (y > 0 && white[j - W] && !seen[j - W]) { seen[j - W] = 1; st.push(j - W); }
      if (y < H - 1 && white[j + W] && !seen[j + W]) { seen[j + W] = 1; st.push(j + W); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // a tile: square-ish and mostly white (the symbol is thin line art)
    if (bw >= minSide && bh >= minSide && bw / bh > 0.8 && bw / bh < 1.25 && n > bw * bh * 0.6) out.push({ x0, y0, x1, y1, n });
  }
  return out;
}

/** Four equal tiles in a 2×2 block → [topLeft, topRight, bottomLeft, bottomRight] or null. */
function twoByTwo(tiles) {
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i], s = a.x1 - a.x0 + 1;
    const same = t => Math.abs((t.x1 - t.x0 + 1) - s) <= s * 0.12 && Math.abs((t.y1 - t.y0 + 1) - s) <= s * 0.15;
    const right = tiles.find(t => t !== a && same(t) && Math.abs(t.y0 - a.y0) <= s * 0.1 && t.x0 > a.x1 && t.x0 - a.x1 < s * 0.5);
    const below = tiles.find(t => t !== a && same(t) && Math.abs(t.x0 - a.x0) <= s * 0.1 && t.y0 > a.y1 && t.y0 - a.y1 < s * 0.5);
    if (!right || !below) continue;
    const diag = tiles.find(t => t !== a && same(t) && Math.abs(t.x0 - right.x0) <= s * 0.1 && Math.abs(t.y0 - below.y0) <= s * 0.1);
    if (diag) return [a, right, below, diag];
  }
  return null;
}

const GROUPS = [['wash', WASH], ['dry', DRY], ['iron', IRON], ['care', CARE]];

/**
 * The symbol of `group` inside `box` → { name, score, margin } or null. A blurred picture needs a
 * darker ink cut to keep its dots and digits apart, so a few cuts are tried and the best fit kept.
 */
export function readSymbol(img, box, group) {
  let best = null;
  for (const level of [0.25, 0.15, 0.4]) {
    const g = iconGlyph(img, box, level);
    if (!g) continue;
    const hit = matchIcon(group, g);
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

/**
 * The module picture (alone or inside a Discord screenshot) → { ok, current: { wash, dry, iron, care },
 * sure, scores } or { ok: false, reason }. `current` values are option names of the solver's lists.
 */
export function readLaundryModule(img) {
  const quad = twoByTwo(whiteTiles(img));
  if (!quad) return { ok: false, reason: 'No 2×2 block of white symbol tiles.' };
  const current = {}, scores = {};
  let sure = true;
  quad.forEach((t, i) => {
    const s = t.x1 - t.x0 + 1, m = Math.round(s * 0.1);
    const box = { x0: t.x0 + m, y0: t.y0 + m, x1: t.x1 - m, y1: t.y1 - m };
    const [group] = GROUPS[i];
    const best = readSymbol(img, box, group);
    if (!best) { current[group] = null; sure = false; return; }
    current[group] = best.name;
    scores[group] = best;
    if (best.score < 0.6 || best.margin < 0.04) sure = false;
  });
  return { ok: true, current, sure, scores, tiles: quad };
}

/**
 * Templates from the helper's symbol sheet (tests/fixtures/laundry_manual.png layout: 56 px white
 * squares, a row per group, special care on two rows). Used to (re)build laundryIcons.js.
 */
export function buildIconTemplates(img) {
  const at = (row, col) => {
    const ys = [38, 176, 314, 452, 562];
    const x0 = 42 + col * 140, y0 = ys[row];
    return { x0: x0 + 3, y0: y0 + 3, x1: x0 + 52, y1: y0 + 52 };
  };
  const enc = (box) => { const g = iconGlyph(img, box); return { f: encodeIcon(g.full), m: encodeIcon(g.marks), c: g.count }; };
  const out = { wash: {}, dry: {}, iron: {}, care: {} };
  WASH.forEach((n, i) => { out.wash[n] = enc(at(0, i)); });
  DRY.forEach((n, i) => { out.dry[n] = enc(at(1, i)); });
  IRON.forEach((n, i) => { out.iron[n] = enc(at(2, i)); });
  CARE.forEach((n, i) => { out.care[n] = enc(at(i < 6 ? 3 : 4, i % 6)); });
  return out;
}
