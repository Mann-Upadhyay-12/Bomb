// Computer vision for Maze walls and Start/Goal dots

import { MAZE_SIZE } from './mazeSolver.js';
import { getWorkCanvas, getWorkContext } from '../../utils/canvas.js';

// RGBA pixels of an image, shrunk so the longer side is at most `maxDim`
export function imageData(img, maxDim = 4000) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.min(1, maxDim / Math.max(iw, ih));
  const W = Math.max(1, Math.round(iw * sc)), H = Math.max(1, Math.round(ih * sc));
  const cv = getWorkCanvas();
  cv.width = W; cv.height = H;
  const ctx = getWorkContext();
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  return { data: ctx.getImageData(0, 0, W, H).data, W, H, canvas: cv };
}

// ── Manual strip (walls) ─────────────────────────────────────────────────────────────────
// The manual is one image for every Maze on the bomb: N maze panels stacked top to bottom
// (or side by side), each the size of a normal 440×440 screenshot. Maze #n of the strip is
// Maze card #n. Any N works: the panels are square, so N = the image's aspect ratio.

/** Cut a W×H manual into square panels, in reading order. One square image = one panel. */
export function mzSplitStrip(W, H) {
  if (!W || !H) return [];
  const tall = H >= W;
  const n = Math.max(1, Math.round(tall ? H / W : W / H));
  const step = (tall ? H : W) / n;
  return Array.from({ length: n }, (_, i) => tall
    ? { x: 0, y: Math.round(i * step), w: W, h: Math.round((i + 1) * step) - Math.round(i * step) }
    : { x: Math.round(i * step), y: 0, w: Math.round((i + 1) * step) - Math.round(i * step), h: H });
}

const blankGrid = () => Array.from({ length: MAZE_SIZE }, () =>
  Array.from({ length: MAZE_SIZE }, () => ({ u: false, d: false, l: false, r: false })));

/**
 * Walls of the maze inside `rect` of an RGBA image (from maze.html, the batch solver that works):
 * finds the light board, then a wall is any line within a few px of a cell edge that is mostly
 * dark along the middle of that edge — so a slightly shifted or rescaled screenshot still reads.
 * @returns {{ grid, geom: {gx,gy,gw,gh} (image px), count, fallback }}
 */
