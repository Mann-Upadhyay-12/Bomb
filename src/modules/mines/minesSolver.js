// Pure Minesweeper constraint satisfaction & tank solver

export const MINES_ROWS = 8;
export const MINES_COLS = 10;
export const MINES_TOTAL = 16; // the game always hides 16 mines (user, 2026-11-24)

/**
 * Marks every covered square that is certainly safe (isSafe) or a mine (isMine).
 * opts.totalMines: how many mines the board hides. With it, the count settles what the numbers
 * can't: a 50/50 like "J7, or else J5 and J8" (16 vs 17 mines), and squares no number touches.
 * → { safeList, mineList, countOk: does the board fit the total (null without one),
 *     byCount: { safe, mines } squares only the total decided }
 */
export function solveMinesGrid(gridData, opts = {}) {
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

  // Tank solver: every way the covered squares next to numbers can hold mines, found by backtracking
  // with pruning and split into independent groups, so large frontiers stay fast (the old 2^n brute
  // force froze the page at ~20+ cells).
  const isOpen = c => !c.isSafe && !c.isMine;
  const liveConstraints = () => constraints
    .map(con => ({ cells: con.covered.filter(isOpen), need: con.reqMines - con.covered.filter(c => c.isMine).length }))
    .filter(con => con.cells.length > 0);

  for (const grp of frontierGroups(liveConstraints())) {
    const ways = layouts(grp);
    if (!ways) continue;
    grp.cells.forEach((cell, i) => {
      const can = canBe(ways, i, () => true);
      if (!can.mine) cell.isSafe = true;
      if (!can.safe) cell.isMine = true;
    });
  }

  // The total. The groups above are only tied together by it: the mines each one holds plus the
  // ones on squares no number touches ("loose") must add up to the mines still to place. A layout
  // of a group counts only if the other groups and the loose squares can make up the rest.
  let countOk = null;
  const byCount = { safe: [], mines: [] };
  if (Number.isInteger(opts.totalMines)) {
    const all = gridData.flat();
    const covered = all.filter(c => c.state === '#');
    const left = opts.totalMines - all.filter(c => c.state === 'F').length - covered.filter(c => c.isMine).length;
    const groups = frontierGroups(liveConstraints()).map(g => ({ ...g, ways: layouts(g) }));
    // mine counts each group can hold (any count, if it was too big to search)
    const counts = groups.map(g => (g.ways ? [...g.ways.keys()] : Array.from({ length: g.cells.length + 1 }, (_, k) => k)));
    const inGroup = new Set(groups.flatMap(g => g.cells.map(c => c.name)));
    const loose = covered.filter(c => isOpen(c) && !inGroup.has(c.name));
    const fits = s => left - s >= 0 && left - s <= loose.length;
    const sums = lists => [...lists.reduce((acc, ks) => new Set([...acc].flatMap(a => ks.map(k => a + k))), new Set([0]))];
    const totals = sums(counts).filter(fits);
    countOk = totals.length > 0; // false: more sure mines than the total, or too few places left
    if (countOk) {
      const marks = groups.map((g, gi) => {
        if (!g.ways) return null;
        const rest = sums(counts.filter((_, j) => j !== gi));
        return g.cells.map((_, i) => canBe(g.ways, i, k => rest.some(s => fits(s + k))));
      });
      groups.forEach((g, gi) => marks[gi] && g.cells.forEach((cell, i) => {
        if (!marks[gi][i].mine) { cell.isSafe = true; byCount.safe.push(cell.name); }
        else if (!marks[gi][i].safe) { cell.isMine = true; byCount.mines.push(cell.name); }
      }));
      const looseMines = totals.map(s => left - s);
      if (loose.length && looseMines.every(n => n === 0)) loose.forEach(c => { c.isSafe = true; byCount.safe.push(c.name); });
      if (loose.length && looseMines.every(n => n === loose.length)) loose.forEach(c => { c.isMine = true; byCount.mines.push(c.name); });
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
  safeList.sort(byName);
  byCount.safe.sort(byName);
  byCount.mines.sort(byName);
  return { safeList, mineList, countOk, byCount };
}

function byName(a, b) {
  const ca = a[0], cb = b[0], ra = parseInt(a.slice(1)), rb = parseInt(b.slice(1));
  return ca !== cb ? ca.localeCompare(cb) : ra - rb;
}

/** Live constraints ({ cells, need }) → independent groups: { cells, cons: [{ ids, need }] } (union-find). */
function frontierGroups(live) {
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
  return [...groups.values()].map(grp => {
    const cells = Array.from(grp.cells.values());
    const idx = new Map(cells.map((c, i) => [c.name, i]));
    return { cells, cons: grp.cons.map(con => ({ ids: con.cells.map(c => idx.get(c.name)), need: con.need })) };
  });
}

/**
 * Every way to put mines in a group's cells that fits its numbers, summed up by mine count:
 * Map(count → { mine, safe }) where mine[i] / safe[i] = some layout with that count has cell i
 * a mine / safe. null if the group is too big to search or no layout fits.
 */
function layouts({ cells, cons }) {
  const MAX_NODES = 2e6; // safety cap per group
  if (cells.length > 64) return null;
  const consOf = cells.map(() => []);
  cons.forEach((con, ci) => con.ids.forEach(id => consOf[id].push(ci)));
  const assign = new Int8Array(cells.length).fill(-1);
  const mineCnt = new Int32Array(cons.length), openCnt = new Int32Array(cons.length);
  cons.forEach((con, ci) => { openCnt[ci] = con.ids.length; });
  const byK = new Map();
  let nodes = 0, aborted = false, mines = 0;

  const fits = id => consOf[id].every(ci => mineCnt[ci] <= cons[ci].need && mineCnt[ci] + openCnt[ci] >= cons[ci].need);
  const dfs = (k) => {
    if (aborted) return;
    if (++nodes > MAX_NODES) { aborted = true; return; }
    if (k === cells.length) {
      if (!byK.has(mines)) byK.set(mines, { mine: new Uint8Array(cells.length), safe: new Uint8Array(cells.length) });
      const seen = byK.get(mines);
      for (let i = 0; i < cells.length; i++) (assign[i] ? seen.mine : seen.safe)[i] = 1;
      return;
    }
    for (const v of [0, 1]) {
      assign[k] = v; mines += v;
      for (const ci of consOf[k]) { openCnt[ci]--; if (v) mineCnt[ci]++; }
      if (fits(k)) dfs(k + 1);
      for (const ci of consOf[k]) { openCnt[ci]++; if (v) mineCnt[ci]--; }
      assign[k] = -1; mines -= v;
    }
  };
  dfs(0);
  return aborted || byK.size === 0 ? null : byK;
}

/** Can cell i be a mine / be safe in some layout whose mine count passes okK? */
function canBe(ways, i, okK) {
  let mine = false, safe = false;
  ways.forEach((seen, k) => { if (!okK(k)) return; if (seen.mine[i]) mine = true; if (seen.safe[i]) safe = true; });
  return { mine, safe };
}

/**
 * Does clicking the safe squares finish the board? Minesweeper is solved once every square that is
 * not a mine is open, so it is finished when every covered square left is either a sure mine or a
 * sure safe square — and the safe ones are all in `next` (the squares this input clicks).
 * Run after solveMinesGrid (it reads the isSafe / isMine marks).
 * → { solves, allKnown, safeLeft: [name], earlier: [safe names not in `next`], undecided }
 */
export function finishCheck(gridData, next) {
  const covered = (gridData || []).flat().filter(c => c && c.state === '#');
  const undecided = covered.filter(c => !c.isSafe && !c.isMine).length;
  const safeLeft = covered.filter(c => c.isSafe).map(c => c.name);
  const nextSet = next instanceof Set ? next : new Set(next || []);
  const earlier = safeLeft.filter(n => !nextSet.has(n));
  const allKnown = covered.length > 0 && undecided === 0 && safeLeft.length > 0;
  return { solves: allKnown && earlier.length === 0, allKnown, safeLeft, earlier, undecided };
}
