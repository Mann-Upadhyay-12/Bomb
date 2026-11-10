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

  // Tank solver: exhaustive search over the frontier, done by backtracking with pruning and split into
  // independent groups, so large frontiers stay fast (the old 2^n brute force froze the page at ~20+ cells).
  const isOpen = c => !c.isSafe && !c.isMine;
  const live = constraints
    .map(con => ({ cells: con.covered.filter(isOpen), need: con.reqMines - con.covered.filter(c => c.isMine).length }))
    .filter(con => con.cells.length > 0);

  // group frontier cells that share a constraint (union-find over cell names)
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  live.forEach(con => con.cells.forEach(c => { if (!parent.has(c.name)) parent.set(c.name, c.name); }));
  live.forEach(con => { for (let i = 1; i < con.cells.length; i++) parent.set(find(con.cells[i].name), find(con.cells[0].name)); });
  const groups = new Map();
  live.forEach(con => {
    const g = find(con.cells[0].name);
    if (!groups.has(g)) groups.set(g, { cells: new Map(), cons: [] });
    const grp = groups.get(g);
    grp.cons.push(con);
    con.cells.forEach(c => grp.cells.set(c.name, c));
  });

  const MAX_NODES = 2e6; // safety cap per group
  for (const grp of groups.values()) {
    const cells = Array.from(grp.cells.values());
    if (cells.length > 64) continue;
    const idx = new Map(cells.map((c, i) => [c.name, i]));
    const cons = grp.cons.map(con => ({ ids: con.cells.map(c => idx.get(c.name)), need: con.need }));
    const consOf = cells.map(() => []);
    cons.forEach((con, ci) => con.ids.forEach(id => consOf[id].push(ci)));
    const assign = new Int8Array(cells.length).fill(-1);
    const mineCnt = new Int32Array(cons.length), openCnt = new Int32Array(cons.length);
    cons.forEach((con, ci) => { openCnt[ci] = con.ids.length; });
    const seenMine = new Uint8Array(cells.length), seenSafe = new Uint8Array(cells.length);
    let solutions = 0, nodes = 0, aborted = false;

    const fits = id => consOf[id].every(ci => mineCnt[ci] <= cons[ci].need && mineCnt[ci] + openCnt[ci] >= cons[ci].need);
    const dfs = (k) => {
      if (aborted) return;
      if (++nodes > MAX_NODES) { aborted = true; return; }
      if (k === cells.length) {
        solutions++;
        for (let i = 0; i < cells.length; i++) (assign[i] ? seenMine : seenSafe)[i] = 1;
        return;
      }
      for (const v of [0, 1]) {
        assign[k] = v;
        for (const ci of consOf[k]) { openCnt[ci]--; if (v) mineCnt[ci]++; }
        if (fits(k)) dfs(k + 1);
        for (const ci of consOf[k]) { openCnt[ci]++; if (v) mineCnt[ci]--; }
        assign[k] = -1;
      }
    };
    dfs(0);
    if (aborted || solutions === 0) continue;
    cells.forEach((cell, i) => {
      if (seenSafe[i] && !seenMine[i]) cell.isSafe = true;
      if (seenMine[i] && !seenSafe[i]) cell.isMine = true;
    });
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
