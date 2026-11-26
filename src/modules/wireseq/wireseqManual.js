// Wire Sequences manual picture reader (ported from conso/bomb2.0/wires-module.js — keep the two in step).
// Wire Sequences manual picture: a 3-column table (Red / Blue / Black header buttons) of 9 rows
// (First … Ninth); each cell lists the sockets to cut for that occurrence ("A, B, C" in yellow).
// Letters are told apart by their enclosed holes (A 1, B 2, C 0) — no font needed.

const PAGE = [31, 34, 40];
const d2 = (data, i, c) => (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;
const isYellow = (r, g, b) => r > 150 && g > 110 && b < 110 && r - b > 90 && g - b > 60;

function components(mask, w, h) {
  const lab = new Int32Array(w * h), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length + 1, st = [s];
    lab[s] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    while (st.length) {
      const p = st.pop(), px = p % w, py = (p / w) | 0;
      n++;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if ((q === p - 1 && px === 0) || (q === p + 1 && px === w - 1)) continue;
        if (mask[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    comps.push({ id, x0, y0, x1, y1, n, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { lab, comps };
}

/** Holes in one glyph: background pockets (4-connected) inside its box that don't reach the edge. */
function holes(lab, id, W, g) {
  const w = g.w + 2, h = g.h + 2, bg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = g.x0 + x - 1, Y = g.y0 + y - 1;
    const inside = x > 0 && y > 0 && x < w - 1 && y < h - 1;
    bg[y * w + x] = inside && lab[Y * W + X] === id ? 0 : 1;
  }
  const { comps } = components(bg, w, h);
  // the outer background touches the padding ring; real holes are a few pixels at least
  return comps.filter(c => c.x0 > 0 && c.y0 > 0 && c.x1 < w - 1 && c.y1 < h - 1 && c.n >= 2).length;
}

/**
 * A, B or C. Holes first (A 1, B 2, C 0); a small picture can close a hole, so the outline decides
 * too: A is pointed at the top (narrow top rows), B has a straight full-height left edge.
 */
function letterOf(lab, g, W) {
  const at = (x, y) => lab[(g.y0 + y) * W + g.x0 + x] === g.id;
  const rowWidth = (y) => { let a = -1, b = -1; for (let x = 0; x < g.w; x++) if (at(x, y)) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a + 1; };
  const band = (y0, y1) => { let s = 0, n = 0; for (let y = y0; y <= y1; y++) { s += rowWidth(y); n++; } return s / (n || 1); };
  const q = Math.max(1, Math.round(g.h * 0.2));
  const pointed = band(0, q - 1) < 0.6 * band(g.h - q, g.h - 1);
  let leftRows = 0;
  const lw = Math.max(1, Math.round(g.w * 0.2));
  for (let y = 0; y < g.h; y++) { for (let x = 0; x < lw; x++) if (at(x, y)) { leftRows++; break; } }
  const straightLeft = leftRows >= g.h * 0.85;
  const h = holes(lab, g.id, W, g);
  if (h >= 2) return 'B';
  if (h === 1) return pointed || !straightLeft ? 'A' : 'B';
  return pointed ? 'A' : 'C';
}

/**
 * → { ok, rules: { red: { 1: ['C'], … }, blue, black }, problems: [], cells: [{ color, n, letters, box, sure }] }
 */
export function readWireManual(data, W, H) {
  const problems = [];
  // 1. boxes: everything that isn't page background, as 4-connected blobs
  const ink = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) ink[p] = d2(data, p * 4, PAGE) > 120 ? 1 : 0;
  const { comps } = components(ink, W, H);
  const big = comps.filter(c => c.w >= W * 0.08 && c.h >= H * 0.04 && c.n >= c.w * c.h * 0.6);
  if (big.length < 30) return { ok: false, problems: ['not the Wire Sequences manual (table cells not found)'] };

  // mean colour of a box's middle band, to find the coloured headers
  const mean = (b) => {
    const s = [0, 0, 0]; let n = 0;
    for (let y = Math.round(b.y0 + b.h * 0.15); y <= b.y1 - b.h * 0.15; y++) for (let x = b.x0 + 3; x <= b.x1 - 3; x++) {
      const i = (y * W + x) * 4; s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
    }
    return s.map(v => v / (n || 1));
  };
  big.forEach(b => { b.rgb = mean(b); });
  const pick = (test) => big.filter(b => test(...b.rgb)).sort((a, b) => b.n - a.n)[0];
  const red = pick((r, g, b) => r > 150 && r - g > 80 && r - b > 80);
  const blue = pick((r, g, b) => b > 150 && b - r > 80);
  // black header: dark button (with a light border) on the same row as the other two
  const top = red || blue;
  const black = top && big.filter(b => b !== red && b !== blue && Math.abs(b.cy - top.cy) < top.h * 0.5)
    .filter(b => Math.max(...b.rgb) < 110).sort((a, b) => b.cx - a.cx)[0];
  if (!red || !blue || !black) return { ok: false, problems: ['Red / Blue / Black headers not found'] };
  const cols = [['red', red], ['blue', blue], ['black', black]];

  // 2. cells: boxes under each header (same column), top to bottom = First … Ninth
  const lineY = Math.max(red.y1, blue.y1, black.y1);
  const rules = { red: {}, blue: {}, black: {} }, cells = [];
  const ylab = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) ylab[p] = isYellow(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) ? 1 : 0;
  const { lab, comps: glyphs } = components(ylab, W, H);

  for (const [color, head] of cols) {
    const col = big.filter(b => b.y0 > lineY && Math.abs(b.cx - head.cx) < head.w * 0.4).sort((a, b) => a.y0 - b.y0);
    if (col.length !== 9) problems.push(`${color}: ${col.length} cells (need 9)`);
    col.slice(0, 9).forEach((cell, k) => {
      const inCell = glyphs.filter(g => g.x0 >= cell.x0 && g.x1 <= cell.x1 && g.y0 >= cell.y0 && g.y1 <= cell.y1);
      const tall = Math.max(0, ...inCell.map(g => g.h));
      // letters are full height; commas are small
      const letters = inCell.filter(g => g.h >= tall * 0.7).sort((a, b) => a.x0 - b.x0);
      let read = letters.map(g => letterOf(lab, g, W));
      let sure = true;
      // the manual lists sockets in order, so three letters can only be A, B, C
      if (letters.length === 3) { if (read.join('') !== 'ABC') sure = false; read = ['A', 'B', 'C']; }
      else if (!letters.length || letters.length > 3) { sure = false; problems.push(`${color} ${k + 1}: ${letters.length} letters`); }
      else if (new Set(read).size !== read.length || read.join('') !== [...read].sort().join('')) {
        sure = false; problems.push(`${color} ${k + 1}: read ${read.join(', ')}`);
      }
      rules[color][k + 1] = [...new Set(read)].sort();
      cells.push({ color, n: k + 1, letters: rules[color][k + 1], box: { x0: cell.x0, y0: cell.y0, x1: cell.x1, y1: cell.y1 }, sure });
    });
  }
  return { ok: !problems.length, rules, problems, cells };
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
/** The rules as the manual text the solver reads ("first red occurrence: cut if connected to A or C."). */
export function wireManualText(rules, stamp = '') {
  const lines = [];
  for (const color of ['red', 'blue', 'black']) {
    lines.push(color[0].toUpperCase() + color.slice(1));
    for (let n = 1; n <= 9; n++) {
      const L = (rules[color] && rules[color][n]) || [];
      if (!L.length) continue;
      const list = L.length === 1 ? L[0] : L.length === 2 ? `${L[0]} or ${L[1]}` : `${L.slice(0, -1).join(', ')} or ${L[L.length - 1]}`;
      lines.push(`* ${ORD[n - 1]} ${color} occurrence: cut if connected to ${list}.`);
    }
    lines.push('');
  }
  return (stamp ? stamp + '\n' : '') + lines.join('\n').trim();
}

/** Is this picture the Wire Sequences manual? (the headers and table cells were found) */
export const isWireManual = (res) => Boolean(res && res.rules && res.cells && res.cells.length >= 20);
