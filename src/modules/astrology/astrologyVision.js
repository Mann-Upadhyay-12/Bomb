// Astrology vision: the glyphs are Denis Moskowitz's constellation symbols (public domain), drawn
// as thin white strokes. The same code reads the helper's sky map (88 glyphs in 4 quadrants) and the
// defuser's screenshot (star field + 4 buttons), and names a glyph by its shape distance to the
// built-in references (astroRefs.js, cut from a real map by scripts/build-astrology-refs.mjs).
//
// Shape distance: crop the glyph to its ink, pad to a square, scale to N×N, then the symmetric
// chamfer distance (mean distance from each ink pixel to the nearest ink pixel of the other glyph)
// plus a penalty for different aspect ratios. Stroke width and image size don't matter.

export const GLYPH_N = 40;

// White glyph ink: bright and grey (the map's dividers are brass, the button numbers are dimmer grey)
const isInk = (r, g, b, minMax) => {
  const mx = Math.max(r, g, b);
  return mx > minMax && mx - Math.min(r, g, b) < 60;
};
// the frame is orange (255,205,135); a recompressed copy fades it to ~(244,208,160), so no blue cap
const isBrass = (r, g, b) => r > 180 && r - b > 60;

/** Square dilation of a 0/1 mask by r (separable running max). */
function dilate(mask, W, H, r) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (mask[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (mask[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

/** 8-connected components of a mask → label array + count. */
function label(mask, W, H) {
  const lab = new Int32Array(W * H);
  let n = 0;
  const st = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; lab[s] = n; st.push(s);
    while (st.length) {
      const p = st.pop(), px = p % W, py = (p - px) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const q = y * W + x;
        if (mask[q] && !lab[q]) { lab[q] = n; st.push(q); }
      }
    }
  }
  return { lab, n };
}

/**
 * Glyphs in a region: ink pixels grouped when closer than ~2·r px.
 * Returns [{ x0, y0, x1, y1, n }] (bounding boxes of the ink, x1/y1 exclusive).
 */
function glyphBoxes(ink, W, H, r, minPx) {
  const { lab, n } = label(r > 0 ? dilate(ink, W, H, r) : ink, W, H);
  const box = Array.from({ length: n + 1 }, () => ({ x0: W, y0: H, x1: 0, y1: 0, n: 0 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!ink[i]) continue;
    const b = box[lab[i]];
    b.n++;
    if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y;
    if (x + 1 > b.x1) b.x1 = x + 1; if (y + 1 > b.y1) b.y1 = y + 1;
  }
  return box.slice(1).filter(b => b.n >= minPx);
}

/** Ink inside a box → normalised glyph { bits (N×N 0/1), aspect (w/h) }. */
export function normGlyph(ink, W, b) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, s = Math.max(w, h);
  const ox = b.x0 - (s - w) / 2, oy = b.y0 - (s - h) / 2;
  const N = GLYPH_N, bits = new Uint8Array(N * N), f = s / N;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      // area-average the source pixels under this cell
      const sx0 = ox + gx * f, sy0 = oy + gy * f;
      let on = 0, tot = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy0 + f); y++) {
        for (let x = Math.floor(sx0); x < Math.ceil(sx0 + f); x++) {
          tot++;
          if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && ink[y * W + x]) on++;
        }
      }
      if (tot && on / tot > 0.2) bits[gy * N + gx] = 1;
    }
  }
  return { bits, aspect: w / h };
}

// Exact squared Euclidean distance transform (Felzenszwalb–Huttenlocher), N×N grid
function edt1(f, n) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  return d;
}
export function distMap(bits) {
  const N = GLYPH_N, INF = 1e9, g = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = bits[i] ? 0 : INF;
  const col = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) col[y] = g[y * N + x];
    const d = edt1(col, N);
    for (let y = 0; y < N; y++) g[y * N + x] = d[y];
  }
  const row = new Float64Array(N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) row[x] = g[y * N + x];
    const d = edt1(row, N);
    for (let x = 0; x < N; x++) g[y * N + x] = Math.sqrt(d[x]);
  }
  return g;
}

/** Symmetric chamfer distance + aspect penalty. a, b = { bits, aspect, dt }. */
export function glyphCost(a, b) {
  if (!a.dt) a.dt = distMap(a.bits);
  if (!b.dt) b.dt = distMap(b.bits);
  let sa = 0, na = 0, sb = 0, nb = 0;
  for (let i = 0; i < a.bits.length; i++) {
    if (a.bits[i]) { sa += b.dt[i]; na++; }
    if (b.bits[i]) { sb += a.dt[i]; nb++; }
  }
  if (!na || !nb) return 99;
  return (sa / na + sb / nb) / 2 + 3 * Math.abs(Math.log(a.aspect / b.aspect));
}

