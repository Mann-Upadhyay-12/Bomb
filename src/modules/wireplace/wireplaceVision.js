import { findModuleTitle, cropAroundTitle } from '../../utils/moduleCard.js';
// Wire Placement — pixel readers for the two pictures (no OCR, no DOM: they work on ImageData-like
// { data, width, height }, so the tests run them on the fixture PNGs).
//
//  • the MODULE: a 4×4 grid of tiles (columns A–D, rows 1–4), a grey peg in the middle of each
//    tile and a wire from peg to peg (yellow, blue, black, white, red …).
//    tests/fixtures/wireplace_module.png
//  • the TABLE (helper manual): a header of colour badges ("C3 wire is": one column per colour),
//    a colour badge down the left of each row ("Cut wire") and a cell code (A1 … D4) in each cell.
//    tests/fixtures/wireplace_table.png
//
// Both pictures use flat colours, so plain colour rules read them.

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
  return { h, s: mx ? d / mx : 0, v: mx };
}

export const WIRE_COLORS = ['black', 'blue', 'red', 'white', 'yellow', 'green', 'orange', 'purple'];

/**
 * Colour name of a wire / badge pixel, or null for the dark panel, the grey tiles and the pegs.
 * `darkMax` is the brightest channel of the background: a black wire is clearly darker than it.
 */
export function colorName(r, g, b, darkMax = 40) {
  const { h, s, v } = hsv(r, g, b);
  if (v < 120 && s < 0.35) return v <= darkMax - 8 ? 'black' : null;
  if (s < 0.18) return Math.min(r, g, b) > 200 ? 'white' : null;
  if (s < 0.35 || v < 90) return null;
  if (h < 15 || h >= 340) return 'red';
  if (h < 38) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}

const COLS = 'ABCD';
export const cellName = (c, r) => `${COLS[c]}${r + 1}`;

function px(img, x, y) {
  const p = (y * img.width + x) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2]];
}

/** Runs of indexes 0..n-1 where f(i) holds; short gaps (≤ gap) are bridged. */
function runs(n, f, gap = 0) {
  const out = [];
  let s = -1, last = -1;
  for (let i = 0; i < n; i++) {
    if (f(i)) {
      if (s < 0) s = i;
      else if (i - last - 1 > gap) { out.push([s, last]); s = i; }
      last = i;
    }
  }
  if (s >= 0) out.push([s, last]);
  return out;
}

/** The commonest colours among the given pixels, most common first: [[r, g, b, count]]. */
function topColors(img, x0, y0, x1, y1, step = 1, k = 3) {
  const counts = new Map();
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const [r, g, b] = px(img, x, y);
    const key = (r >> 2) << 16 | (g >> 2) << 8 | (b >> 2);
    const e = counts.get(key);
    if (e) e[3]++; else counts.set(key, [r, g, b, 1]);
  }
  return Array.from(counts.values()).sort((a, b) => b[3] - a[3]).slice(0, k);
}
const modeColor = (img, x0, y0, x1, y1, step = 1) => { const t = topColors(img, x0, y0, x1, y1, step, 1)[0]; return t ? t.slice(0, 3) : null; };

const near = (a, b, tol) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= tol;

// ───────────────────────────── module picture ─────────────────────────────

/**
 * The module picture → { ok, wires: [{ color, a, b, score }], tiles: { xs, ys, size } } or
 * { ok: false, reason }. `a` / `b` are cell names ("A1"), a before b in reading order.
 */
// The 4×4 board inside a bigger picture (a Discord screenshot): crop to the card around the
// WIRE PLACEMENT title. Card width ≈ 1.45 × title width; the card starts ≈ 1.35 title heights above it.
export function readWireBoard(img) {
  const direct = readBoardIn(img);
  if (direct.ok) return direct;
  const title = findModuleTitle(img);
  if (!title) return direct;
  const card = cropAroundTitle(img, title, { widthPerTitle: 1.45, heightPerWidth: 1.01, topPerTitle: 1.35 });
  if (card.width >= img.width * 0.9 && card.height >= img.height * 0.9) return direct;
  const inCard = readBoardIn(card);
  return inCard.ok ? { ...inCard, card: { x: card.offset.x, y: card.offset.y, w: card.width, h: card.height } } : direct;
}

