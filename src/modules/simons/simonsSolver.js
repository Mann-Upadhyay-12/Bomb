// Simon Says rules and glow detection (ported from the standalone simons.html, which read the
// game's GIFs correctly: the bot this replaced sampled the wrong spots and saw "yellow" everywhere).
//
// One screenshot / GIF = one stage. A GIF replays every flash so far; the LAST flash in it is the
// new colour for this stage. The manual is a table picture that CHANGES EVERY GAME (there is no
// built-in table): rows No vowel·Odd, No vowel·Even, Vowel·Odd, Vowel·Even; a column per flash
// colour (header text colour); each cell is filled with the colour to press. The row is picked by
// whether the bomb SERIAL has a vowel and whether an ODD or EVEN number of modules is disarmed.
// The serial is known (top bar), so both ODD and EVEN answers are shown.

export const SINAMES = { R: 'Red', B: 'Blue', Y: 'Yellow', G: 'Green' };

/**
 * table = { noVowel: { odd, even }, vowel: { odd, even } } (each { flash: press }) read from this
 * game's manual picture. Returns the { odd, even } maps for a serial with / without a vowel.
 */
export const simonRules = (table, hasVowel) => (table ? table[hasVowel ? 'vowel' : 'noVowel'] : null);

/** Flash colours → the presses for one serial / parity. */
export const simonPresses = (table, flashes, hasVowel, parity) => flashes.map(c => simonRules(table, hasVowel)[parity][c]);

// Tile centres as fractions of the module screenshot (diamond: Blue top, Red left, Green right,
// Yellow bottom) and their measured UNLIT colours.
export const SI_POS = { B: [0.50, 0.45], R: [0.38, 0.59], G: [0.63, 0.59], Y: [0.50, 0.72] };
export const SI_REF = { B: [21, 101, 192], R: [198, 40, 40], G: [46, 125, 50], Y: [249, 168, 37] };
// Total RGB change vs the unlit colour that counts as "lit" (a lit yellow only moves ~55)
const GLOW = 30;

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/** Mean colour of a small patch at each tile centre. data = RGBA pixels of a W×H image. */
export function siTileRGB(data, W, H) {
  const r = Math.max(2, Math.round(Math.min(W, H) * 0.025)), o = {};
  for (const k in SI_POS) {
    const cx = Math.round(SI_POS[k][0] * W), cy = Math.round(SI_POS[k][1] * H);
    const s = [0, 0, 0]; let n = 0;
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        const i = (y * W + x) * 4; s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
      }
    }
    o[k] = s.map(v => v / (n || 1));
  }
  return o;
}

/** Number of lit stage dots under the title (1..5) = how many flashes this stage should show. */
export function siStageOf(data, W, H) {
  let n = 0;
  for (const fx of [0.380, 0.442, 0.500, 0.558, 0.620]) {
    const cx = Math.round(fx * W), cy = Math.round(0.264 * H); let m = 0;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; m = Math.max(m, data[i], data[i + 1], data[i + 2]);
    }
    if (m >= 120) n++;
  }
  return n;
}

/** list of siTileRGB() results (one per frame) → glowing colour per frame (or null). */
export function siClassify(list) {
  const base = {};
  for (const k in SI_REF) {
    let b = SI_REF[k];
    // the clip's own typical colour is the unlit baseline when it is close to the reference
    if (list.length >= 3) {
      const m = [0, 1, 2].map(c => med(list.map(l => l[k][c])));
      if (dist(m, SI_REF[k]) <= 25) b = m;
    }
    base[k] = b;
  }
  return list.map(l => {
    let best = null, bs = GLOW;
    for (const k in l) { const s = dist(l[k], base[k]); if (s > bs) { bs = s; best = k; } }
    return best;
  });
}

/** Per-frame colours → flashes. A gap (no glow) between two frames of one colour = two flashes. */
export function siToFlashes(cols) {
  const fl = []; let prev = null;
  cols.forEach(c => {
    if (c) { if (c !== prev) fl.push({ c, n: 1 }); else fl[fl.length - 1].n++; }
    prev = c;
  });
  return fl;
}

/** Unlit tiles should be near the measured colours; if several aren't, the crop is probably off. */
export function siLayoutLooksOff(rgb) {
  return Object.keys(SI_REF).filter(k => dist(rgb[k], SI_REF[k]) > 80).length >= 2;
}

// Max distance from the unlit colour for a tile to count as "unlit" in the Simon check below
// (real frames sit at 0–15; a lit yellow only moves ~55, but only one tile is lit at a time)
const UNLIT = 60;

/** A real Simon frame has at least 3 of its 4 tiles at their unlit colours (only one is lit). */
export function siLooksLikeSimon(rgb) {
  return Object.keys(SI_REF).filter(k => dist(rgb[k], SI_REF[k]) <= UNLIT).length >= 3;
}