/** Best reference names for a glyph: [{ name, cost }] sorted, plus margin to the runner-up. */
export function nameGlyph(g, refs) {
  const sc = refs.map(r => ({ name: r.name, cost: glyphCost(g, r) })).sort((a, b) => a.cost - b.cost);
  return { name: sc[0].name, cost: sc[0].cost, second: sc[1] ? sc[1].name : null, margin: sc[1] ? sc[1].cost - sc[0].cost : 99 };
}

// Packed glyph bits ⇄ base64 (references are stored this way)
export function packBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (i & 7); });
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
}
export function unpackBits(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bits = new Uint8Array(GLYPH_N * GLYPH_N);
  for (let i = 0; i < bits.length; i++) bits[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}

export const QUADS = ['TL', 'TR', 'BL', 'BR'];
export const QUAD_NAMES = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' };

/** Strongest brass line (column or row) inside [lo, hi) of the axis length. */
function brassLine(brass, W, H, vertical, lo, hi) {
  let best = -1, bestN = 0;
  const len = vertical ? W : H;
  for (let p = Math.floor(lo * len); p < Math.ceil(hi * len); p++) {
    let n = 0;
    if (vertical) { for (let y = 0; y < H; y++) n += brass[y * W + p]; } else { for (let x = 0; x < W; x++) n += brass[p * W + x]; }
    if (n > bestN) { bestN = n; best = p; }
  }
  return { at: best, n: bestN };
}

/**
 * Find the glyphs on a sky map (no naming). data = RGBA of a W×H image.
 * Returns { ink, glyphs: [{ box, cx, cy, quad, g }], midX, midY } — g = normalised glyph.
 */
export function segmentSkyMap(data, W, H) {
  const brass = new Uint8Array(W * H), ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    if (isBrass(data[p], data[p + 1], data[p + 2])) brass[i] = 1;
    else if (isInk(data[p], data[p + 1], data[p + 2], 90)) ink[i] = 1;
  }
  // quadrant dividers: the strongest brass column / row near the middle; frame: near the edges
  const vx = brassLine(brass, W, H, true, 0.3, 0.7), hy = brassLine(brass, W, H, false, 0.3, 0.7);
  const midX = vx.n > H * 0.3 ? vx.at : W / 2, midY = hy.n > W * 0.3 ? hy.at : H / 2;
  const fl = brassLine(brass, W, H, true, 0, 0.1), fr = brassLine(brass, W, H, true, 0.9, 1);
  const ft = brassLine(brass, W, H, false, 0, 0.1), fb = brassLine(brass, W, H, false, 0.9, 1);
  const X0 = fl.n > H * 0.3 ? fl.at + 3 : 0, X1 = fr.n > H * 0.3 ? fr.at - 3 : W;
  const Y0 = ft.n > W * 0.3 ? ft.at + 3 : 0, Y1 = fb.n > W * 0.3 ? fb.at - 3 : H;
  // drop ink outside the frame and on the dividers (a resized map blurs the brass into grey edges)
  const band = Math.max(2, Math.round(3 * W / 1024));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < X0 || x >= X1 || y < Y0 || y >= Y1 || Math.abs(x - midX) <= band || Math.abs(y - midY) <= band) ink[y * W + x] = 0;
    }
  }

  // Group strokes into glyphs. The right grouping distance scales with the map size, and blurring
  // (a resized screenshot) widens the gaps inside a glyph; every map has 88 glyphs, so try a few
  // distances around the expected one and keep the first that gives 88 (else the closest).
  const unit = W / 1024; // reference map width
  const minPx = Math.max(8, Math.round(30 * unit * unit));
  let boxes = null;
  const tried = new Set();
  for (const k of [3, 3.5, 2.5, 4, 2, 4.5, 5]) {
    const r = Math.max(1, Math.round(k * unit));
    if (tried.has(r)) continue;
    tried.add(r);
    const b = glyphBoxes(ink, W, H, r, minPx);
    if (!boxes || Math.abs(b.length - 88) < Math.abs(boxes.length - 88)) boxes = b;
    if (b.length === 88) break;
  }
  const glyphs = boxes.map(b => {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return { box: b, cx, cy, quad: (cy < midY ? 'T' : 'B') + (cx < midX ? 'L' : 'R'), g: normGlyph(ink, W, b) };
  });
  return { ink, glyphs, midX, midY };
}