function readBoardIn(img) {
  const { width: W, height: H } = img;
  // the panel behind the tiles and the tiles: the two commonest greys in the middle of the
  // picture, the panel being the darker one
  const greys = topColors(img, Math.floor(W * 0.2), Math.floor(H * 0.3), Math.floor(W * 0.8), Math.floor(H * 0.9), 2, 6)
    .filter(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 25 && Math.max(r, g, b) < 110).slice(0, 2);
  if (greys.length < 2) return { ok: false, reason: 'No dark panel with tiles.' };
  const panel = Math.max(...greys[0].slice(0, 3)) < Math.max(...greys[1].slice(0, 3)) ? greys[0].slice(0, 3) : greys[1].slice(0, 3);
  const pMax = Math.max(...panel);
  // a tile is a flat grey a little lighter than the panel
  const isTile = (x, y) => {
    const [r, g, b] = px(img, x, y);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx - mn < 25 && mx >= pMax + 10 && mx <= pMax + 70;
  };
  // the tiles sit inside the panel: keep to the panel's own box (the bezel outside is grey too)
  const panelRows = runs(H, y => { let n = 0; for (let x = 0; x < W; x += 2) if (near(px(img, x, y), panel, 12)) n++; return n > W * 0.25; }, 3);
  const panelCols = runs(W, x => { let n = 0; for (let y = 0; y < H; y += 2) if (near(px(img, x, y), panel, 12)) n++; return n > H * 0.25; }, 3);
  if (!panelRows.length || !panelCols.length) return { ok: false, reason: 'No dark panel.' };
  const py0 = panelRows[0][0], py1 = panelRows[panelRows.length - 1][1];
  const px0 = panelCols[0][0], px1 = panelCols[panelCols.length - 1][1];
  const pw = px1 - px0 + 1, ph = py1 - py0 + 1;
  // how much tile grey each row / column of the panel holds
  const rowP = new Float64Array(ph), colP = new Float64Array(pw);
  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) if (isTile(x, y)) { rowP[y - py0]++; colP[x - px0]++; }
  // Four equal tiles with equal gaps: try every tile size / gap / start and keep the one whose
  // tile bands are fullest and whose gaps are emptiest. (Wires and pegs cross the tiles, so the
  // tile bands are never full — plain runs split a row in two at its pegs.)
  const fitFour = (prof) => {
    const n = prof.length;
    const sum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + prof[i];
    const band = (a, b) => (b <= a ? 0 : (sum[Math.min(n, b)] - sum[Math.max(0, a)]) / (Math.min(n, b) - Math.max(0, a)));
    let best = null;
    for (let s = Math.max(8, Math.floor(n * 0.08)); s <= Math.floor(n * 0.24); s++) {
      for (let g = Math.max(2, Math.floor(s * 0.08)); g <= Math.ceil(s * 0.5); g++) {
        const span = 4 * s + 3 * g;
        for (let o = g; o + span + g <= n; o++) {
          let tile = 0, gap = 0;
          for (let k = 0; k < 4; k++) tile += band(o + k * (s + g), o + k * (s + g) + s);
          for (let k = 0; k <= 4; k++) gap += band(o + k * (s + g) - g, o + k * (s + g));
          const score = tile / 4 - gap / 5;
          if (!best || score > best.score) best = { score, s, g, o, tile: tile / 4, gap: gap / 5 };
        }
      }
    }
    return best;
  };
  const fr = fitFour(rowP), fc = fitFour(colP);
  if (!fr || !fc || fr.tile < fr.gap * 3 + 4 || fc.tile < fc.gap * 3 + 4 || Math.abs(fr.s - fc.s) > Math.max(fr.s, fc.s) * 0.25) {
    return { ok: false, reason: 'No 4×4 tile grid.' };
  }
  const xs = [0, 1, 2, 3].map(k => px0 + fc.o + k * (fc.s + fc.g) + (fc.s - 1) / 2);
  const ys = [0, 1, 2, 3].map(k => py0 + fr.o + k * (fr.s + fr.g) + (fr.s - 1) / 2);
  const size = ((fc.s + fc.g) + (fr.s + fr.g)) / 2; // tile pitch

  // every pair of neighbouring tiles: is there a wire along the line between their pegs?
  const darkMax = pMax;
  const probe = (c0, r0, c1, r1) => {
    const x0 = xs[c0], y0 = ys[r0], x1 = xs[c1], y1 = ys[r1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len; // across the line
    const reach = Math.round(size * 0.22);
    const votes = {};
    const STEPS = 15;
    for (let s = 0; s < STEPS; s++) {
      const t = 0.25 + 0.5 * s / (STEPS - 1);
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const here = {};
      for (let k = -reach; k <= reach; k++) {
        const x = Math.round(cx + nx * k), y = Math.round(cy + ny * k);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const name = colorName(...px(img, x, y), darkMax);
        if (name) here[name] = (here[name] || 0) + 1;
      }
      const top = Object.entries(here).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) votes[top[0]] = (votes[top[0]] || 0) + 1;
    }
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return best ? { color: best[0], score: best[1] / STEPS } : null;
  };
  const found = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    for (const [dc, dr, diag] of [[1, 0, false], [0, 1, false], [1, 1, true], [-1, 1, true]]) {
      const c1 = c + dc, r1 = r + dr;
      if (c1 < 0 || c1 > 3 || r1 > 3) continue;
      const hit = probe(c, r, c1, r1);
      if (hit && hit.score >= 0.8) found.push({ color: hit.color, a: cellName(c, r), b: cellName(c1, r1), score: hit.score, diag });
    }
  }
  // a peg holds one wire: straight wires first, then diagonals onto free pegs
  found.sort((p, q) => (p.diag - q.diag) || (q.score - p.score));
  const used = new Set(), wires = [];
  for (const w of found) {
    if (used.has(w.a) || used.has(w.b)) continue;
    used.add(w.a); used.add(w.b);
    wires.push({ color: w.color, a: w.a, b: w.b, score: w.score });
  }
  const order = n => (Number(n[1]) - 1) * 4 + COLS.indexOf(n[0]);
  wires.sort((p, q) => order(p.a) - order(q.a));
  if (!wires.length) return { ok: false, reason: 'No wires found on the board.' };
  return { ok: true, wires, tiles: { xs, ys, size } };
}

