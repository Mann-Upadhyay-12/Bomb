// The Mines module promises "100% guaranteed safe squares". These tests hold
// it to that: on random boards the solver must never contradict the real mine
// layout, and on boards small enough to enumerate it must find exactly the
// squares that are safe (or mined) in every layout consistent with the clues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMinesGrid, MINES_ROWS as R, MINES_COLS as C, MINES_TOTAL } from '../src/modules/mines/minesSolver.js';

// Small deterministic PRNG so a failure can be reproduced from its seed.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const name = (r, c) => String.fromCharCode(65 + c) + (r + 1);
const neighbours = (r, c) => {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = r + dr, nc = c + dc;
    if ((dr || dc) && nr >= 0 && nr < R && nc >= 0 && nc < C) out.push([nr, nc]);
  }
  return out;
};

// A board as the game would show it: random mines, a few safe clicks with
// flood fill, and optionally some correctly placed flags.
function makeBoard(seed, mineCount, clicks, flagShare = 0) {
  const rand = rng(seed);
  const mine = Array.from({ length: R }, () => Array(C).fill(false));
  for (let placed = 0; placed < mineCount;) {
    const r = Math.floor(rand() * R), c = Math.floor(rand() * C);
    if (!mine[r][c]) { mine[r][c] = true; placed++; }
  }
  const count = (r, c) => neighbours(r, c).filter(([a, b]) => mine[a][b]).length;
  const open = Array.from({ length: R }, () => Array(C).fill(false));
  const reveal = (r, c) => {
    const stack = [[r, c]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (open[a][b] || mine[a][b]) continue;
      open[a][b] = true;
      if (count(a, b) === 0) stack.push(...neighbours(a, b));
    }
  };
  for (let k = 0; k < clicks; k++) {
    const r = Math.floor(rand() * R), c = Math.floor(rand() * C);
    if (!mine[r][c]) reveal(r, c);
  }
  const grid = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => ({
    r, c, name: name(r, c), isSafe: false, isMine: false,
    state: open[r][c] ? count(r, c) : (mine[r][c] && rand() < flagShare ? 'F' : '#'),
  })));
  return { grid, mine };
}

// Every way to place mines on the covered frontier that satisfies all clues.
function enumerate(grid) {
  const clues = [];
  const frontier = new Map();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = grid[r][c];
    if (typeof cell.state !== 'number') continue;
    const around = neighbours(r, c).map(([a, b]) => grid[a][b]);
    const covered = around.filter(n => n.state === '#');
    covered.forEach(n => frontier.set(n.name, n));
    clues.push({ need: cell.state - around.filter(n => n.state === 'F').length, covered: covered.map(n => n.name) });
  }
  const names = [...frontier.keys()];
  if (names.length > 16) return null;
  const index = new Map(names.map((n, i) => [n, i]));
  const masks = clues.map(k => ({ need: k.need, mask: k.covered.reduce((m, n) => m | (1 << index.get(n)), 0) }));
  const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
  let always = (1 << names.length) - 1, ever = 0, solutions = 0;
  for (let a = 0; a < 1 << names.length; a++) {
    if (masks.every(k => popcount(a & k.mask) === k.need)) { solutions++; always &= a; ever |= a; }
  }
  return {
    solutions,
    mines: names.filter((_, i) => always >> i & 1),
    safe: names.filter((_, i) => !(ever >> i & 1)),
  };
}

test('never marks a real mine as safe, or a safe square as a mine (2000 random boards)', () => {
  let deductions = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const { grid, mine } = makeBoard(seed, 6 + seed % 14, 1 + seed % 6, seed % 3 ? 0 : 0.5);
    const { safeList, mineList } = solveMinesGrid(grid);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (cell.isSafe) assert.equal(mine[r][c], false, `seed ${seed}: ${cell.name} called safe but is a mine`);
      if (cell.isMine) assert.equal(mine[r][c], true, `seed ${seed}: ${cell.name} called a mine but is safe`);
      if (cell.isSafe || cell.isMine) assert.equal(cell.state, '#', `seed ${seed}: verdict on a non-covered square ${cell.name}`);
    }
    deductions += safeList.length + mineList.length;
  }
  assert.ok(deductions > 5000, `only ${deductions} deductions: the generator is not exercising the solver`);
});

