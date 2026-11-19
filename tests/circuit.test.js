import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readCircuit } from '../src/modules/circuit/circuitVision.js';
import { solveCircuit, parseCircuitManual, CIRCUIT_DEFAULT_MANUAL } from '../src/modules/circuit/circuitSolver.js';

const FIX = new URL('./fixtures/circuit/', import.meta.url).pathname;
const MAN = parseCircuitManual(CIRCUIT_DEFAULT_MANUAL);
// look-alikes of the game's Circuit module (bridge checked against numpy: 5.914529…)
const CASES = { series: '32', diagonal: '9', bridge: '692/117', parallel: '72/7', real_shorted_r3: '10' }; // real_*: game screenshots

for (const [name, exact] of Object.entries(CASES)) {
  test(`circuit: ${name}`, () => {
    const { data, width, height } = readPng(FIX + name + '.png');
    const c = readCircuit(data, width, height);
    assert.ok(c.ok, c.error);
    const s = solveCircuit(c.resistors, c.A, c.B, MAN);
    assert.ok(s.ok, s.error);
    assert.equal(s.ohms.exact, exact);
  });
}

test('circuit manual parsing (aliases, decimals)', () => {
  assert.deepEqual(parseCircuitManual('Purple = 2.5 Ω\nGrey: 7\nred=1'), { violet: '2.5', gray: '7', red: '1' });
  const s = solveCircuit([{ a: 1, b: 2, color: 'violet' }, { a: 1, b: 2, color: 'violet' }], 1, 2, { violet: '2.5' });
  assert.equal(s.ohms.exact, '5/4');
});

test('circuit: shorted and open terminals', () => {
  assert.equal(solveCircuit([{ a: 1, b: 2, color: 'red' }], 1, 1, MAN).ohms.exact, '0');
  assert.ok(!solveCircuit([{ a: 1, b: 2, color: 'red' }], 1, 3, MAN).ok);
});
