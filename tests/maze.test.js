// Maze manual strip: one image for every Maze on the bomb, maze #n → card #n
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { mzSplitStrip, mzReadManual } from '../src/modules/maze/mazeVision.js';
import { solveMazeBFS } from '../src/modules/maze/mazeSolver.js';

test('maze: a manual of n square panels is cut into n mazes (any n, stacked or side by side)', () => {
  assert.equal(mzSplitStrip(440, 440).length, 1);
  assert.equal(mzSplitStrip(440, 880).length, 2);
  assert.equal(mzSplitStrip(440, 4400).length, 10);
  assert.equal(mzSplitStrip(1320, 440).length, 3);
  const r = mzSplitStrip(440, 1320);
  assert.deepEqual(r.map(p => p.y), [0, 440, 880]);
  assert.ok(r.every(p => p.w === 440 && p.h === 440));
});

test('maze: the 2-maze strip from the game reads both boards', () => {
  const img = readPng(new URL('./fixtures/maze_strip2.png', import.meta.url).pathname);
  const mazes = mzReadManual(img.data, img.width, img.height);
  assert.equal(mazes.length, 2);
  for (const m of mazes) {
    assert.equal(m.fallback, false, 'board found');
    assert.ok(m.count > 35 && m.count < 60, `wall count ${m.count}`);
  }
  // maze 1, top row: a wall right of column 3 (x≈190) and none right of columns 1–2
  const g1 = mazes[0].grid;
  assert.equal(g1[0][2].r, true);
  assert.equal(g1[0][0].r, false);
  assert.equal(g1[0][1].r, false);
  // maze 2, top-left: wall right of column 2 in the first two rows (x≈160)
  const g2 = mazes[1].grid;
  assert.equal(g2[0][1].r, true);
  assert.equal(g2[1][1].r, true);
  // both are proper mazes: every cell reachable from the corner
  for (const m of mazes) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    assert.ok(solveMazeBFS(m.grid, { r: 0, c: 0 }, { r, c }), `cell ${r},${c} reachable`);
  }
});

test('maze: the manual strip is not taken for a defuser (dots) screenshot', () => {
  const { data } = readPng(new URL('./fixtures/maze_strip2.png', import.meta.url).pathname);
  let red = 0, yel = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g < 100 && b < 100) red++;
    if (r > 180 && g > 180 && b < 100) yel++;
  }
  assert.ok(red <= 10 && yel <= 10, `red ${red}, yellow ${yel}`); // same rule as isDotsImage
});
