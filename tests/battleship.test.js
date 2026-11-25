import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBattleship, parseBattleshipText, playGame, cellName, parseCell, SAMPLE_MANUAL } from '../src/modules/battleship/battleshipSolver.js';

const FLEET = [{ len: 3, status: 'afloat' }, { len: 2, status: 'afloat' }];
const at = (...names) => names.map(n => parseCell(n, 6, 6));
const shotsOf = (hits = [], misses = []) => Object.fromEntries([...at(...hits).map(i => [i, 'hit']), ...at(...misses).map(i => [i, 'miss'])]);

test('battleship: the manual text gives the fleet', () => {
  const p = parseBattleshipText(SAMPLE_MANUAL);
  assert.deepEqual(p.ships, FLEET);
  assert.deepEqual(parseBattleshipText('Enemy fleet:\n• 3-cell ship, sunk\n• 2-cell ship, afloat').ships, [{ len: 3, status: 'sunk' }, { len: 2, status: 'afloat' }]);
  assert.deepEqual(parseBattleshipText('4 cell ship, afloat; 2 cells ship').ships.map(s => s.len), [4, 2]);
  assert.deepEqual(parseBattleshipText('C3: hit\nmiss at B4').shots, [{ cell: 'C3', result: 'hit' }, { cell: 'B4', result: 'miss' }]);
});

test('battleship: an empty board starts in the middle; every layout is counted', () => {
  const a = analyzeBattleship({ cols: 6, rows: 6, ships: FLEET, shots: {} });
  assert.ok(a.ok && a.exact);
  assert.equal(a.total, 2472);
  assert.equal(cellName(a.best[0], 6), 'C3');
  assert.deepEqual(a.ties.map(i => cellName(i, 6)), ['C3', 'D3', 'C4', 'D4']);
  assert.equal(a.mode, 'hunt');
});

test('battleship: after a hit it fires next to it, along where a ship still fits', () => {
  const a = analyzeBattleship({ cols: 6, rows: 6, ships: FLEET, shots: shotsOf(['D4'], ['C3']) });
  assert.equal(a.mode, 'target');
  assert.ok(['D3', 'D5', 'C4', 'E4'].includes(cellName(a.best[0], 6)));
  // a hit in a corner with both neighbours missed is a lie: no layout fits
  const bad = analyzeBattleship({ cols: 6, rows: 6, ships: FLEET, shots: shotsOf(['A1'], ['A2', 'B1']) });
  assert.equal(bad.ok, false);
});

test('battleship: two hits in a line with the list still "afloat" → the line goes on', () => {
  // D4 + E4 hit, neither ship sunk: the 2-cell ship is not exactly D4-E4, so the 3-cell one runs on
  const s = shotsOf(['D4', 'E4'], ['C3']);
  const a = analyzeBattleship({ cols: 6, rows: 6, ships: FLEET, shots: s, trustAfloat: true });
  const p = n => a.prob[parseCell(n, 6, 6)];
  assert.ok(p('C4') + p('F4') > 0.9);
  // once the 2-cell ship is reported sunk, it is D4-E4 and the 3-cell one is elsewhere
  const sunk = analyzeBattleship({ cols: 6, rows: 6, ships: [{ len: 3, status: 'afloat' }, { len: 2, status: 'sunk' }], shots: s });
  assert.equal(sunk.mode, 'hunt');
  assert.equal(sunk.prob[parseCell('C4', 6, 6)] < 0.3, true);
});

test('battleship: done when every ship is sunk or every ship cell is hit', () => {
  assert.equal(analyzeBattleship({ cols: 6, rows: 6, ships: FLEET.map(s => ({ ...s, status: 'sunk' })), shots: {} }).done, true);
  assert.equal(analyzeBattleship({ cols: 6, rows: 6, ships: FLEET, shots: shotsOf(['A1', 'A2', 'A3', 'C1', 'D1']) }).done, true);
  assert.equal(analyzeBattleship({ cols: 6, rows: 6, ships: [], shots: {} }).ok, false);
});

test('battleship: simulated games — about 15 shots for a 3 + 2 fleet on 6×6', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const ships = [{ len: 3 }, { len: 2 }];
  const layout = () => {
    for (;;) {
      const used = new Set(), out = [];
      let ok = true;
      for (const s of ships) {
        const across = rnd() < 0.5;
        const c = Math.floor(rnd() * (across ? 7 - s.len : 6)), r = Math.floor(rnd() * (across ? 6 : 7 - s.len));
        const cs = Array.from({ length: s.len }, (_, k) => (across ? r * 6 + c + k : (r + k) * 6 + c));
        if (cs.some(i => used.has(i))) { ok = false; break; }
        cs.forEach(i => used.add(i)); out.push(cs);
      }
      if (ok) return out;
    }
  };
  let sum = 0;
  const G = 120;
  for (let g = 0; g < G; g++) sum += playGame(layout(), ships, 6, 6);
  const avg = sum / G;
  assert.ok(avg < 16.5, `average ${avg}`);
});
