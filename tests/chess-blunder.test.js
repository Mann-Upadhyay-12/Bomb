// Chess "blunder" questions: every legal move is scored (Stockfish MultiPV) and the worst one is kept.
// The lines below are real Stockfish 10 output for Black to move after 1.e4 e5 2.Bc4 Nc6 3.Qh5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiPvCollector, moveValue } from '../src/modules/chess/chessEngine.js';

const LINES = [
  'info depth 4 seldepth 6 multipv 1 score cp -40 nodes 900 nps 9000 time 100 pv g7g6 h5f3 g8f6',
  'info depth 4 seldepth 6 multipv 2 score cp -60 nodes 900 nps 9000 time 100 pv d8e7 b1c3',
  'info depth 4 seldepth 2 multipv 3 score mate -1 nodes 900 nps 9000 time 100 pv a7a6 h5f7',
  // the next iteration: slot 3 now holds a different move, a7a6 moved to slot 4
  'info depth 5 seldepth 7 multipv 1 score cp -35 nodes 2000 nps 9000 time 200 pv g7g6 h5f3 g8f6',
  'info depth 5 seldepth 7 multipv 2 score cp -55 nodes 2000 nps 9000 time 200 pv d8e7 b1c3',
  'info depth 5 seldepth 3 multipv 3 score mate -2 nodes 2000 nps 9000 time 200 pv e8e7 h5e5',
  'info depth 5 seldepth 2 multipv 4 score mate -1 nodes 2000 nps 9000 time 200 pv a7a6 h5f7',
  'info depth 5 seldepth 2 multipv 5 score mate -1 nodes 2000 nps 9000 time 200 pv h7h6 h5f7',
  'bestmove g7g6 ponder h5f3'
];

test('chess blunder: mates rank below any material score, and being mated sooner is worse', () => {
  assert.ok(moveValue({ mate: -1 }) < moveValue({ mate: -3 }));
  assert.ok(moveValue({ mate: -3 }) < moveValue({ cp: -2000 }));
  assert.ok(moveValue({ mate: 2 }) > moveValue({ mate: 5 }));
  assert.ok(moveValue({ mate: 5 }) > moveValue({ cp: 2000 }));
});

test('chess blunder: every move once, from its latest line, worst first', () => {
  const col = multiPvCollector();
  LINES.forEach(l => col.line(l));
  const ms = col.moves();
  assert.deepEqual(ms.map(m => m.uci), ['a7a6', 'h7h6', 'e8e7', 'd8e7', 'g7g6']);
  assert.deepEqual(ms.slice(0, 2).map(m => m.mate), [-1, -1]); // two moves walk into mate in 1: tied worst
  assert.equal(ms[0].depth, 5);
  assert.equal(ms[ms.length - 1].cp, -35);
});
