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
