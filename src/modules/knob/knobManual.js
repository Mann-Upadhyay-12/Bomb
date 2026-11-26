// The Knobs manual picture: four panels (UP, DOWN, LEFT, RIGHT), each a title over 8 rows × 6 of
// X (yellow) / O (grey). The table changes from game to game, so it's read from the picture into the
// same text the solver reads ("UP:" then one XOXOXX row per line).

const isX = (r, g, b) => r > 180 && g > 140 && b < 100 && r - b > 120;              // yellow X
const isO = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 40 && r > 90 && r < 185 && b > r; // grey O
const isTitle = (r, g, b) => r > 200 && g > 150 && b > 95 && b < 190 && r - b > 60;  // peach title

/** Connected pieces of a mask (8-connected) → { x0, y0, x1, y1, n, cx, cy }. */
function pieces(mask, W, H) {
  const seen = new Uint8Array(W * H), out = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    seen[s] = 1; stack.push(s);
    let n = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    out.push({ x0, y0, x1, y1, n, cx: sx / n, cy: sy / n });
  }
  return out;
}

/** Group items into rows by their centre y (a new row starts after a gap > half an item's height). */
function rowsOf(items) {
  const h = items.map(i => i.y1 - i.y0 + 1).sort((a, b) => a - b)[items.length >> 1] || 1;
  const sorted = items.slice().sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && it.cy - row[row.length - 1].cy < h * 0.5) row.push(it);
    else rows.push([it]);
  }
  return rows.map(r => r.sort((a, b) => a.cx - b.cx));
}

const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/** Which direction a title is: UP has 2 letters, RIGHT 5; DOWN and LEFT both 4, but only DOWN has a wide letter (W). */
function titleDir(letters) {
  if (letters.length === 2) return 'UP';
  if (letters.length === 5) return 'RIGHT';
  if (letters.length === 4) return letters.some(l => (l.x1 - l.x0 + 1) / (l.y1 - l.y0 + 1) > 1.1) ? 'DOWN' : 'LEFT';
  return null;
}

/**
 * Read the manual picture.
 * → { ok, reason?, dirs: { UP: ['OOOOXO', …8], … }, panels: [{ dir, box, rows }], problems: [] }
 */
export function readKnobManual(data, W, H) {
  // the page colour: the most common colour along the picture's edge
  const edge = new Map();
  const add = (x, y) => { const i = (y * W + x) * 4; const k = `${data[i] >> 2},${data[i + 1] >> 2},${data[i + 2] >> 2}`; edge.set(k, (edge.get(k) || 0) + 1); };
  for (let x = 0; x < W; x++) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y++) { add(0, y); add(W - 1, y); }
  const page = [...edge.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => Number(v) * 4 + 2);

  const notPage = new Uint8Array(W * H);
  const xMask = new Uint8Array(W * H), oMask = new Uint8Array(W * H), tMask = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if ((r - page[0]) ** 2 + (g - page[1]) ** 2 + (b - page[2]) ** 2 > 60) notPage[p] = 1;
    if (isX(r, g, b)) xMask[p] = 1;
    else if (isO(r, g, b)) oMask[p] = 1;
    else if (isTitle(r, g, b)) tMask[p] = 1;
  }
  const panelBoxes = pieces(notPage, W, H).filter(c => c.n >= W * H * 0.08);
  if (panelBoxes.length !== 4) return { ok: false, reason: `found ${panelBoxes.length} panels (need 4)`, dirs: null, panels: [], problems: [] };

  const inBox = (c, b) => c.cx >= b.x0 && c.cx <= b.x1 && c.cy >= b.y0 && c.cy <= b.y1;
  const marks = [
    ...pieces(xMask, W, H).map(c => ({ ...c, v: 'X' })),
    ...pieces(oMask, W, H).map(c => ({ ...c, v: 'O' }))
  ];
  const big = marks.map(m => m.n).sort((a, b) => b - a)[Math.min(marks.length - 1, 20)] || 1;
  const cells = marks.filter(m => m.n >= big * 0.3);
  const titleBits = pieces(tMask, W, H);

  const problems = [];
  const panels = rowsOf(panelBoxes).flat().map((b, k) => {
    const mine = cells.filter(c => inBox(c, b));
    const rows = rowsOf(mine).map(r => r.map(c => c.v).join(''));
    const tb = titleBits.filter(c => inBox(c, b));
    const tbig = Math.max(0, ...tb.map(c => c.n));
    const letters = tb.filter(c => c.n >= tbig * 0.15);
    const dir = titleDir(letters) || DIRS[k];
    if (rows.length !== 8 || rows.some(r => r.length !== 6)) problems.push(`${dir}: read ${rows.length} rows of ${rows.map(r => r.length).join('/')} (need 8 of 6)`);
    return { dir, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, rows, titleRead: Boolean(titleDir(letters)) };
  });
  const dirs = {};
  for (const p of panels) {
    if (dirs[p.dir]) problems.push(`two panels titled ${p.dir}`);
    dirs[p.dir] = p.rows;
  }
  const missing = DIRS.filter(d => !dirs[d]);
  if (missing.length) problems.push(`no ${missing.join(', ')} panel`);
  return { ok: !problems.length, reason: problems[0], dirs, panels, problems };
}

/** The panels as the solver's text: "UP:" then its rows, a blank line between directions. */
export function knobManualText(dirs, stamp = '') {
  const parts = DIRS.filter(d => dirs[d]).map(d => `${d}:\n${dirs[d].join('\n')}`);
  return (stamp ? `${stamp}\n` : '') + parts.join('\n\n');
}