// ── Manual picture ───────────────────────────────────────────────────────────────────────────
// Filled cells use the same four colours as the module's unlit tiles; the header names each
// column's flash colour in lighter text (e.g. red text 255,82,82 · blue 56,115,164).
const CELL_TOL = 60;
const MANUAL_ROWS = [['noVowel', 'odd'], ['noVowel', 'even'], ['vowel', 'odd'], ['vowel', 'even']];

function hueClass(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 60) return null; // grey / white text and backgrounds
  let h;
  if (mx === r) h = (60 * ((g - b) / (mx - mn)) + 360) % 360;
  else if (mx === g) h = 60 * ((b - r) / (mx - mn)) + 120;
  else h = 60 * ((r - g) / (mx - mn)) + 240;
  if (h < 20 || h >= 330) return 'R';
  if (h >= 30 && h < 70) return 'Y';
  if (h >= 85 && h < 170) return 'G';
  if (h >= 190 && h < 260) return 'B';
  return null;
}

/**
 * Read the Simon manual table picture. data = RGBA of a W×H image.
 * Returns { noVowel: { odd, even }, vowel: { odd, even } } or null when it isn't the table.
 */
export function siReadManual(data, W, H) {
  // 1. pixels in one of the four cell colours
  const cls = new Int8Array(W * H).fill(-1), keys = Object.keys(SI_REF);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    for (let k = 0; k < 4; k++) {
      if (dist([data[i], data[i + 1], data[i + 2]], SI_REF[keys[k]]) <= CELL_TOL) { cls[p] = k; break; }
    }
  }
  // 2. big, mostly-filled blobs of one colour = cells (the text inside a cell only punches holes)
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), cells = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (cls[p0] < 0 || seen[p0]) continue;
    const k = cls[p0];
    let sp = 0, n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    stack[sp++] = p0; seen[p0] = 1;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && cls[p - 1] === k && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && cls[p + 1] === k && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && cls[p - W] === k && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && cls[p + W] === k && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw >= W * 0.08 && bh >= H * 0.08 && n >= bw * bh * 0.5) {
      cells.push({ c: keys[k], x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
  }
  if (cells.length !== 16) return null;
  // 3. 4 rows of 4, top to bottom / left to right; columns must line up
  cells.sort((a, b) => a.cy - b.cy);
  const rows = [0, 1, 2, 3].map(r => cells.slice(r * 4, r * 4 + 4).sort((a, b) => a.cx - b.cx));
  const rowH = rows[0][0].y1 - rows[0][0].y0;
  for (const row of rows) if (row[3].cy - row[0].cy > rowH * 0.5) return null;
  for (let c = 0; c < 4; c++) {
    for (const row of rows) if (Math.abs(row[c].cx - rows[0][c].cx) > (rows[0][c].x1 - rows[0][c].x0) * 0.3) return null;
  }
  // 4. header text colour above each column = the flash colour of that column
  const headBottom = rows[0].reduce((m, c) => Math.min(m, c.y0), H) - 2;
  const flashOf = rows[0].map(col => {
    const votes = { R: 0, B: 0, Y: 0, G: 0 };
    for (let y = 0; y < headBottom; y++) for (let x = col.x0; x <= col.x1; x++) {
      const i = (y * W + x) * 4, h = hueClass(data[i], data[i + 1], data[i + 2]);
      if (h) votes[h]++;
    }
    const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    return votes[best] >= 20 ? best : null;
  });
  if (flashOf.some(f => !f) || new Set(flashOf).size !== 4) return null;
  // 5. rows in the manual's order
  const table = { noVowel: { odd: {}, even: {} }, vowel: { odd: {}, even: {} } };
  MANUAL_ROWS.forEach(([v, p], r) => rows[r].forEach((cell, c) => { table[v][p][flashOf[c]] = cell.c; }));
  return table;
}

/**
 * Analyse decoded frames of one screenshot / GIF.
 * frames = [{ data }] all W×H. Returns { color, flashes, stage, warn, strip, thumbIndex, notSimon }.
 * notSimon = no frame looks like the module (e.g. the manual table image was pasted): no colour.
 */
export function siAnalyzeFrames(frames, W, H) {
  const rgb = frames.map(fr => siTileRGB(fr.data, W, H));
  if (!rgb.some(siLooksLikeSimon)) {
    return { color: null, flashes: [], stage: 0, warn: false, strip: '', thumbIndex: 0, notSimon: true };
  }
  const cols = siClassify(rgb);
  const fl = siToFlashes(cols);
  const last = fl.length ? fl[fl.length - 1].c : null;
  const stage = siStageOf(frames[0].data, W, H);
  let thumbIndex = 0;
  for (let i = cols.length - 1; i >= 0; i--) if (cols[i] && cols[i] === last) { thumbIndex = i; break; }
  return {
    color: last,
    flashes: fl.map(x => x.c),
    stage,
    warn: siLayoutLooksOff(rgb[0]),
    strip: cols.map(c => c || '·').join(''),
    thumbIndex,
    notSimon: false
  };
}
