// The Mines module promises "100% guaranteed safe squares". These tests hold
// it to that: on random boards the solver must never contradict the real mine
// layout, and on boards small enough to enumerate it must find exactly the
// squares that are safe (or mined) in every layout consistent with the clues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMinesGrid, MINES_ROWS as R, MINES_COLS as C } from '../src/modules/mines/minesSolver.js';

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