/**
 * Read the helper's sky map and name every glyph.
 * Returns { glyphs: [{ box, cx, cy, quad, name, cost, margin }], byName: { name: quad }, midX, midY, dupes }.
 */
export function readSkyMap(data, W, H, refs) {
  const seg = segmentSkyMap(data, W, H);
  const glyphs = seg.glyphs.map(({ g, ...rest }) => ({ ...rest, ...nameGlyph(g, refs) }));
  // one glyph per name: keep the best-matching glyph when two read as the same name
  const byName = {}, best = {}, dupes = [];
  glyphs.forEach(g => {
    if (best[g.name]) {
      dupes.push(g.name);
      if (best[g.name].cost <= g.cost) return;
    }
    best[g.name] = g; byName[g.name] = g.quad;
  });
  return { glyphs, byName, midX: seg.midX, midY: seg.midY, dupes };
}

/**
 * Read the defuser's screenshot: count the stars in the sky panel and cut out the 4 button glyphs.
 * Layout fractions are from the 440×440 module image (same for any size).
 * Returns { stars, starBlobs, bigBlobs, buttons: [{ glyph, box, name, cost, second, margin } | null] }.
 */
export function readDefuser(data, W, H, refs, inkMin = 190) {
  // Stars: pure white cores in the sky panel (the joining lines and the glow are dimmer)
  const sx0 = Math.round(W * 0.11), sx1 = Math.round(W * 0.89), sy0 = Math.round(H * 0.2), sy1 = Math.round(H * 0.665);
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const star = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const p = ((y + sy0) * W + x + sx0) * 4;
    if (Math.min(data[p], data[p + 1], data[p + 2]) > 200) star[y * sw + x] = 1;
  }
  const blobs = glyphBoxes(star, sw, sh, 0, Math.max(3, Math.round(W * H * 0.00004)));
  const sizes = blobs.map(b => b.n).sort((a, b) => a - b);
  const med = sizes.length ? sizes[sizes.length >> 1] : 0;
  const bigBlobs = blobs.filter(b => b.n > med * 2.4).length; // maybe two stars touching
  const starBlobs = blobs.map(b => ({ x: sx0 + (b.x0 + b.x1) / 2, y: sy0 + (b.y0 + b.y1) / 2, n: b.n }));

  // Buttons: four panels across the bottom; glyph ink is bright white (the corner numbers are grey)
  const by0 = Math.round(H * 0.705), by1 = Math.round(H * 0.885);
  const edges = [0.1, 0.295, 0.5, 0.705, 0.9].map(f => Math.round(W * f));
  const buttons = [];
  for (let k = 0; k < 4; k++) {
    const x0 = edges[k], x1 = edges[k + 1], w = x1 - x0, h = by1 - by0;
    // The button number sits in the panel's top-left corner; the glyph is centred below it
    const cornerX = Math.round(W * 0.055), cornerY = Math.round(H * 0.04);
    const inCorner = (x, y) => x < cornerX && y < cornerY;
    // Ink cut-off relative to the brightest stroke (a soft or dim capture still reads), never below
    // the dim background lines
    let peak = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (inCorner(x, y)) continue;
      const p = ((y + by0) * W + x + x0) * 4;
      if (Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) < 60) peak = Math.max(peak, data[p], data[p + 1], data[p + 2]);
    }
    const cut = Math.max(110, Math.min(inkMin, peak * 0.62));
    const ink = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = ((y + by0) * W + x + x0) * 4;
      if (isInk(data[p], data[p + 1], data[p + 2], cut)) ink[y * w + x] = 1;
    }
    // drop the number (a part lying wholly in the corner)
    const parts = glyphBoxes(ink, w, h, 0, 2).filter(b => !(b.x1 <= cornerX + 1 && b.y1 <= cornerY + 1));
    for (let y = 0; y < cornerY; y++) for (let x = 0; x < cornerX; x++) if (!parts.some(b => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) ink[y * w + x] = 0;
    if (!parts.length) { buttons.push(null); continue; }
    const b = parts.reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1), n: a.n + c.n }));
    const glyph = normGlyph(ink, w, b);
    buttons.push({ glyph, box: { x0: b.x0 + x0, y0: b.y0 + by0, x1: b.x1 + x0, y1: b.y1 + by0 }, ...nameGlyph(glyph, refs) });
  }
  return { stars: blobs.length, starBlobs, bigBlobs, buttons };
}
