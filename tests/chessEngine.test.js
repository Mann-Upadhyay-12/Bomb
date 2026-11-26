// The engine controller against a fake Stockfish that answers like the real one (measured in the
// browser, 2026-11-24): 'readyok' comes at once even mid-search, a stopped search's 'bestmove'
// comes a moment later, and every 'go' ends with exactly one 'bestmove'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachEngineForTests, askEngine, scoreAllMoves, cancelSearch, SUPERSEDED } from '../src/modules/chess/chessEngine.js';

const MOVES = { A: 'a2a3', B: 'b2b3', C: 'c2c3', D: 'd2d3' }; // each fake position's best move
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeEngine() {
  const eng = {
    onmessage: null, pos: '', search: null, sent: [], violations: [],
    emit(line) { setTimeout(() => eng.onmessage && eng.onmessage({ data: line }), 0); },
    postMessage(cmd) {
      eng.sent.push(cmd);
      if (cmd === 'isready') eng.emit('readyok');
      else if (cmd.startsWith('position fen ')) {
        if (eng.search) eng.violations.push(`position sent during a search: ${cmd}`);
        eng.pos = cmd.slice(13).split(' ')[0];
      } else if (cmd.startsWith('go movetime ')) {
        if (eng.search) eng.violations.push('go sent during a search');
        const s = { fen: eng.pos };
        s.timer = setTimeout(() => eng.finish(s), +cmd.split(' ')[2]);
        eng.search = s;
        eng.emit(`info depth 1 multipv 1 score cp 10 pv ${MOVES[s.fen]}`);
      } else if (cmd === 'stop' && eng.search) {
        const s = eng.search;
        clearTimeout(s.timer);
        setTimeout(() => eng.finish(s), 15); // after any 'readyok' already on its way
      }
    },
    finish(s) {
      if (eng.search !== s) return;
      eng.search = null;
      eng.emit(`bestmove ${MOVES[s.fen]}`);
    },
  };
  return eng;
}

test('a replaced search never answers the search after it', async () => {
  const eng = fakeEngine();
  attachEngineForTests(eng);
  const first = askEngine('A w - - 0 1', 300, null, 'win1');
  await sleep(30);
  const second = askEngine('B b - - 0 1', 50, null, 'win1'); // same window: replaces the first
  assert.equal(await first, SUPERSEDED);
  assert.equal(await second, MOVES.B, "the second search gets its own move, not the first one's");
  assert.deepEqual(eng.violations, []);
});

test('searches from different windows wait their turn and each get their own move', async () => {
  const eng = fakeEngine();
  attachEngineForTests(eng);
  const got = await Promise.all([
    askEngine('A w - - 0 1', 60, null, 'win1'),
    askEngine('B w - - 0 1', 20, null, 'win2'),
    askEngine('C b - - 0 1', 20, null, 'win3'),
  ]);
  assert.deepEqual(got, [MOVES.A, MOVES.B, MOVES.C]);
  assert.deepEqual(eng.violations, []);
});

test("a dropped search's late bestmove answers nobody", async () => {
  const eng = fakeEngine();
  attachEngineForTests(eng);
  const first = askEngine('A w - - 0 1', 300, null, 'win1');
  await sleep(30);
  cancelSearch('win1'); // the window closed (or New game)
  assert.equal(await first, SUPERSEDED);
  assert.equal(await askEngine('D b - - 0 1', 20, null, 'win2'), MOVES.D);
  assert.deepEqual(eng.violations, []);
});

test('a blunder scan replaced by a best-move search', async () => {
  const eng = fakeEngine();
  attachEngineForTests(eng);
  const scan = scoreAllMoves('A w - - 0 1', 300, null, 'win1');
  await sleep(30);
  const best = askEngine('C b - - 0 1', 20, null, 'win1');
  assert.equal(await scan, SUPERSEDED);
  assert.equal(await best, MOVES.C);
  assert.ok(eng.sent.includes('setoption name MultiPV value 1'), 'MultiPV back to 1 for the best move');
  assert.deepEqual(eng.violations, []);
});

test('a mate proven deep enough stops the search early', async () => {
  const eng = fakeEngine();
  attachEngineForTests(eng);
  const orig = eng.postMessage;
  eng.postMessage = (cmd) => { orig(cmd); if (cmd.startsWith('go')) eng.emit(`info depth 12 multipv 1 score mate 1 pv ${MOVES.A}`); };
  const t = Date.now();
  assert.equal(await askEngine('A b - - 0 1', 2000, null, 'win1'), MOVES.A);
  assert.ok(Date.now() - t < 1000, 'answered before the full think time');
});
