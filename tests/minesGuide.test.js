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