export function mzWallsFromData(data, W, H, rect = { x: 0, y: 0, w: W, h: H }) {
  const { x: ox, y: oy, w, h } = rect;
  const N = MAZE_SIZE;
  const lum = new Uint8Array(w * h), lt = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = ((oy + y) * W + ox + x) * 4, r = data[j], g = data[j + 1], b = data[j + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[y * w + x] = L;
    lt[y * w + x] = r > 150 && g > 150 && b > 150 && L > 165 ? 1 : 0;
  }
  // the light board, searched in the middle window (skips the title and the screws)
  const x0 = Math.floor(w * 0.08), x1 = Math.floor(w * 0.92), y0 = Math.floor(h * 0.18), y1 = Math.floor(h * 0.96);
  const rc = new Int32Array(h), cc = new Int32Array(w);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lt[y * w + x]) { rc[y]++; cc[x]++; }
  const span = (a, lo, hi) => {
    let m = 0; for (let i = lo; i < hi; i++) m = Math.max(m, a[i]);
    let s = -1, e = -1;
    for (let i = lo; i < hi; i++) if (m > 0 && a[i] >= m * 0.45) { if (s < 0) s = i; e = i; }
    return [s, e];
  };
  const [ty, by] = span(rc, y0, y1), [lx, rx] = span(cc, x0, x1), bw = rx - lx + 1, bh = by - ty + 1;
  let gx, gy, gw, gh, fallback = false;
  if (lx >= 0 && ty >= 0 && bw > w * 0.3 && Math.abs(bw - bh) < 0.12 * Math.max(bw, bh)) {
    const s = bw / 234; // the light area is the grid minus its 3 px black frame (at 440 px)
    gx = lx - 3 * s; gy = ty - 3 * s; gw = bw + 6 * s; gh = bh + 6 * s;
  } else {
    fallback = true; // the fixed spot of a 440×440 screenshot
    gx = 100 * w / 440; gy = 122 * h / 440; gw = 240 * w / 440; gh = 240 * h / 440;
  }
  const cw = gw / N, ch = gh / N, TOL = Math.max(2, Math.round(0.17 * cw)), DARK = 140, NEED = 0.7;
  const dark = (x, y) => lum[y * w + x] < DARK;
  const vWall = (r, c) => {
    const xl = Math.round(gx + (c + 1) * cw), ya = Math.round(gy + (r + 0.28) * ch), yb = Math.round(gy + (r + 0.72) * ch);
    let best = 0;
    for (let dx = -TOL; dx <= TOL; dx++) {
      const x = xl + dx; if (x < 0 || x >= w) continue;
      let n = 0, t = 0;
      for (let y = ya; y <= yb; y++) { if (y < 0 || y >= h) continue; t++; if (dark(x, y)) n++; }
      if (t) best = Math.max(best, n / t);
    }
    return best >= NEED;
  };
  const hWall = (r, c) => {
    const yl = Math.round(gy + (r + 1) * ch), xa = Math.round(gx + (c + 0.28) * cw), xb = Math.round(gx + (c + 0.72) * cw);
    let best = 0;
    for (let dy = -TOL; dy <= TOL; dy++) {
      const y = yl + dy; if (y < 0 || y >= h) continue;
      let n = 0, t = 0;
      for (let x = xa; x <= xb; x++) { if (x < 0 || x >= w) continue; t++; if (dark(x, y)) n++; }
      if (t) best = Math.max(best, n / t);
    }
    return best >= NEED;
  };
  const grid = blankGrid();
  let count = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (r === 0) grid[r][c].u = true;
    if (r === N - 1) grid[r][c].d = true;
    if (c === 0) grid[r][c].l = true;
    if (c === N - 1) grid[r][c].r = true;
    if (c < N - 1 && vWall(r, c)) { grid[r][c].r = true; grid[r][c + 1].l = true; count++; }
    if (r < N - 1 && hWall(r, c)) { grid[r][c].d = true; grid[r + 1][c].u = true; count++; }
  }
  return { grid, geom: { gx: gx + ox, gy: gy + oy, gw, gh }, count, fallback };
}

/** Every maze in a manual image (one panel or a strip of any length). */
export function mzReadManual(data, W, H) {
  return mzSplitStrip(W, H).map(rect => ({ rect, ...mzWallsFromData(data, W, H, rect) }));
}

/** Walls of a single maze screenshot (kept for callers that pass one image). */
export function detectMazeWalls(img) {
  const { data, W, H } = imageData(img);
  return mzWallsFromData(data, W, H).grid;
}

export function detectMazeDots(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width, h = canvas.height;

  const gx = 100 * (w / 440), gy = 122 * (h / 440), gw = 240 * (w / 440), gh = 240 * (h / 440);
  const N = MAZE_SIZE, cw = gw / N, ch = gh / N;

  let rSX = 0, rSY = 0, rCnt = 0;
  let ySX = 0, ySY = 0, yCnt = 0;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 180 && g < 100 && b < 100) {
        rSX += px; rSY += py; rCnt++;
      } else if (r > 180 && g > 180 && b < 100) {
        ySX += px; ySY += py; yCnt++;
      }
    }
  }

  let startPos = null;
  let goalPos = null;

  if (rCnt > 0) {
    const rx = rSX / rCnt, ry = rSY / rCnt;
    startPos = {
      r: Math.min(N - 1, Math.max(0, Math.floor((ry - gy) / ch))),
      c: Math.min(N - 1, Math.max(0, Math.floor((rx - gx) / cw)))
    };
  }
  if (yCnt > 0) {
    const yx = ySX / yCnt, yy = ySY / yCnt;
    goalPos = {
      r: Math.min(N - 1, Math.max(0, Math.floor((yy - gy) / ch))),
      c: Math.min(N - 1, Math.max(0, Math.floor((yx - gx) / cw)))
    };
  }

  return { startPos, goalPos };
}

export function isDotsImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let redCount = 0, yelCount = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g < 100 && b < 100) redCount++;
    if (r > 180 && g > 180 && b < 100) yelCount++;
  }
  return redCount > 10 || yelCount > 10;
}
