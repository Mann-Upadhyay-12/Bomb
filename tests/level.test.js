// Level generator: module titles on a bomb-board screenshot, in board order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readBoard, prepareRefs } from '../src/core/level/levelVision.js';
import { TITLE_REFS } from '../src/core/level/levelTitleRefs.js';

const board = readPng(new URL('./fixtures/level_board_queens.png', import.meta.url));

test('level: 3×3 board with Queens and Laundry (8 modules + an empty slot)', () => {
  const r = readBoard({ data: board.data, width: board.width, height: board.height });
  assert.deepEqual(r.titles.map(t => t.name), ['Circuit', 'Logic', 'Laundry', 'Wire Sequences', 'Pressure', 'Queens', 'Symbols', 'Circuit']);
  assert.ok(r.titles.every(t => !t.unsure), 'all sure');
});

test('level: a title with no reference stays in the list as "?" instead of vanishing', () => {
  // the board as it was read before Queens and Laundry had references
  const refs = prepareRefs(TITLE_REFS.filter(r => r.name !== 'Queens' && r.name !== 'Laundry'));
  const r = readBoard({ data: board.data, width: board.width, height: board.height }, { refs });
  assert.deepEqual(r.titles.map(t => t.name), ['Circuit', 'Logic', null, 'Wire Sequences', 'Pressure', null, 'Symbols', 'Circuit']);
  assert.ok(r.titles.filter(t => !t.name).every(t => t.unsure && t.unknown));
});

test('level: the Blackjack title (from the module picture, scaled to board size) is recognised', async () => {
  const { readPng: rp } = await import('./pngDecode.js');
  // module picture title cap height 26 px → board size 15 px, J's tail included like Queens' Q
  const img = rp(new URL('./fixtures/blackjack_defuser_6.png', import.meta.url));
  // nearest-neighbour shrink to 15/26 (the app rescales a real board itself)
  const f = 15 / 26, W = Math.round(img.width * f), H = Math.round(img.height * f);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / f)), sy = Math.min(img.height - 1, Math.floor((y + 0.5) / f));
    for (let k = 0; k < 4; k++) data[(y * W + x) * 4 + k] = img.data[(sy * img.width + sx) * 4 + k];
  }
  const r = readBoard({ data, width: W, height: H }, { pass: 1 });
  assert.deepEqual(r.titles.map(t => t.name), ['Blackjack']);
});

test('level: 2×3 "Gamma" board (Laundry, Queens, Hangman, Simon Says; two empty slots)', () => {
  const img = readPng(new URL('./fixtures/level_board_gamma.png', import.meta.url));
  const names = ['Laundry', 'Queens', 'Hangman', 'Simon Says'];
  // read as pasted (pass 1 skips the canvas rescale, which needs a browser)
  const r = readBoard({ data: img.data, width: img.width, height: img.height }, { pass: 1 });
  assert.deepEqual(r.titles.map(t => t.name), names);
  assert.ok(r.titles.every(t => !t.unsure), 'all sure');
  // the Queens puzzle's peach cells are title-coloured: they must not turn into a module
  assert.equal(r.titles.length, 4);
});

test('level: MINES is its own module, not WIRES (board with both)', () => {
  const img = readPng(new URL('./fixtures/level_board_mines.png', import.meta.url));
  const r = readBoard({ data: img.data, width: img.width, height: img.height });
  assert.deepEqual(r.titles.map(t => t.name),
    ['Search', 'Symbols', 'Morse Code', 'Wire Sequences', 'Switches', 'Switches', 'Mines', 'Wires', 'The Button']);
  assert.ok(r.titles.every(t => !t.unsure), 'all sure');
});

test('level: the full 36-module board (23 Nov) — every title, in board order', () => {
  const img = readPng(new URL('./fixtures/level_board_full.png', import.meta.url));
  const r = readBoard({ data: img.data, width: img.width, height: img.height });
  assert.deepEqual(r.titles.map(t => t.name), [
    'Astrology', 'Blackjack', 'Breaker', 'Complex Wires', 'Logic', 'Hangman',
    'Echo', 'Laundry', 'Limbo', 'Battleship', 'Memory', 'Chess',
    'The Eye', 'Search', 'Wire Placement', 'The Button', 'Symbols', 'Mines',
    'Balance', 'Diagram', 'Queens', 'Simon Says', 'Wires', 'Bluescreen',
    "Who's On First", 'Pipes', 'Wire Sequences', 'Switches', 'Knobs', 'Morse Code',
    'Piano', 'Circuit', "Rubik's Cube", 'Pressure', 'Password', 'Maze'
  ]);
  assert.deepEqual(r.titles.filter(t => t.unsure).map(t => t.name), []);
});

test('level: a red board means batteries; grey boards do not', async () => {
  const { boardIsRed } = await import('../src/core/level/levelVision.js');
  const red = readPng(new URL('./fixtures/level_board_full.png', import.meta.url));
  assert.equal(boardIsRed(red).red, true);
  assert.equal(boardIsRed(red).frameSides, 4);
  // cropped inside the frame: the dark red gaps between the cards still tell
  const x0 = 360, y0 = 360, x1 = 1260, y1 = 1080, w = x1 - x0, h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(red.data.subarray(((y0 + y) * red.width + x0) * 4, ((y0 + y) * red.width + x1) * 4), y * w * 4);
  assert.equal(boardIsRed({ data, width: w, height: h }).red, true);
  for (const f of ['level_board_gamma.png', 'level_board_mines.png', 'level_board_queens.png']) {
    assert.equal(boardIsRed(readPng(new URL(`./fixtures/${f}`, import.meta.url))).red, false, f);
  }
});
