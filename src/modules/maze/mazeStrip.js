// Maze manual strip: ONE image for every Maze on the bomb (the manual side). It holds N maze
// panels stacked top to bottom (or side by side) — any N, 1, 2, 8, 10 … Maze #n of the strip is
// Maze card #n. Every card subscribes to this store and reads its own maze's walls from it.
// The defuser's screenshot (red start dot, yellow goal dot) stays per card.
import { useSyncExternalStore } from 'react';
import { imageData, mzReadManual } from './mazeVision.js';
import { MAZE_SIZE as MZ_SIZE } from './mazeSolver.js';

// state.mazes[i] = { grid, count, fallback, thumb } | null
let state = { mazes: [], version: 0 };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());
const set = (mazes) => { state = { mazes, version: state.version + 1 }; emit(); };

export const mazeManualStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  /** a whole strip: replaces every maze */
  setAll: (mazes) => set(mazes),
  /** one maze for card i (a single-maze manual, or the sample) — the others stay */
  setOne: (i, maze) => { const m = state.mazes.slice(); while (m.length < i) m.push(null); m[i] = maze; set(m); },
  clear: () => set([])
};

export function useMazeManual() {
  return useSyncExternalStore(mazeManualStore.subscribe, mazeManualStore.get);
}

// Thumbnail of one maze: its board cropped out, with the detected walls drawn in pink on top
// (they should sit exactly on the black walls).
function thumbOf(srcCanvas, geom, grid, size = 120) {
  try {
    const { gx, gy, gw } = geom, pad = gw * 0.04, cs = gw + 2 * pad, k = size / cs, cw = gw / MZ_SIZE;
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const x = cv.getContext('2d');
    x.fillStyle = '#101216'; x.fillRect(0, 0, size, size);
    x.drawImage(srcCanvas, gx - pad, gy - pad, cs, cs, 0, 0, size, size);
    x.strokeStyle = 'rgba(255,61,184,.95)'; x.lineWidth = 1.5; x.beginPath();
    for (let r = 0; r < MZ_SIZE; r++) for (let c = 0; c < MZ_SIZE; c++) {
      const w = grid[r][c];
      if (c < MZ_SIZE - 1 && w.r) { const X = (pad + (c + 1) * cw) * k; x.moveTo(X, (pad + r * cw) * k); x.lineTo(X, (pad + (r + 1) * cw) * k); }
      if (r < MZ_SIZE - 1 && w.d) { const Y = (pad + (r + 1) * cw) * k; x.moveTo((pad + c * cw) * k, Y); x.lineTo((pad + (c + 1) * cw) * k, Y); }
    }
    x.stroke();
    return cv.toDataURL('image/png');
  } catch (e) { return null; }
}

/**
 * Read a manual image and hand its mazes to the cards.
 * - a strip of n mazes → maze #n to card #n (replaces the old manual)
 * - a single maze → only card `target` (the card it was pasted / dropped on)
 * @returns number of mazes found
 */
export function loadMazeManual(img, target = 0) {
  const { data, W, H, canvas } = imageData(img);
  const mazes = mzReadManual(data, W, H).map(m => ({
    grid: m.grid, count: m.count, fallback: m.fallback, thumb: thumbOf(canvas, m.geom, m.grid)
  }));
  if (mazes.length === 1) mazeManualStore.setOne(target, mazes[0]);
  else mazeManualStore.setAll(mazes);
  return mazes.length;
}