test('finds exactly the squares forced by the clues (checked against full enumeration)', () => {
  let checked = 0;
  for (let seed = 1; seed <= 4000 && checked < 400; seed++) {
    const { grid } = makeBoard(seed * 7919, 8 + seed % 10, 1 + seed % 3, seed % 2 ? 0 : 0.4);
    const truth = enumerate(grid);
    if (!truth || truth.solutions === 0 || truth.safe.length + truth.mines.length === 0) continue;
    const { safeList, mineList } = solveMinesGrid(grid);
    assert.deepEqual([...safeList].sort(), [...truth.safe].sort(), `seed ${seed}: safe squares`);
    assert.deepEqual([...mineList].sort(), [...truth.mines].sort(), `seed ${seed}: mines`);
    checked++;
  }
  assert.ok(checked >= 400, `only ${checked} boards were small enough to enumerate`);
});

test('the classic 1-2-1 pattern: mines under the 1s, safe under the 2', () => {
  // Row 1 is open (0 1 2 1 0 ...), row 2 is covered, everything else is open.
  const grid = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => ({
    r, c, name: name(r, c), isSafe: false, isMine: false, state: 0,
  })));
  const mines = new Set(['B2', 'D2']);
  for (let c = 0; c < C; c++) grid[1][c].state = '#';
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (grid[r][c].state === '#') continue;
    grid[r][c].state = neighbours(r, c).filter(([a, b]) => mines.has(name(a, b))).length;
  }
  const { safeList, mineList } = solveMinesGrid(grid);
  assert.deepEqual(mineList.sort(), ['B2', 'D2']);
  assert.deepEqual(safeList, ['A2', 'C2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2']);
});

test('contradictory clues produce no verdicts instead of wrong ones', () => {
  const grid = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => ({
    r, c, name: name(r, c), isSafe: false, isMine: false, state: '#',
  })));
  grid[0][0].state = 3;            // corner: 3 covered neighbours, all mines
  grid[0][1].state = 0;            // ...but its neighbour says none of them are
  const { safeList, mineList } = solveMinesGrid(grid);
  const both = safeList.filter(n => mineList.includes(n));
  assert.deepEqual(both, [], 'a square was reported as both safe and a mine');
});

test('empty input', () => {
  assert.deepEqual(solveMinesGrid(null), { safeList: [], mineList: [] });
  assert.deepEqual(solveMinesGrid([]), { safeList: [], mineList: [] });
});

// ── The 16-mine total (the game always hides 16) ─────────────────────────────

// Every layout that fits the clues AND puts exactly `total` mines on the board: the frontier is
// enumerated, and the squares no number touches ("loose") take whatever is left over.
function enumerateWithTotal(grid, total) {
  const clues = [];
  const frontier = new Map();
  let flags = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = grid[r][c];
    if (cell.state === 'F') flags++;
    if (typeof cell.state !== 'number') continue;
    const around = neighbours(r, c).map(([a, b]) => grid[a][b]);
    const covered = around.filter(n => n.state === '#');
    covered.forEach(n => frontier.set(n.name, n));
    clues.push({ need: cell.state - around.filter(n => n.state === 'F').length, covered: covered.map(n => n.name) });
  }
  const names = [...frontier.keys()];
  if (names.length > 16) return null;
  const loose = grid.flat().filter(n => n.state === '#' && !frontier.has(n.name)).map(n => n.name);
  const left = total - flags;
  const index = new Map(names.map((n, i) => [n, i]));
  const masks = clues.map(k => ({ need: k.need, mask: k.covered.reduce((m, n) => m | (1 << index.get(n)), 0) }));
  const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
  let always = (1 << names.length) - 1, ever = 0, solutions = 0, looseMine = false, looseSafe = false;
  for (let a = 0; a < 1 << names.length; a++) {
    if (!masks.every(k => popcount(a & k.mask) === k.need)) continue;
    const u = left - popcount(a);
    if (u < 0 || u > loose.length) continue;
    solutions++; always &= a; ever |= a;
    if (u > 0) looseMine = true;
    if (u < loose.length) looseSafe = true;
  }
  return {
    solutions,
    mines: [...names.filter((_, i) => always >> i & 1), ...(loose.length && !looseSafe ? loose : [])],
    safe: [...names.filter((_, i) => !(ever >> i & 1)), ...(loose.length && !looseMine ? loose : [])],
  };
}

const boardFrom = rows => rows.map((s, r) => [...s].map((ch, c) => ({
  r, c, name: name(r, c), isSafe: false, isMine: false, state: ch === '#' ? '#' : ch === '.' ? 0 : +ch,
})));

