// Logic solver: Boolean expressions parser & evaluator and OCR glyph recognition

export const GREEK_VARS = ['α', 'β', 'γ', 'δ'];
export const STAGE_SYMBOLS = ['α', 'β', 'γ', 'δ', ''];

export function parseManualText(text) {
  const vars = {};
  const re = /\b([PQRST])\s*[:=]\s*(TRUE|FALSE|T|F|1|0)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const val = m[2].toUpperCase();
    vars[m[1].toUpperCase()] = (val === 'T' || val === 'TRUE' || val === '1');
  }
  return vars;
}

export function evaluateExpression(src, greek, vars) {
  const s = src.replace(/=>|->/g, '→')
             .replace(/[!~]/g, '¬')
             .replace(/[&∧]/g, '^')
             .replace(/[|∨v]/g, 'V')
             .replace(/\s+/g, '');
  let p = 0;
  const peek = () => s[p];

  function imp() {
    const a = or();
    if (peek() === '→') {
      p++;
      const b = imp();
      return !a || b;
    }
    return a;
  }

  function or() {
    let a = and();
    while (peek() === 'V') {
      p++;
      const b = and();
      a = a || b;
    }
    return a;
  }

  function and() {
    let a = not();
    while (peek() === '^') {
      p++;
      const b = not();
      a = a && b;
    }
    return a;
  }

  function not() {
    if (peek() === '¬') {
      p++;
      return !not();
    }
    return atom();
  }

  function atom() {
    const c = peek();
    if (c === '(') {
      p++;
      const v = imp();
      if (peek() !== ')') throw new Error('missing )');
      p++;
      return v;
    }
    if (vars && c in vars) {
      p++;
      return vars[c];
    }
    if (GREEK_VARS.includes(c)) {
      p++;
      if (greek[c] === undefined) throw new Error(c + ' not solved yet');
      return greek[c];
    }
    throw new Error(c ? 'unexpected "' + c + '"' : 'incomplete');
  }

  if (!s) throw new Error('empty');
  const v = imp();
  if (p < s.length) throw new Error('unexpected "' + s[p] + '"');
  return v;
}

// ── Vision Engine ──
export function lumaOf(d, w, h) {
  const L = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    L[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  }
  return L;
}

export function labelComponents(mask, w, h, diag) {
  const labels = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = s; labels[s] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0, sx = 0, sy = 0;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!diag && dx && dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
      }
    }
    comps.push({ id, x0, y0, x1, y1, area, cx: sx / area, cy: sy / area });
  }
  return { labels, comps };
}

export function findTiles(L, w, h) {
  const n = w * h, hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[L[i]]++;
  let level = -1;
  for (let v = 0; v < 256; v++) {
    const c = (hist[v - 1] || 0) + hist[v] + (hist[v + 1] || 0);
    if (c > 0.03 * n) { level = v; break; }
  }
  if (level < 0) return null;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = Math.abs(L[i] - level) <= 7 ? 1 : 0;
  const { comps } = labelComponents(mask, w, h, false), m = Math.min(w, h);
  let cand = comps.filter(c => {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, ar = bw / bh;
    return bw >= 0.05 * m && bh >= 0.05 * m && bw <= 0.35 * m && bh <= 0.35 * m && ar > 0.6 && ar < 1.6 && c.area >= 0.55 * bw * bh;
  });
  if (cand.length < 6) return null;
  const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const mw = med(cand.map(c => c.x1 - c.x0 + 1)), mh = med(cand.map(c => c.y1 - c.y0 + 1));
  cand = cand.filter(c => Math.abs(c.x1 - c.x0 + 1 - mw) <= 0.2 * mw && Math.abs(c.y1 - c.y0 + 1 - mh) <= 0.2 * mh);
  if (cand.length < 6) return null;
  return { level, tiles: cand.map(c => ({ x: c.x0, y: c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 })) };
}

export function fallbackTiles(w, h) {
  const gx0 = 0.130 * w, gx1 = 0.866 * w, gy0 = 0.253 * h, gy1 = 0.631 * h, cw = (gx1 - gx0) / 5, ch = (gy1 - gy0) / 3, t = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    t.push({ x: Math.round(gx0 + c * cw), y: Math.round(gy0 + r * ch), w: Math.round(cw), h: Math.round(ch) });
  }
  return t;
}