// ───────────────────────────── table picture ─────────────────────────────

// Cell-code glyphs of the table font: 8×12 ink fractions as hex (0 = none … f = full) and the
// width / height of the glyph, averaged over the 100 glyphs of tests/fixtures/wireplace_table.png.
export const GLYPH_W = 8, GLYPH_H = 12;
export const GLYPHS = {
  '1': { aspect: 0.318, g: '0147adc979ceffeeffffffff68dfffff06dfffff06dfffff06dfffff06dfffff06dfffff06dfffec06dffea604ad8730' },
  '2': { aspect: 0.671, g: '04cfe9306dffffa2cfe9cfe7ffa16ffcee608ffb6613efe7018efe5019efa5107efc1013fffffffdfffffffbfffffff9' },
  '3': { aspect: 0.685, g: '16dffb307effffb3dfd8dff9ef706ef956aacfd503dfffb20168cffb9a506efdff905dfedffcfff98dffffa325cfc820' },
  '4': { aspect: 0.743, g: '0006fd20002cff30007fff3002efff3017edff304dc8ff30bfcbffa6effffffeffffffff777afe850007fc100007d600' },
  A: { aspect: 0.771, g: '003ef500007ff91100bffb2201dfff3004edef6108f8cf910cf9efe42efffff66ffffffcbf501cfdee3008fefa1002ae' },
  B: { aspect: 0.765, g: 'fffffc50afffffd58ffaaffd8ff66ffa8ffccfd58fffffc38ffa9efd8ff61cfe8ff60bff8ffa9efd8fffffd74dfffc50' },
  C: { aspect: 0.815, g: '006cfca918effffb4fff9effcff500afdfd10035ff900000ff900000dfd10000aff300383efc8afe07ffffe8018cfc70' },
  D: { aspect: 0.85, g: 'effffa40bfffffc38fe9bff98fd31afe8fd306ff8fd305ff8fd306ff8fd308ff8fd32cfe8ffffff88fffffb26fffe920' }
};