test('the last step of a real board: J7 or (J5 and J8) is a 50/50 until the 16-mine total settles it', () => {
  // 24 Nov game: 15 mines are sure from the numbers; J6, I7 and I8 allow either J7 (16 mines) or
  // J5 + J8 (17 mines). The game always has 16, so J5 and J8 are safe.
  const rows = [
    '#111211...',
    '222#2#1...',
    '1#21211122',
    '221....2##',
    '#311...3##',
    '#3#211.2#3',
    '2322#2233#',
    '1#1112##2#',
  ];
  const plain = solveMinesGrid(boardFrom(rows));
  assert.deepEqual(plain.safeList, []);
  assert.equal(plain.mineList.length, 15);

  const res = solveMinesGrid(boardFrom(rows), { totalMines: MINES_TOTAL });
  assert.equal(MINES_TOTAL, 16);
  assert.deepEqual(res.safeList, ['J5', 'J8']);
  assert.ok(res.mineList.includes('J7'));
  assert.equal(res.countOk, true);
  assert.deepEqual(res.byCount, { safe: ['J5', 'J8'], mines: ['J7'] });

  // a total that can't fit (fewer than the 15 sure mines) decides nothing extra
  const bad = solveMinesGrid(boardFrom(rows), { totalMines: 14 });
  assert.equal(bad.countOk, false);
  assert.deepEqual(bad.safeList, []);
  assert.deepEqual(bad.byCount, { safe: [], mines: [] });
});

test('with the total: never wrong on 2000 random 16-mine boards, and the real total always fits', () => {
  let byCount = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const { grid, mine } = makeBoard(seed * 31, 16, 1 + seed % 14, seed % 3 ? 0 : 0.5);
    const res = solveMinesGrid(grid, { totalMines: 16 });
    assert.equal(res.countOk, true, `seed ${seed}: the real total was called impossible`);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (cell.isSafe) assert.equal(mine[r][c], false, `seed ${seed}: ${cell.name} called safe but is a mine`);
      if (cell.isMine) assert.equal(mine[r][c], true, `seed ${seed}: ${cell.name} called a mine but is safe`);
    }
    byCount += res.byCount.safe.length + res.byCount.mines.length;
  }
  assert.ok(byCount > 100, `the total decided only ${byCount} squares: not exercised`);
});

test('with the total: finds exactly the squares forced by clues + 16 mines (full enumeration)', () => {
  let checked = 0, settledByCount = 0;
  for (let seed = 1; seed <= 20000 && checked < 300; seed++) {
    const { grid } = makeBoard(seed * 104729, 16, 10 + seed % 40, seed % 2 ? 0 : 0.4); // mostly late-game boards
    const truth = enumerateWithTotal(grid, 16);
    if (!truth || truth.solutions === 0) continue;
    const res = solveMinesGrid(grid, { totalMines: 16 });
    assert.deepEqual([...res.safeList].sort(), [...truth.safe].sort(), `seed ${seed}: safe squares`);
    assert.deepEqual([...res.mineList].sort(), [...truth.mines].sort(), `seed ${seed}: mines`);
    if (res.byCount.safe.length + res.byCount.mines.length) settledByCount++;
    checked++;
  }
  assert.ok(checked >= 300, `only ${checked} boards were small enough to enumerate`);
  assert.ok(settledByCount >= 30, `only ${settledByCount} boards needed the total`);
});

test('with the total: no mines left means every covered square no number touches is safe', () => {
  // two mines at A1 and C1 (2 shows it), the other 14 flagged in the bottom row and J7..J2;
  // the covered squares far from any number (E1..H2 block) can only be safe
  const rows = [
    '#2#1####..',
    '1211####..',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
  ];
  const grid = boardFrom(rows);
  // 14 flags somewhere open on the board stand for the other mines
  let placed = 0;
  for (let r = 7; r >= 3 && placed < 14; r--) for (let c = 0; c < C && placed < 14; c++) { grid[r][c].state = 'F'; placed++; }
  const res = solveMinesGrid(grid, { totalMines: 16 });
  assert.equal(res.countOk, true);
  for (const n of ['E1', 'F1', 'G1', 'H1', 'E2', 'F2', 'G2', 'H2']) assert.ok(res.safeList.includes(n), `${n} should be safe`);
});