export function groupRows(tiles) {
  const ts = tiles.slice().sort((a, b) => a.y - b.y), th = ts[0].h, rows = [];
  for (const t of ts) {
    const cy = t.y + t.h / 2, row = rows.find(r => Math.abs(r.cy - cy) < 0.5 * th);
    if (row) { row.t.push(t); row.cy = (row.cy * (row.t.length - 1) + cy) / row.t.length; }
    else rows.push({ cy, t: [t] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  rows.forEach(r => r.t.sort((a, b) => a.x - b.x));
  return rows.map(r => r.t);
}

export function extractGlyph(L, w, tile, thr) {
  const ix = Math.round(tile.w * 0.06), iy = Math.round(tile.h * 0.06);
  const x0 = tile.x + ix, y0 = tile.y + iy, tw = tile.w - 2 * ix, th = tile.h - 2 * iy;
  const m = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) m[y * tw + x] = L[(y0 + y) * w + x0 + x] > thr ? 1 : 0;
  const { labels, comps } = labelComponents(m, tw, th, true);
  if (!comps.length) return null;
  const big = Math.max(...comps.map(c => c.area));
  const keep = new Set(comps.filter(c => c.area >= Math.max(6, 0.03 * big)).map(c => c.id));
  let bx0 = tw, by0 = th, bx1 = -1, by1 = -1, area = 0;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (keep.has(labels[y * tw + x])) {
    area++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (area < 0.005 * tw * th) return null;
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, g = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (keep.has(labels[(by0 + y) * tw + bx0 + x])) g[y * bw + x] = 1;
  return { mask: g, w: bw, h: bh, area, tileW: tile.w, tileH: tile.h };
}

export function measure(g) {
  const { mask: m, w, h, area } = g;
  const reg = (xa, xb, ya, yb) => {
    const X0 = Math.floor(xa * w), X1 = Math.max(X0 + 1, Math.ceil(xb * w)), Y0 = Math.floor(ya * h), Y1 = Math.max(Y0 + 1, Math.ceil(yb * h));
    let c = 0; for (let y = Y0; y < Math.min(Y1, h); y++) for (let x = X0; x < Math.min(X1, w); x++) c += m[y * w + x];
    return c / area;
  };
  const meanX = (ya, yb) => {
    let s = 0, c = 0;
    for (let y = Math.floor(ya * h); y < Math.max(Math.floor(ya * h) + 1, Math.ceil(yb * h)); y++)
      for (let x = 0; x < w; x++) if (m[y * w + x]) { s += x; c++; }
    return c ? s / c / w : 0.5;
  };
  const iou = f => {
    let i = 0, u = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = m[y * w + x], b = m[f(x, y)]; if (a && b) i++; if (a || b) u++;
    }
    return u ? i / u : 0;
  };
  const W = w + 2, H = h + 2, bg = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) bg[(y + 1) * W + x + 1] = 0;
  const { comps } = labelComponents(bg, W, H, false);
  const holes = comps.filter(c => c.x0 > 0 && c.y0 > 0 && c.x1 < W - 1 && c.y1 < H - 1 && c.area >= Math.max(4, 0.012 * w * h));
  const big = holes.slice().sort((a, b) => b.area - a.area)[0];
  let leftRows = 0; const lw = Math.max(1, Math.round(0.14 * w));
  for (let y = 0; y < h; y++) { let hit = 0; for (let x = 0; x < lw; x++) hit |= m[y * w + x]; leftRows += hit; }
  let stem = 0;
  for (let x = 0; x < Math.max(1, Math.ceil(0.4 * w)); x++) {
    let c = 0; for (let y = 0; y < h; y++) c += m[y * w + x]; if (c / h > stem) stem = c / h;
  }
  return {
    stem, w, h, aspect: w / h, hRel: h / g.tileH, holes: holes.length, holeCy: big ? (big.cy - 1) / h : -1,
    TL: reg(0, .3, 0, .3), TC: reg(.3, .7, 0, .3), TR: reg(.7, 1, 0, .3),
    BL: reg(0, .3, .7, 1), BC: reg(.3, .7, .7, 1), BR: reg(.7, 1, .7, 1),
    ML: reg(0, .3, .3, .7), BRq: reg(.55, 1, .6, 1),
    topCover: (() => { let c = 0; const y1 = Math.max(1, Math.round(0.18 * h)); for (let x = 0; x < w; x++) { let k = 0; for (let y = 0; y < y1; y++) k |= m[y * w + x]; c += k; } return c / w; })(),
    endsX: (meanX(0, .2) + meanX(.8, 1)) / 2, midX: meanX(.35, .65),
    lr: iou((x, y) => y * w + (w - 1 - x)), rot: iou((x, y) => (h - 1 - y) * w + (w - 1 - x)), leftEdge: leftRows / h
  };
}

const TALL = 0.71;
const SHORT = 0.5;

export function classify(f) {
  const vPat = f.TL > 0.08 && f.TR > 0.08 && f.TC < 0.07 && f.BC > 0.12 && f.BL < 0.07 && f.BR < 0.07;
  const aPat = f.BL > 0.08 && f.BR > 0.08 && f.BC < 0.07 && f.TC > 0.12 && f.TL < 0.07 && f.TR < 0.07;
  if (f.holes === 0) {
    if (f.aspect < 0.62 && f.hRel > 0.45) return f.midX < f.endsX ? '(' : ')';
    if (f.hRel < SHORT) {
      if (vPat) return 'V';
      if (aPat) return '^';
      if (f.topCover > 0.7 && f.BR > f.BL + 0.05) return '¬';
      if (f.aspect > 1.5 && f.ML > 0.12 && f.TL < 0.06 && f.BL < 0.06) return '→';
      return '?';
    }
    if ((f.hRel >= 0.48 || f.BL > 0.08) && f.TL > 0.07 && f.TR > 0.05 && f.TC < 0.08) return 'γ';
    if (f.lr > 0.78 && f.topCover > 0.7) return 'T';
    if (f.rot > 0.45) return 'S';
    return '?';
  }
  if (f.holes >= 2) return 'β';
  if (f.holeCy > 0.6) return 'δ';
  if (f.hRel < SHORT && f.aspect >= 0.8) return 'α';
  if (f.stem < 0.85) return 'Q';
  if (f.hRel > TALL) return 'β';
  return f.BRq > 0.09 ? 'R' : 'P';
}

export function readLogicGrid(data, w, h) {
  const L = lumaOf(data, w, h);
  const found = findTiles(L, w, h);
  const tiles = found ? found.tiles : fallbackTiles(w, h);
  const level = found ? found.level : (() => { let m = 255; for (const t of tiles) m = Math.min(m, L[(t.y + 3) * w + t.x + 3]); return m; })();
  const hist = new Uint32Array(256); let tot = 0;
  for (const t of tiles) for (let y = t.y + 3; y < t.y + t.h - 3; y++) for (let x = t.x + 3; x < t.x + t.w - 3; x++) { hist[L[y * w + x]]++; tot++; }
  let acc = 0, gmax = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= 0.002 * tot) { gmax = v; break; } }
  if (gmax - level < 50) return { rows: [], text: '', tilesFound: !!found };
  const thr = level + 0.4 * (gmax - level);
  const rows = groupRows(tiles).map(r => r.map(t => {
    const g = extractGlyph(L, w, t, thr);
    if (!g) return null;
    const f = measure(g);
    return { sym: classify(f), f };
  }));
  const text = rows.map(r => r.filter(Boolean).map(c => c.sym).join('')).join('');
  return { rows, text, tilesFound: !!found };
}