/** A glyph's ink box sampled to GLYPH_W×GLYPH_H ink fractions. */
export function buildGlyph(mask, w, box) {
  const out = new Float32Array(GLYPH_W * GLYPH_H);
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  for (let gy = 0; gy < GLYPH_H; gy++) for (let gx = 0; gx < GLYPH_W; gx++) {
    const sx0 = box.x0 + gx * bw / GLYPH_W, sx1 = box.x0 + (gx + 1) * bw / GLYPH_W;
    const sy0 = box.y0 + gy * bh / GLYPH_H, sy1 = box.y0 + (gy + 1) * bh / GLYPH_H;
    let ink = 0, n = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      n++;
      if (mask[y * w + x]) ink++;
    }
    out[gy * GLYPH_W + gx] = n ? ink / n : 0;
  }
  return out;
}

const decodeGlyph = s => Float32Array.from(s, ch => parseInt(ch, 16) / 15);
export const encodeGlyph = g => Array.from(g, v => Math.round(v * 15).toString(16)).join('');

/** Best of `chars` for a glyph: { ch, score, margin } (score 1 = identical; margin = lead over the runner-up). */
function matchGlyph(g, aspect, chars) {
  const all = [];
  for (const ch of chars) {
    const t = GLYPHS[ch];
    if (!t) continue;
    const tg = decodeGlyph(t.g);
    let d = 0;
    for (let i = 0; i < tg.length; i++) d += (tg[i] - g[i]) ** 2;
    all.push({ ch, score: 1 - Math.sqrt(d / tg.length) - Math.abs(Math.log(aspect / t.aspect)) * 0.3 });
  }
  all.sort((a, b) => b.score - a.score);
  return all.length ? { ...all[0], margin: all.length > 1 ? all[0].score - all[1].score : 1 } : null;
}

/** Connected ink blobs of a mask (8-connected): [{ x0, y0, x1, y1, n }]. */
function blobs(mask, w, h) {
  const seen = new Uint8Array(w * h), out = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    const b = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j - x) / w;
      b.n++;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    out.push(b);
  }
  return out;
}

/** The letter + digit in one table cell → { code: 'B1' | null, glyphs, sure }. */
export function readCellCode(img, box) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const fill = modeColor(img, box.x0, box.y0, box.x1, box.y1);
  const fl = lum(...fill);
  const mask = new Uint8Array(w * h);
  // text: well away from the cell's own colour and brighter than it
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = px(img, box.x0 + x, box.y0 + y);
    if (!near(c, fill, 90)) mask[y * w + x] = lum(...c) > fl + 50 ? 1 : 0;
  }
  let bs = blobs(mask, w, h);
  if (!bs.length) return { code: null, empty: true };
  const big = Math.max(...bs.map(b => b.n));
  // drop specks and the rounded corners' anti-aliasing (they hug the cell edge)
  bs = bs.filter(b => b.n >= big * 0.12 && b.x0 > 0 && b.x1 < w - 1 && b.y0 > 0 && b.y1 < h - 1);
  if (!bs.length) return { code: null, empty: true };
  const keep = new Uint8Array(w * h);
  bs.forEach(b => { for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (mask[y * w + x]) keep[y * w + x] = 1; });
  const X0 = Math.min(...bs.map(b => b.x0)), X1 = Math.max(...bs.map(b => b.x1));
  // the letter and the digit can touch (bold font): split at the emptiest column in the middle
  const colInk = x => { let n = 0; for (let y = 0; y < h; y++) n += keep[y * w + x]; return n; };
  let split = -1, least = Infinity;
  for (let x = Math.round(X0 + (X1 - X0) * 0.35); x <= Math.round(X0 + (X1 - X0) * 0.75); x++) {
    const n = colInk(x);
    if (n < least) { least = n; split = x; }
  }
  const part = (xa, xb) => {
    const b = { x0: w, y0: h, x1: -1, y1: -1 };
    for (let y = 0; y < h; y++) for (let x = xa; x <= xb; x++) if (keep[y * w + x]) {
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    }
    return b.x1 < 0 ? null : b;
  };
  const letter = part(X0, split - 1), digit = part(split + 1, X1);
  if (!letter || !digit) return { code: null, empty: false };
  const only = (b) => { const m = new Uint8Array(w * h); for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) m[y * w + x] = keep[y * w + x]; return m; };
  const glyphs = [letter, digit].map(b => ({ g: buildGlyph(only(b), w, b), aspect: (b.x1 - b.x0 + 1) / (b.y1 - b.y0 + 1) }));
  const L = matchGlyph(glyphs[0].g, glyphs[0].aspect, 'ABCD');
  const D = matchGlyph(glyphs[1].g, glyphs[1].aspect, '1234');
  if (!L || !D) return { code: null, empty: false, glyphs };
  return { code: L.ch + D.ch, sure: Math.min(L.margin, D.margin) > 0.1 && Math.min(L.score, D.score) > 0.55, score: Math.min(L.score, D.score), margin: Math.min(L.margin, D.margin), glyphs };
}

