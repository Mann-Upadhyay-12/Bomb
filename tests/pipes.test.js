// Pipes: colour buttons turn every pipe of that colour clockwise; solve = one network, no loops,
// no open ends. Fixtures: the defuser's grey picture and the helper's coloured one of the same bomb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readPipes } from '../src/modules/pipes/pipesVision.js';
import { solvePipes, isSolved, rotCW, pressText, pieceKind, N, E, S, W } from '../src/modules/pipes/pipesSolver.js';

const ch = m => ' ╵╶└╷│┌├╴┘─┴┐┤┬┼'[m];
const helperImg = readPng(new URL('./fixtures/pipes_helper.png', import.meta.url));
const defuserImg = readPng(new URL('./fixtures/pipes_defuser.png', import.meta.url));

test('pipes: rotation and piece kinds', () => {
  assert.equal(rotCW(N), E);
  assert.equal(rotCW(W), N);
  assert.equal(rotCW(N | E), E | S);
  assert.equal(rotCW(N | S, 2), N | S);
  assert.equal(rotCW(N | E | S, 4), N | E | S);
  assert.equal(pieceKind(N), 'end');
  assert.equal(pieceKind(E | W), 'straight');
  assert.equal(pieceKind(S | W), 'elbow');
  assert.equal(pieceKind(N | E | W), 'tee');
});

test('pipes: solved-board check rejects loops, open ends and splits', () => {
  // 2×2: a ring is a loop
  assert.equal(isSolved([E | S, S | W, N | E, N | W], 2, 2), false);
  // 2×2 U shape: one network, 3 joints, no loop
  assert.equal(isSolved([S, S, N | E, N | W], 2, 2), true);
  // open end off the board
  assert.equal(isSolved([N | S, S, N | E, N | W], 2, 2), false);
  // two separate pairs
  assert.equal(isSolved([E, W, E, W], 2, 2), false);
});

test('pipes: helper picture is read (shape + colour of all 25 tiles)', () => {
  const r = readPipes(helperImg.data, helperImg.width, helperImg.height);
  assert.equal(r.ok, true);
  assert.equal(r.colored, true);
  assert.equal(`${r.cols}x${r.rows}`, '5x5');
  const rows = [];
  for (let y = 0; y < 5; y++) rows.push(r.cells.slice(y * 5, y * 5 + 5).map(c => ch(c.mask)).join(''));
  assert.deepEqual(rows, ['╵┘╵┘╶', '╴├┴├┬', '╷┤┴└┬', '╶─││╴', '┘┐╷┘╵']);
  const colors = [];
  for (let y = 0; y < 5; y++) colors.push(r.cells.slice(y * 5, y * 5 + 5).map(c => c.color[0]).join(''));
  assert.deepEqual(colors, ['rgrgp', 'bgbgr', 'yggpp', 'pybbr', 'rrbpy']);
});

test('pipes: defuser picture has the same pieces, no colours', () => {
  const h = readPipes(helperImg.data, helperImg.width, helperImg.height);
  const d = readPipes(defuserImg.data, defuserImg.width, defuserImg.height);
  assert.equal(d.ok, true);
  assert.equal(d.colored, false);
  assert.deepEqual(d.cells.map(c => c.mask), h.cells.map(c => c.mask));
});

test('pipes: the bomb has one answer — red 1, yellow 3, green 3, blue 2, purple 1', () => {
  const r = readPipes(helperImg.data, helperImg.width, helperImg.height);
  const s = solvePipes(r.cells, r.cols, r.rows);
  assert.equal(s.solutions.length, 1);
  assert.deepEqual(s.solutions[0].presses, { red: 1, green: 3, purple: 1, blue: 2, yellow: 3 });
  assert.equal(isSolved(s.solutions[0].masks, 5, 5), true);
  assert.equal(pressText(s.solutions[0].presses, ['red', 'yellow', 'green', 'blue', 'purple']), 'Red ×1, Yellow ×3, Green ×3, Blue ×2, Purple ×1');
});

test('pipes: anticlockwise — same finished board, red 3, yellow 1, green 1, blue 2, purple 3', () => {
  const r = readPipes(helperImg.data, helperImg.width, helperImg.height);
  const cw = solvePipes(r.cells, r.cols, r.rows, 1);
  const ccw = solvePipes(r.cells, r.cols, r.rows, -1);
  assert.equal(ccw.solutions.length, 1);
  assert.deepEqual(ccw.solutions[0].presses, { red: 3, green: 1, purple: 3, blue: 2, yellow: 1 });
  assert.deepEqual(ccw.solutions[0].masks, cw.solutions[0].masks);
  assert.equal(pressText(ccw.solutions[0].presses, ['red', 'yellow', 'green', 'blue', 'purple']), 'Red ×3, Yellow ×1, Green ×1, Blue ×2, Purple ×3');
  // a straight looks the same after a half turn: 1 clockwise = 1 anticlockwise, not 3
  const line = [{ mask: E, color: 'blue' }, { mask: N | S, color: 'red' }, { mask: W, color: 'blue' }];
  assert.deepEqual(solvePipes(line, 3, 1, 1).solutions[0].presses, { blue: 0, red: 1 });
  assert.deepEqual(solvePipes(line, 3, 1, -1).solutions[0].presses, { blue: 0, red: 1 });
});
