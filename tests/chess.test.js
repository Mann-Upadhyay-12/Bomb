// Chess: each module picture holds one board with one side's pieces (the white board and the black
// board of the same bomb are pasted separately). Fixtures: 5 white boards (440×440 originals) and
// 5 black boards (400×400, cut from one picture of five stacked boards), 23 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { findBoards, detectBoardColor, readBoard } from '../src/modules/chess/chessVision.js';

// what's on each picture, read by eye
const BOARDS = {
  white_1: 'Rh5 Be4 Ng4 Pd3 Pe3 Pd2 Ke1',
  white_2: 'Bf6 Bh3 Pb2 Ke1 Rh1',
  white_3: 'Bc4 Nc3 Ph3 Rf2 Ra1 Ke1',
  white_4: 'Ph6 Pc2 Pd2 Kd1 Rf1',
  white_5: 'Bc7 Ph6 Qc4 Rf4 Pg3 Ke1 Rh1',
  black_1: 'ke8 rh8 pb5 ra4 qh2',
  black_2: 'ke8 rh8 pd7 pe6 pb5 bf4 pg4',
  black_3: 'ra8 ke8 bd7 pb6 pg3 bb1',
  black_4: 'kc8 qd8 pc6 pd6 pa5 rb3',
  black_5: 'ra8 bc8 ke8 rh8 nh7 bb5 pb4 pf3'
};

const square = i => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
const sorted = s => s.split(' ').sort().join(' ');

for (const [name, want] of Object.entries(BOARDS)) {
  test(`chess: ${name.replace('_', ' board ')} is read`, () => {
    const { data, width, height } = readPng(new URL(`./fixtures/chess_${name}.png`, import.meta.url));
    const boards = findBoards(data, width, height);
    assert.equal(boards.length, 1, 'one board found');
    const color = detectBoardColor(data, width, boards[0]);
    assert.equal(color, name.split('_')[0], 'side told from the pieces');
    const { pieces } = readBoard(data, width, boards[0], color);
    const got = pieces.map((p, i) => (p ? p + square(i) : '')).filter(Boolean).join(' ');
    assert.equal(sorted(got), sorted(want));
  });
}