/**
 * The table picture → { ok, columns: [colour], rows: [{ color, cells: ['B1' | null] }], unsure: [[r, c]] }
 * or { ok: false, reason }.
 */
export function readWireTable(img) {
  const { width: W, height: H } = img;
  // background: the commonest colour along the picture's edge
  const edge = new Map();
  let bg = null, bgN = 0;
  const add = (x, y) => { const c = px(img, x, y); const k = c.join(','); const n = (edge.get(k) || 0) + 1; edge.set(k, n); if (n > bgN) { bgN = n; bg = c; } };
  for (let x = 0; x < W; x += 2) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y += 2) { add(0, y); add(W - 1, y); }
  if (!bg || lum(...bg) > 90) return { ok: false, reason: 'No dark background.' };
  const notBg = (x, y) => !near(px(img, x, y), bg, 18);
  const rowRuns = runs(H, y => { let n = 0; for (let x = 0; x < W; x += 2) if (notBg(x, y)) n++; return n > W * 0.5 * 0.3; }).filter(([a, b]) => b - a >= 8);
  const colRuns = runs(W, x => { let n = 0; for (let y = 0; y < H; y += 2) if (notBg(x, y)) n++; return n > H * 0.5 * 0.3; }).filter(([a, b]) => b - a >= 8);
  if (rowRuns.length < 3 || colRuns.length < 3) return { ok: false, reason: 'Not a table.' };
  const darkMax = Math.max(...bg);
  // the fill colour of a badge: the commonest named colour inside it
  const badge = (x0, y0, x1, y1) => {
    const n = {};
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
      const name = colorName(...px(img, x, y), darkMax);
      if (name) n[name] = (n[name] || 0) + 1;
    }
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    const area = ((y1 - y0) / 2 + 1) * ((x1 - x0) / 2 + 1);
    return best && best[1] > area * 0.3 ? best[0] : null;
  };
  const head = rowRuns[0];
  const columns = colRuns.slice(1).map(([x0, x1]) => badge(x0, head[0], x1, head[1]));
  if (columns.filter(Boolean).length < 2) return { ok: false, reason: 'No colour badges across the top.' };
  const left = colRuns[0];
  const rows = [], unsure = [];
  rowRuns.slice(1).forEach(([y0, y1], r) => {
    const color = badge(left[0], y0, left[1], y1);
    const cells = colRuns.slice(1).map(([x0, x1], c) => {
      const got = readCellCode(img, { x0, y0, x1, y1 });
      if (!got.code || !got.sure) unsure.push([r, c]);
      return got.code;
    });
    rows.push({ color, cells });
  });
  if (rows.filter(r => r.color).length < 2) return { ok: false, reason: 'No colour badges down the left.' };
  return { ok: true, columns, rows, unsure };
}

/** Which picture this is: 'board' | 'table' | null. */
export function classifyWirePicture(img) {
  const t = readWireTable(img);
  if (t.ok && t.rows.length >= 3 && t.rows.some(r => r.cells.some(Boolean))) return { type: 'table', table: t };
  const b = readWireBoard(img);
  if (b.ok) return { type: 'board', board: b };
  return { type: null, reason: t.reason || b.reason };
}
