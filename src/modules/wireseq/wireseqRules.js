export const WS_DEFAULT_MANUAL = `Red
* first red occurrence: cut if connected to C.
* second red occurrence: cut if connected to C.
* third red occurrence: cut if connected to C.
* fourth red occurrence: cut if connected to B or C.
* fifth red occurrence: cut if connected to A.
* sixth red occurrence: cut if connected to B.
* seventh red occurrence: cut if connected to B or C.
* eighth red occurrence: cut if connected to A, B or C.
* ninth red occurrence: cut if connected to A, B or C.

Blue
* first blue occurrence: cut if connected to B or C.
* second blue occurrence: cut if connected to A.
* third blue occurrence: cut if connected to C.
* fourth blue occurrence: cut if connected to A, B or C.
* fifth blue occurrence: cut if connected to A or C.
* sixth blue occurrence: cut if connected to B or C.
* seventh blue occurrence: cut if connected to B.
* eighth blue occurrence: cut if connected to A, B or C.
* ninth blue occurrence: cut if connected to A.

Black
* first black occurrence: cut if connected to A, B or C.
* second black occurrence: cut if connected to A or C.
* third black occurrence: cut if connected to C.
* fourth black occurrence: cut if connected to A or B.
* fifth black occurrence: cut if connected to A or C.
* sixth black occurrence: cut if connected to A, B or C.
* seventh black occurrence: cut if connected to B or C.
* eighth black occurrence: cut if connected to B.
* ninth black occurrence: cut if connected to C.`;

const WS_ORD = {first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9};

export function wsParseManual(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[*\u2022\-]+/, '').trim().toLowerCase();
    const m = line.match(/^(\w+)\s+(red|blue|black)\s+occurrence:.*connected to\s+(.+?)\.?$/);
    if (!m || !(m[1] in WS_ORD)) continue;
    const letters = new Set((m[3].match(/\b[abc]\b/g) || []).map(s => s.toUpperCase()));
    (out[m[2]] = out[m[2]] || {})[WS_ORD[m[1]]] = letters;
  }
  return out;
}

export const WS_STAGES = 5;
export const wsBlankStage = () => [{ c: null, d: null }, { c: null, d: null }, { c: null, d: null }];

/**
 * Solve every stage in order. Occurrence counts carry across stages, so fixing an
 * earlier stage automatically re-flows all later ones.
 */
export function wsSolveAll(stages, rules) {
  const counts = { red: 0, blue: 0, black: 0 };
  return stages.map(stage => stage.map((w, i) => {
    if (!w.c || !w.d) return { i, state: 'empty' };
    counts[w.c]++;
    const n = counts[w.c];
    const rule = rules[w.c] && rules[w.c][n];
    if (!rule) return { i, w, n, state: 'norule' };
    return { i, w, n, state: rule.has(w.d) ? 'cut' : 'skip' };
  }));
}

/** Wires of each colour seen in stages before `stageIdx` (0-based). */
export function wsCountsBefore(stages, stageIdx) {
  const c = { red: 0, blue: 0, black: 0 };
  for (let s = 0; s < stageIdx; s++) stages[s].forEach(w => { if (w.c && w.d) c[w.c]++; });
  return c;
}

/**
 * Quick text input: "1REDA 2REDB 3BLUEC", "1RA 2RB 3BC", "RA BB", "CLEAR".
 * Returns { panel: [3 × {c,d}|null], count, clear }.
 */
