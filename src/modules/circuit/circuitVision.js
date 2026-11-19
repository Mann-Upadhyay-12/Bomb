// Circuit screenshot reader (pure pixel maths on RGBA data, so it also runs in tests).
// - resistors: the thick blobs (wires are ~3 px lines, terminal dots are small circles)
// - terminals: the orange (amber) dots
// - nodes: each connected piece of wire outside the resistors is one electrical node

const PANEL = [31, 34, 40]; // inner panel fill
const WIRE = [203, 213, 225];

/** Resistor body colour → name (the game uses Tailwind colours: violet-600, blue-600 …). */
export function classifyColor(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = mx - mn;
  if (s < 30) return l > 200 ? 'white' : 'gray';
  let h;
  if (mx === r) h = ((g - b) / s) * 60;
  else if (mx === g) h = (2 + (b - r) / s) * 60;
  else h = (4 + (r - g) / s) * 60;
  if (h < 0) h += 360;
  if (h < 14 || h >= 330) return 'red';
  if (h < 36) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 175) return 'green';
  if (h < 245) return 'blue';
  return 'violet';
}

const isAmber = (r, g, b) => r > 200 && g > 120 && g < 190 && b < 70;

// The inner panel: the largest patch of pixels closest to the panel fill (not the page or the frame,
// which are only a few shades away — JPEG / resizing blur them together otherwise).
const PAGE = [22, 25, 29], FRAME = [44, 48, 54];
function findPanel(data, W, H) {
  const d2 = (i, c) => (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4, dp = d2(i, PANEL);
    mask[p] = dp <= 300 && dp < d2(i, PAGE) && dp < d2(i, FRAME) ? 1 : 0;
  }
  const { comps } = components(mask, W, H, false);
  const big = comps.sort((a, b) => b.n - a.n)[0];
  if (!big || big.n < W * H * 0.15) return { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  const pad = 3;
  return { x0: big.x0 + pad, y0: big.y0 + pad, x1: big.x1 - pad, y1: big.y1 - pad };
}

function components(mask, w, h, conn8 = true) {
  const lab = new Int32Array(w * h), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length + 1, st = [s];
    lab[s] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
    while (st.length) {
      const p = st.pop(), px = p % w, py = (p / w) | 0;
      n++; sx += px; sy += py;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!conn8 && dx && dy) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    comps.push({ id, x0, y0, x1, y1, n, cx: sx / n, cy: sy / n });
  }
  return { lab, comps };
}

/**
 * @returns {{ ok, error?, panel, resistors:[{x,y,w,h,color,rgb,a,b,horizontal}], terminals:[{x,y,node}], A, B }}
 *   coordinates are in image pixels; a/b/A/B are node ids
 */
