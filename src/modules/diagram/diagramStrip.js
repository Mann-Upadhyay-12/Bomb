// Diagram strip: the game can show several DIAGRAM panels in one screenshot (stacked, or side by side).
// dgSplitPanels finds each panel so panel #n goes to Diagram card #n; dgStripStore hands the pieces
// to the cards (every card in the group subscribes, card n takes piece n).
import { useSyncExternalStore } from 'react';

const DARK = 30; // page background is ~(20,22,27); panel frame/body is lighter (≥ 31)

function runs(on, len, maxGap) {
  const out = [];
  let s = -1, last = -1;
  for (let i = 0; i < len; i++) {
    if (on(i)) { if (s < 0) s = i; last = i; }
    else if (s >= 0 && i - last > maxGap) { out.push([s, last + 1]); s = -1; }
  }
  if (s >= 0) out.push([s, last + 1]);
  return out;
}

/**
 * @param data RGBA pixels, W×H
 * @returns [{x,y,w,h}] panels in reading order (top→bottom, left→right); [] when there is only one
 */
export function dgSplitPanels(data, W, H) {
  const lit = (x, y) => { const i = (y * W + x) * 4; return Math.max(data[i], data[i + 1], data[i + 2]) >= DARK; };
  const rowFrac = y => { let n = 0; for (let x = 0; x < W; x++) n += lit(x, y); return n / W; };
  const colFrac = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) n += lit(x, y); return n / (y1 - y0); };
  const gap = Math.max(3, Math.round(Math.min(W, H) * 0.012)); // inner borders are thinner than the gap between panels

  const rowF = Array.from({ length: H }, (_, y) => rowFrac(y));
  const bands = runs(y => rowF[y] > 0.5, H, gap);
  const panels = [];
  for (const [y0, y1] of bands) {
    const bh = y1 - y0;
    const cols = runs(x => colFrac(x, y0, y1) > 0.5, W, gap);
    for (const [x0, x1] of cols) {
      const bw = x1 - x0;
      // a panel is roughly square; ignore slivers (title bars, borders)
      if (bw < 0.5 * bh || bh < 0.5 * bw || Math.min(bw, bh) < 60) continue;
      panels.push({ x: x0, y: y0, w: bw, h: bh });
    }
  }
  return panels.length > 1 ? panels : [];
}

let state = { pieces: [], version: 0, taken: new Set() };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

export const dgStripStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  /** pieces: [{ url, w, h }] */
  publish: (pieces) => { state = { pieces, version: state.version + 1, taken: new Set() }; emit(); },
  /** a card takes its piece once (so re-renders / later mounts don't apply it twice) */
  take: (i) => {
    if (state.taken.has(i) || !state.pieces[i]) return null;
    state.taken.add(i);
    return state.pieces[i];
  }
};

export function useDiagramStrip() {
  return useSyncExternalStore(dgStripStore.subscribe, dgStripStore.get);
}