export function wsParseQuick(text) {
  const out = { panel: [null, null, null], count: 0, clear: false };
  const t = (text || '').trim();
  if (!t) return out;
  if (/^(CLEAR|RESET|NONE|EMPTY)$/i.test(t)) { out.clear = true; return out; }
  let next = 1;
  for (const tok of t.split(/[\s,;]+/).filter(Boolean)) {
    const T = tok.trim().toUpperCase();
    if (!T) continue;
    const nm = T.match(/^([123])[-:]?(NONE|CLEAR|EMPTY)$/);
    if (nm) { out.panel[+nm[1] - 1] = { c: null, d: null }; out.count++; continue; }
    let slot = null, rest = T;
    const sm = T.match(/^([123])[-:/]*(.*)$/);
    if (sm) { slot = +sm[1]; rest = sm[2]; }
    rest = rest.replace(/^[^A-Z0-9]+/, '');
    const m = rest.match(/^(.*?)[-:\sTO]*([ABC])$/);
    if (!m) continue;
    const cs = m[1].replace(/[^A-Z]/g, ''), dest = m[2];
    let c = null;
    if (cs === 'RED' || cs === 'R') c = 'red';
    else if (cs === 'BLACK' || cs === 'BK' || cs === 'BLK' || cs === 'K') c = 'black';
    else if (['BLUE', 'BL', 'BLU', 'U', 'B'].includes(cs)) c = 'blue';
    if (!c) continue;
    if (slot === null) slot = next++;
    if (slot >= 1 && slot <= 3) { out.panel[slot - 1] = { c, d: dest }; out.count++; }
  }
  return out;
}

/**
 * Screenshot reader: follows each possible wire curve from slots 1-3 to A-C and picks
 * the colour/destination with the best coverage; reads the stage from the pager dots.
 * img = ImageData-like {data,width,height}. Ported from the original app.
 */
export function wsReadImage(img) {
  const { data: d, width: W, height: H } = img;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = [];
  for (let y = Math.floor(H * 0.35); y <= Math.floor(H * 0.65); y += 3) {
    for (let x = Math.floor(W * 0.35); x <= Math.floor(W * 0.65); x += 3) {
      const [r, g, b] = px(x, y), av = (r + g + b) / 3, ch = Math.max(r, g, b) - Math.min(r, g, b);
      if (av >= 15 && av <= 75 && ch < 20) lum.push(av);
    }
  }
  lum.sort((a, b) => a - b);
  const darkMed = lum.length ? lum[Math.floor(lum.length / 2)] : 40;
  const kind = (r, g, b) => {
    const av = (r + g + b) / 3, ch = Math.max(r, g, b) - Math.min(r, g, b);
    if (r > 105 && r - g > 25 && r - b > 25) return 'red';
    if (b > 85 && b - r > 18 && b - g > 10) return 'blue';
    if (av < darkMed - 6 && av < 50 && ch < 22) return 'black';
    return null;
  };
  const LX = 0.234 * W, RX = 0.764 * W;
  const Y = [0.3136, 0.507, 0.702].map(f => f * H);
  const tol = Math.max(2, Math.round(W / 160));
  const bez = t => t * t * (3 - 2 * t);
  const stage = [];
  for (let p = 0; p < 3; p++) {
    const best = { c: null, d: null, f: 0 };
    for (let dst = 0; dst < 3; dst++) {
      const hit = { red: 0, blue: 0, black: 0 };
      const N = 60; let tot = 0;
      for (let k = 4; k <= N - 4; k++) {
        const t = k / N, x = LX + (RX - LX) * t, y = Y[p] + (Y[dst] - Y[p]) * bez(t);
        tot++;
        const seen = {};
        for (let dy = -tol; dy <= tol; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = Math.round(x + dx), YY = Math.round(y + dy);
          if (X < 0 || X >= W || YY < 0 || YY >= H) continue;
          const kd = kind(...px(X, YY)); if (kd) seen[kd] = 1;
        }
        for (const kd in seen) hit[kd]++;
      }
      for (const kd of ['red', 'blue', 'black']) {
        const f = hit[kd] / tot;
        if (f > best.f) Object.assign(best, { c: kd, d: 'ABC'[dst], f });
      }
    }
    stage.push(best.f >= 0.55 ? { c: best.c, d: best.d } : { c: null, d: null });
  }
  let sx = 0, sn = 0;
  for (let y = Math.floor(H * 0.74); y <= Math.floor(H * 0.88); y++) {
    for (let x = Math.floor(W * 0.33); x <= Math.floor(W * 0.67); x++) {
      const [r, g, b] = px(x, y);
      if (r > 200 && g > 140 && g < 215 && b < 150 && r - b > 70) { sx += x; sn++; }
    }
  }
  let stageNo = null;
  if (sn >= 6) {
    const idx = Math.round((sx / sn / W - 0.4) / 0.05);
    if (idx >= 0 && idx <= 4) stageNo = idx + 1;
  }
  return { wires: stage, stageNo };
}
