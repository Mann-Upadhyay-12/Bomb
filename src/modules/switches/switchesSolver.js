// Pure BFS pathfinding solver for 5-toggle switch state graphs

export function swNorm(s) {
  return (s || '').toUpperCase().replace(/[^UD]/g, '').slice(0, 5).padEnd(5, 'U');
}

export function swBFS(initial, goal, forbidden) {
  const forbidSet = new Set(forbidden);
  if (forbidSet.has(initial)) return null;
  if (initial === goal) return [initial];
  const prev = new Map([[initial, null]]);
  const queue = [initial];

  while (queue.length > 0) {
    const state = queue.shift();
    for (let i = 0; i < 5; i++) {
      const arr = state.split('');
      arr[i] = arr[i] === 'U' ? 'D' : 'U';
      const next = arr.join('');
      if (prev.has(next) || forbidSet.has(next)) continue;
      prev.set(next, state);
      if (next === goal) {
        const path = [];
        let cur = next;
        while (cur !== null) {
          path.unshift(cur);
          cur = prev.get(cur);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * The Helper's forbidden list, however it was pasted ("Forbidden: UDDUD, DDUUU", bullets, one per
 * line, arrows ↑↓) → the distinct 5-switch states, U = up, D = down. Only whole 5-letter U/D groups
 * count, so the words around them are ignored.
 */
export function swParseForbidden(text) {
  const up = String(text || '').toUpperCase().replace(/[↑⬆▲]/g, 'U').replace(/[↓⬇▼]/g, 'D');
  return [...new Set(up.match(/(?<![A-Z])[UD]{5}(?![A-Z])/g) || [])];
}

/** A path of states → the flips between them, "SW1 → SW4 …" */
export function swMoves(path) {
  if (!path) return '';
  return path.slice(1).map((s, i) => `SW${s.split('').findIndex((c, j) => c !== path[i][j]) + 1}`).join(' → ');
}
