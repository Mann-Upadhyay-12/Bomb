// Shared store for the Symbols reference strip.
// The strip can hold several 5×5 grids per Symbols module: each grid has a `group` (puzzle number, 0-based).
// A paste in any Symbols window fills this store, and window #n adds up the grids of group n.
import { useSyncExternalStore } from 'react';

let state = { grids: [], version: 0 };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

export const stripStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  setGrids: (grids) => { state = { grids, version: state.version + 1 }; emit(); },
  setCell: (gi, ci, k) => {
    state = {
      ...state,
      grids: state.grids.map((g, i) => (i === gi ? { ...g, cells: g.cells.map((x, j) => (j === ci ? k : x)) } : g))
    };
    emit();
  },
  setGroup: (gi, group) => {
    state = { ...state, grids: state.grids.map((g, i) => (i === gi ? { ...g, group } : g)) };
    emit();
  },
  removeGrid: (gi) => { state = { ...state, grids: state.grids.filter((_, i) => i !== gi) }; emit(); }
};

export function useStrip() {
  return useSyncExternalStore(stripStore.subscribe, stripStore.get);
}
