// Pure Minesweeper constraint satisfaction & tank solver

export const MINES_ROWS = 8;
export const MINES_COLS = 10;

export function solveMinesGrid(gridData) {
  if (!gridData || !gridData.length) return { safeList: [], mineList: [] };

  // Reset solver flags
  for (let r = 0; r < MINES_ROWS; r++) {
    for (let c = 0; c < MINES_COLS; c++) {
      gridData[r][c].isSafe = false;
      gridData[r][c].isMine = false;
    }
  }

  function getNeighbors(r, c) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < MINES_ROWS && nc >= 0 && nc < MINES_COLS) {
          list.push(gridData[nr][nc]);
        }
      }
    }
    return list;
  }

  const constraints = [];
  for (let r = 0; r < MINES_ROWS; r++) {
    for (let c = 0; c < MINES_COLS; c++) {
      const cell = gridData[r][c];
      if (typeof cell.state === 'number' && cell.state >= 0) {
        const neighs = getNeighbors(r, c);
        let flags = 0;
        const coveredNeighs = [];
        neighs.forEach(n => {
          if (n.state === 'F') flags++;
          else if (n.state === '#') coveredNeighs.push(n);
        });
        constraints.push({ cell, reqMines: cell.state - flags, covered: coveredNeighs });
      }
    }
  }

  // Subset reduction logic
  let changed = true;
  while (changed) {
    changed = false;
    constraints.forEach(con => {
      const un = con.covered.filter(c => !c.isSafe && !c.isMine);
      const cur = con.covered.filter(c => c.isMine).length;
      const rem = con.reqMines - cur;
      if (rem === 0 && un.length > 0) {
        un.forEach(c => { c.isSafe = true; changed = true; });
      } else if (rem === un.length && un.length > 0) {
        un.forEach(c => { c.isMine = true; changed = true; });
      }
    });

    for (let i = 0; i < constraints.length; i++) {
      for (let j = 0; j < constraints.length; j++) {
        if (i === j) continue;
        const cA = constraints[i], cB = constraints[j];
        const unA = cA.covered.filter(c => !c.isSafe && !c.isMine);
        const unB = cB.covered.filter(c => !c.isSafe && !c.isMine);
        const remA = cA.reqMines - cA.covered.filter(c => c.isMine).length;
        const remB = cB.reqMines - cB.covered.filter(c => c.isMine).length;
        if (unA.length > 0 && unA.every(e => unB.includes(e))) {
          const diff = unB.filter(e => !unA.includes(e));
          const diffM = remB - remA;
          if (diffM === 0 && diff.length > 0) {
            diff.forEach(c => { c.isSafe = true; changed = true; });
          } else if (diffM === diff.length && diff.length > 0) {
            diff.forEach(c => { c.isMine = true; changed = true; });
          }
        }
      }
    }
  }

  // Tank solver for frontier up to 24 unrevealed cells
  const fMap = new Map();
  constraints.forEach(con => {
    con.covered.filter(c => !c.isSafe && !c.isMine).forEach(u => fMap.set(u.name, u));
  });
  const frontier = Array.from(fMap.values());
  if (frontier.length > 0 && frontier.length <= 24) {
    const valid = [];
    const n = frontier.length;
    for (let mask = 0; mask < (1 << n); mask++) {
      const assign = {};
      for (let i = 0; i < n; i++) assign[frontier[i].name] = (mask >> i) & 1;
      let ok = true;
      for (const con of constraints) {
        let mc = con.covered.filter(c => c.isMine).length;
        for (const u of con.covered) {
          if (!u.isSafe && !u.isMine && assign[u.name] === 1) mc++;
        }
        if (mc !== con.reqMines) { ok = false; break; }
      }
      if (ok) valid.push(assign);
    }
    if (valid.length > 0) {
      frontier.forEach(cell => {
        const states = new Set(valid.map(a => a[cell.name]));
        if (states.has(0) && !states.has(1)) cell.isSafe = true;
        if (states.has(1) && !states.has(0)) cell.isMine = true;
      });
    }
  }

  const safeList = [], mineList = [];
  for (let r = 0; r < MINES_ROWS; r++) {
    for (let c = 0; c < MINES_COLS; c++) {
      const cell = gridData[r][c];
      if (cell.isSafe) safeList.push(cell.name);
      if (cell.isMine) mineList.push(cell.name);
    }
  }
  safeList.sort((a, b) => {
    const ca = a[0], cb = b[0], ra = parseInt(a.slice(1)), rb = parseInt(b.slice(1));
    return ca !== cb ? ca.localeCompare(cb) : ra - rb;
  });

  return { safeList, mineList };
}
