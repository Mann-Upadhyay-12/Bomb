// Simon Says rules and glow detection (ported from the standalone simons.html, which read the
// game's GIFs correctly: the bot this replaced sampled the wrong spots and saw "yellow" everywhere).
//
// One screenshot / GIF = one stage. A GIF replays every flash so far; the LAST flash in it is the
// new colour for this stage. Each stage maps to a button through the Even and the Odd table, and
// both answers are shown side by side (the defuser knows how many modules are disarmed).

export const SINAMES = { R: 'Red', B: 'Blue', Y: 'Yellow', G: 'Green' };

export const SIMON_DEFAULT_RULES = `Even number of non-needy modules disarmed

* If red flashes, press red.
* If blue flashes, press green.
* If yellow flashes, press yellow.
* If green flashes, press blue.

Odd number of non-needy modules disarmed

* If red flashes, press green.
* If blue flashes, press red.
* If yellow flashes, press blue.
* If green flashes, press yellow.`;

export const SIL1 = { red: 'R', blue: 'B', yellow: 'Y', green: 'G' };

export function parseSimonRules(txt) {
  const m = { even: {}, odd: {} };
  let cur = null;
  for (const line of String(txt || '').split(/\r?\n/)) {
    const l = line.toLowerCase();
    if (/\beven\b/.test(l) && /number|modules|disarmed/.test(l) && !/flash/.test(l)) { cur = 'even'; continue; }
    if (/\bodd\b/.test(l) && /number|modules|disarmed/.test(l) && !/flash/.test(l)) { cur = 'odd'; continue; }
    const r = l.match(/(red|blue|yellow|green)\s+flashes.*?press\s+(red|blue|yellow|green)/);
    if (r && cur) m[cur][SIL1[r[1]]] = SIL1[r[2]];
  }
  for (const s of ['even', 'odd']) {
    for (const c of 'RBYG') {
      if (!m[s][c]) return null;
    }
  }
  return m;
}

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

/**
 * Analyse decoded frames of one screenshot / GIF.
 * frames = [{ data }] all W×H. Returns { color, flashes, stage, warn, strip, thumbIndex }.
 */
export function siAnalyzeFrames(frames, W, H) {
  const rgb = frames.map(fr => siTileRGB(fr.data, W, H));
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
    thumbIndex
  };
}