export function readCircuit(data, W, H) {
  const P = findPanel(data, W, H);
  const w = P.x1 - P.x0 + 1, h = P.y1 - P.y0 + 1;
  if (w < 40 || h < 40) return { ok: false, error: 'Circuit panel not found' };
  const px = (x, y) => ((P.y0 + y) * W + P.x0 + x) * 4;

  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = px(x, y);
    const d = Math.max(Math.abs(data[i] - PANEL[0]), Math.abs(data[i + 1] - PANEL[1]), Math.abs(data[i + 2] - PANEL[2]));
    ink[y * w + x] = d > 22 ? 1 : 0;
  }
  // resistor bodies carry dark label text — fill it in so the body counts as solid
  // (summed-area table → "is every pixel in this square ink?")
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.02));
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    sat[(y + 1) * (w + 1) + x + 1] = ink[y * w + x] + sat[y * (w + 1) + x + 1] + sat[(y + 1) * (w + 1) + x] - sat[y * (w + 1) + x];
  }
  const boxSum = (x0, y0, x1, y1) => sat[(y1 + 1) * (w + 1) + x1 + 1] - sat[y0 * (w + 1) + x1 + 1] - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
  const core = new Uint8Array(w * h);
  const side = 2 * r + 1, need = side * side * 0.82; // label text leaves small dark holes
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    if (boxSum(x - r, y - r, x + r, y + r) >= need) core[y * w + x] = 1;
  }
  const { comps: cores } = components(core, w, h);

  const resistors = [];
  for (const c of cores) {
    const x0 = Math.max(0, c.x0 - r), y0 = Math.max(0, c.y0 - r), x1 = Math.min(w - 1, c.x1 + r), y1 = Math.min(h - 1, c.y1 + r);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const long = Math.max(bw, bh), short = Math.min(bw, bh);
    if (long / short < 1.3 || short < r * 2.5) continue; // terminal dots, junction blobs
    // body colour: the most common colour inside (ignores the label text)
    const hist = new Map();
    for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) {
      const i = px(x, y);
      const k = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
    let bestK = 0, bestN = -1;
    hist.forEach((n, k) => { if (n > bestN) { bestN = n; bestK = k; } });
    const rgb = [((bestK >> 10) & 31) * 8 + 4, ((bestK >> 5) & 31) * 8 + 4, (bestK & 31) * 8 + 4];
    // where a diagonal wire meets another, the wedge looks thick: it is wire-coloured (slate-300),
    // while white resistors are brighter (gray-100) — and a body is mostly one flat colour
    if ((rgb[0] - WIRE[0]) ** 2 + (rgb[1] - WIRE[1]) ** 2 + (rgb[2] - WIRE[2]) ** 2 < 22 ** 2) continue;
    let flat = 0, area = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = px(x, y); area++;
      if ((data[i] - rgb[0]) ** 2 + (data[i + 1] - rgb[1]) ** 2 + (data[i + 2] - rgb[2]) ** 2 <= 1600) flat++;
    }
    if (flat < area * 0.4) continue;
    // tighten the box to the body colour: the rough box is a few px too big, and a wire passing
    // close by (a diagonal skimming a corner) must not be cut off by it
    let tx0 = w, ty0 = h, tx1 = -1, ty1 = -1;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) {
      const i = px(x, y);
      if ((data[i] - rgb[0]) ** 2 + (data[i + 1] - rgb[1]) ** 2 + (data[i + 2] - rgb[2]) ** 2 > 1600) continue;
      if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
    }
    const box = tx1 >= 0 ? { x0: tx0, y0: ty0, x1: tx1, y1: ty1 } : { x0, y0, x1, y1 };
    resistors.push({ ...box, rough: { x0, y0, x1, y1 }, horizontal: box.x1 - box.x0 >= box.y1 - box.y0, rgb, color: classifyColor(...rgb) });
  }
  if (!resistors.length) return { ok: false, error: 'No resistors found — paste the Circuit screenshot' };

  // conductors: ink outside the resistor boxes (wires + terminal dots)
  // a resistor's blurred edge isn't wire: drop everything within 2 px of the body, and anything
  // in the rough box that isn't wire-coloured (light grey) — but keep a wire skimming past a corner
  const wireColour = (i) => { const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); return mx - mn < 45 && mx > 140; };
  const inRes = (x, y) => resistors.some(q => {
    if (x >= q.x0 - 2 && x <= q.x1 + 2 && y >= q.y0 - 2 && y <= q.y1 + 2) return true;
    const R = q.rough;
    return x >= R.x0 - 1 && x <= R.x1 + 1 && y >= R.y0 - 1 && y <= R.y1 + 1 && !wireColour(px(x, y));
  });
  const cond = new Uint8Array(w * h), amber = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!ink[y * w + x] || inRes(x, y)) continue;
    cond[y * w + x] = 1;
    const i = px(x, y);
    if (isAmber(data[i], data[i + 1], data[i + 2])) amber[y * w + x] = 1;
  }
  const { lab, comps: wires } = components(cond, w, h);

  // the node at each end of a resistor: first wire found just outside the box, near its middle
  const nodeAt = (q, end) => {
    const midX = (q.x0 + q.x1) >> 1, midY = (q.y0 + q.y1) >> 1;
    const spread = q.horizontal ? (q.y1 - q.y0) >> 1 : (q.x1 - q.x0) >> 1;
    const votes = new Map();
    for (let d = 2; d <= r * 3 + 4; d++) {
      for (let s = -spread; s <= spread; s++) {
        let x, y;
        if (q.horizontal) { x = end ? q.x1 + d : q.x0 - d; y = midY + s; }
        else { x = midX + s; y = end ? q.y1 + d : q.y0 - d; }
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const L = lab[y * w + x];
        if (L) votes.set(L, (votes.get(L) || 0) + 1);
      }
      if (votes.size) break;
    }
    let best = null, bn = 0;
    votes.forEach((n, L) => { if (n > bn) { bn = n; best = L; } });
    return best;
  };
  resistors.forEach(q => { q.a = nodeAt(q, 0); q.b = nodeAt(q, 1); });

  const { comps: dots } = components(amber, w, h);
  const minDot = Math.max(6, r * r * 0.6);
  const terminals = dots.filter(d => d.n >= minDot).map(d => {
    const counts = new Map();
    for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0; x <= d.x1; x++) {
      const L = lab[y * w + x];
      if (L) counts.set(L, (counts.get(L) || 0) + 1);
    }
    let node = null, bn = 0;
    counts.forEach((n, L) => { if (n > bn) { bn = n; node = L; } });
    return { x: P.x0 + d.cx, y: P.y0 + d.cy, node };
  }).sort((p, q) => p.x - q.x || p.y - q.y);

  const out = resistors
    .sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0)
    .map(q => ({
      x: P.x0 + q.x0, y: P.y0 + q.y0, w: q.x1 - q.x0 + 1, h: q.y1 - q.y0 + 1,
      horizontal: q.horizontal, rgb: q.rgb, color: q.color, a: q.a, b: q.b
    }));
  const unconnected = out.filter(q => q.a == null || q.b == null).length;
  let error = null;
  if (terminals.length !== 2) error = `Found ${terminals.length} orange terminal${terminals.length === 1 ? '' : 's'} (need 2)`;
  else if (unconnected) error = `${unconnected} resistor${unconnected > 1 ? 's' : ''} not connected to a wire on both ends`;
  return {
    ok: !error, error, panel: P, resistors: out, terminals,
    A: terminals[0] ? terminals[0].node : null, B: terminals[1] ? terminals[1].node : null,
    nodeCount: wires.length
  };
}
