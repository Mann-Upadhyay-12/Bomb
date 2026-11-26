// Pipes: a grid of pipe pieces; each colour button turns every pipe of that colour 90° — clockwise or
// anticlockwise depending on the bomb, so both are solved.
// Solved when all pipes form ONE network with no loops and no open ends (a spanning tree of the
// grid). The defuser's picture never updates, so the answer is "press each colour N times".
//
// A piece is a 4-bit mask of its openings: N = 1, E = 2, S = 4, W = 8.

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]]; // bit, dx, dy, opposite

/** Turn a piece clockwise `times` quarter turns. */
export function rotCW(m, times = 1) {
  let r = m & 15;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) r = ((r << 1) | (r >> 3)) & 15;
  return r;
}

const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** Piece kind from its mask: end (1 opening), straight, elbow, tee, cross, empty. */
export function pieceKind(m) {
  const b = bits(m);
  if (b === 0) return 'empty';
  if (b === 1) return 'end';
  if (b === 2) return (m === (N | S) || m === (E | W)) ? 'straight' : 'elbow';
  if (b === 3) return 'tee';
  return 'cross';
}

/**
 * Is this board one network with no loops and no open ends?
 * masks: flat array (row-major) of cols×rows piece masks.
 */
export function isSolved(masks, cols, rows) {
  let edges = 0, cells = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const m = masks[y * cols + x];
      if (!m) continue;
      cells++;
      for (const [bit, dx, dy, opp] of DIRS) {
        if (!(m & bit)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false; // open end off the board
        if (!(masks[ny * cols + nx] & opp)) return false;               // open end into a closed side
        edges++;
      }
    }
  }
  edges /= 2;
  if (edges !== cells - 1) return false; // a connected network with cells-1 joints has no loop
  // connected?
  const start = masks.findIndex(m => m);
  if (start < 0) return false;
  const seen = new Uint8Array(masks.length);
  const st = [start];
  seen[start] = 1;
  let n = 1;
  while (st.length) {
    const p = st.pop(), x = p % cols, y = (p - x) / cols;
    for (const [bit, dx, dy] of DIRS) {
      if (!(masks[p] & bit)) continue;
      const q = (y + dy) * cols + x + dx;
      if (!seen[q]) { seen[q] = 1; n++; st.push(q); }
    }
  }
  return n === cells;
}

/**
 * cells: [{ mask, color }] row-major; colours = the distinct colour names.
 * dir: 1 = a press turns clockwise, -1 = anticlockwise.
 * Tries every 0–3 presses per colour. Returns { colors, solutions: [{ presses: {color: n}, total, masks }] }
 * with boards that look the same counted once, fewest presses first.
 */
export function solvePipes(cells, cols, rows, dir = 1) {
  const colors = [...new Set(cells.map(c => c.color).filter(Boolean))];
  const k = colors.length;
  const idx = cells.map(c => colors.indexOf(c.color));
  const seen = new Map();
  const total = 4 ** k;
  const press = new Array(k).fill(0);
  for (let code = 0; code < total; code++) {
    let c = code;
    for (let i = 0; i < k; i++) { press[i] = c % 4; c = (c - press[i]) / 4; }
    const masks = cells.map((cell, i) => (idx[i] < 0 ? cell.mask : rotCW(cell.mask, dir * press[idx[i]])));
    if (!isSolved(masks, cols, rows)) continue;
    const key = masks.join(',');
    const sum = press.reduce((a, b) => a + b, 0);
    if (!seen.has(key) || seen.get(key).total > sum) {
      seen.set(key, { presses: Object.fromEntries(colors.map((col, i) => [col, press[i]])), total: sum, masks });
    }
  }
  const solutions = [...seen.values()].sort((a, b) => a.total - b.total);
  return { colors, solutions };
}

/** "Red ×1, Blue ×2" (colours pressed 0 times left out; "no presses" when already solved). */
export function pressText(presses, colors) {
  const parts = colors.filter(c => presses[c]).map(c => `${c[0].toUpperCase()}${c.slice(1)} ×${presses[c]}`);
  return parts.length ? parts.join(', ') : 'no presses';
}