export function detectStage(data, w, h) {
  let sx = 0, sy = 0, n = 0;
  for (let y = Math.floor(0.75 * h); y < Math.floor(0.95 * h); y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g > 140 && b < 150 && r - b > 60) { sx += x; sy += y; n++; }
  }
  if (!n) return { idx: 0, count: 0 };
  const cx = sx / n, cy = Math.round(sy / n), px = (x, y) => { const i = (y * w + x) * 4; return (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000; };
  const panel = px(Math.round(cx), Math.max(0, cy - Math.round(0.06 * h)));
  const runs = []; let start = -1, last = -9;
  for (let x = Math.floor(0.1 * w); x < Math.floor(0.9 * w); x++) {
    const dot = Math.abs(px(x, cy) - panel) > 6;
    if (dot) { if (start < 0) start = x; last = x; }
    else if (start >= 0 && x - last > 3) { runs.push([start, last]); start = -1; }
  }
  if (start >= 0) runs.push([start, last]);
  const dots = runs.filter(r => r[1] - r[0] >= 0.012 * w);
  if (dots.length >= 2) {
    let idx = 0, best = 1e9;
    dots.forEach((r, i) => { const d = Math.abs((r[0] + r[1]) / 2 - cx); if (d < best) { best = d; idx = i; } });
    return { idx, count: dots.length };
  }
  return { idx: Math.max(0, Math.round((cx / w - 0.396) / 0.0507)), count: 0 };
}
