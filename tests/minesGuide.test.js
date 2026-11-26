// The field guide's Helper Mines picture (a real 440 × 440 board): read in node with a stub canvas,
// then solved. Conso's app gets the same reader and solver through bomb-logic.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';

const png = readPng(new URL('./fixtures/mines_guide.png', import.meta.url).pathname);
// a canvas whose drawImage keeps the picture's pixels (the board is 440 px, so it isn't scaled)
const ctx = {
  canvas: null,
  clearRect() {},
  drawImage() {},
  getImageData: (x, y, w, h) => ({ data: png.data, width: w, height: h }) // readPng gives RGBA
};
const canvas = { id: 'workCanvas', width: 0, height: 0, getContext: () => ctx };
ctx.canvas = canvas;
globalThis.document = { getElementById: () => canvas, createElement: () => canvas, body: { appendChild() {} } };

const { parseMinesBoardFromImage } = await import('../src/modules/mines/minesVision.js');
const { solveMinesGrid, MINES_TOTAL } = await import('../src/modules/mines/minesSolver.js');

test("reads the guide's Mines board and finds its 13 safe squares and 9 mines", () => {
  const cells = parseMinesBoardFromImage({ naturalWidth: png.width, naturalHeight: png.height });
  const board = cells.map(row => row.map(c => (c.state === '#' ? '.' : String(c.state))).join('')).join('/');
  assert.equal(board, '001......./001......./0011223.../11000011../.1000001../.2111212../........../..........');
  const r = solveMinesGrid(cells, { totalMines: MINES_TOTAL });
  assert.deepEqual([...r.safeList].sort(), ['A6', 'A7', 'C7', 'D1', 'D7', 'E2', 'F7', 'H2', 'H7', 'I3', 'I4', 'I5', 'I7']);
  assert.deepEqual([...r.mineList].sort(), ['A5', 'B7', 'D2', 'E7', 'F2', 'G2', 'G7', 'H3', 'I6']);
  assert.equal(r.countOk, true);
});

// "Mines reads 5 as 3" (26 Nov): the game's 5 is a dark red (#863D38), the 3 a brighter brick red
// (#B03E39), and every warm pixel was counted as a 3. A real board with a 5 (from the user, 26 Nov):
test('reads a real board with a 5 (dark red, not the 3) and solves it', () => {
  const five = readPng(new URL('./fixtures/mines_five.png', import.meta.url).pathname);
  const keep = png.data;
  png.data = five.data;
  try {
    const cells = parseMinesBoardFromImage({ naturalWidth: five.width, naturalHeight: five.height });
    const board = cells.map(row => row.map(c => (c.state === '#' ? '.' : String(c.state))).join('')).join('/');
    assert.equal(board, '........../..21.3.5../..21122.../..200013../..200001../..2011112./..311.101./...111101.');
    assert.equal(cells[1][7].state, 5, 'H2 is the 5');
    const r = solveMinesGrid(cells, { totalMines: MINES_TOTAL });
    // read as a 3 it said G1, H1, I1 and I2 were safe: they are next to the 5
    assert.deepEqual([...r.safeList].sort(), ['C1', 'D1', 'E1', 'I4', 'J6']);
    assert.deepEqual([...r.mineList].sort(), ['C8', 'E2', 'F7', 'G2', 'H3', 'I3', 'I5']);
  } finally { png.data = keep; }
});

// Other colours a 5 could come in: the guide board's 3 (G3) recoloured, edge pixels and all. The shape
// stays a 3: the reader tells digits apart by colour.
function recolouredBoard(core) {
  const data = Uint8ClampedArray.from(png.data);
  const bg = [224, 228, 232], three = [176, 62, 57];
  const d = three.map((v, i) => bg[i] - v);
  const dd = d.reduce((s, v) => s + v * v, 0);
  const cw = (409 - 33) / 10, ch = (409 - 73) / 8;
  const x0 = Math.round(33 + 6 * cw), y0 = Math.round(73 + 2 * ch);
  for (let y = y0 + 3; y < y0 + ch - 3; y++) {
    for (let x = x0 + 3; x < x0 + cw - 3; x++) {
      const i = (y * png.width + x) * 4;
      const a = Math.max(0, Math.min(1, [0, 1, 2].reduce((s, k) => s + (bg[k] - data[i + k]) * d[k], 0) / dd));
      if (a < 0.02) continue;
      for (let k = 0; k < 3; k++) data[i + k] = Math.round(bg[k] + a * (core[k] - bg[k]));
    }
  }
  return data;
}
function readG3(data) {
  const keep = png.data;
  png.data = data;
  try {
    return parseMinesBoardFromImage({ naturalWidth: png.width, naturalHeight: png.height })[2][6].state;
  } finally { png.data = keep; }
}

test('Mines tells a 5 (dark red, maroon, amber, orange or brown) from the 3 (brick red)', () => {
  assert.equal(readG3(png.data), 3, 'the real 3');
  assert.equal(readG3(recolouredBoard([198, 40, 40])), 3, 'a brighter red is still a 3');
  assert.equal(readG3(recolouredBoard([165, 62, 57])), 3, 'a slightly darker 3 is still a 3');
  assert.equal(readG3(recolouredBoard([134, 61, 56])), 5, "the game's 5 colour");
  assert.equal(readG3(recolouredBoard([145, 61, 56])), 5, 'a slightly lighter 5 is still a 5');
  for (const [name, c] of [['amber #FF8F00', [255, 143, 0]], ['muted orange', [190, 120, 40]], ['brown #8D4004', [141, 64, 4]],
    ['dark amber', [160, 110, 20]], ['maroon', [122, 30, 30]], ['yellow-orange', [210, 160, 20]]]) {
    assert.equal(readG3(recolouredBoard(c)), 5, name);
  }
  // and the rest of the board is untouched
  const cells = parseMinesBoardFromImage({ naturalWidth: png.width, naturalHeight: png.height });
  assert.equal(cells.map(row => row.map(c => (c.state === '#' ? '.' : String(c.state))).join('')).join('/'),
    '001......./001......./0011223.../11000011../.1000001../.2111212../........../..........');
});
