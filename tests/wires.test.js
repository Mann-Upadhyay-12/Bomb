import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { SAMPLE_MANUAL, parseWiresManual, solveWires, compileWireClause } from '../src/modules/wires/wiresSolver.js';
import { readWiresPixels } from '../src/modules/wires/wiresVision.js';

test('wires: the manual — a list per wire count, every rule understood', () => {
  const p = parseWiresManual(SAMPLE_MANUAL);
  assert.deepEqual([3, 4, 5, 6].map(n => p.sections[n].length), [4, 5, 4, 4]);
  assert.deepEqual(p.unclear, []);
  // the guide's example line
  assert.equal(p.sections[3][0].clauses[0].desc, 'no yellow wires');
  assert.equal(p.sections[3][0].cut.desc, 'second wire');
});

test('wires: other wordings — numbered, bold headers, "cut … if …", colons', () => {
  const p = parseWiresManual('**Three Wires**\n1. If there are no yellow wires: cut the second wire\n2. Otherwise cut the last wire\nFour-wire\n- Cut the first wire if the first wire is red\n- otherwise: cut wire 2');
  assert.equal(p.sections[3].length, 2);
  assert.equal(p.sections[4].length, 2);
  assert.deepEqual(p.unclear, []);
  assert.equal(solveWires(p, ['red', 'blue', 'white', 'red'], '').cut, 0);
  assert.equal(solveWires(p, ['blue', 'blue', 'white', 'red'], '').cut, 1);
});

test('wires: the first matching rule wins; a missing serial blocks only when it matters', () => {
  const p = parseWiresManual(SAMPLE_MANUAL);
  assert.equal(solveWires(p, ['red', 'blue', 'red'], '').cut, 1); // no yellow → 2nd
  // 6 wires Y K B R K W: no rule before "otherwise" matches → 4th
  assert.equal(solveWires(p, ['yellow', 'black', 'blue', 'red', 'black', 'white'], 'AB13').cut, 3);
  // 4 wires, two reds: rule 1 needs the serial
  const blocked = solveWires(p, ['red', 'red', 'blue', 'yellow'], '');
  assert.equal(blocked.blocked.n, 1);
  assert.equal(blocked.cut, -1);
  assert.equal(solveWires(p, ['red', 'red', 'blue', 'yellow'], 'X7').cut, 1); // last red
  assert.equal(solveWires(p, ['red', 'red', 'blue', 'yellow'], 'X8').match.n, 3); // exactly one blue → 1st
  // a serial that doesn't matter (the last wire isn't black) doesn't block the 5-wire list
  assert.equal(solveWires(p, ['yellow', 'yellow', 'yellow', 'yellow', 'red'], '').cut, 0);
});

test('wires: clauses', () => {
  const c = (t, wires, serial = '') => compileWireClause(t).eval({ wires, serial });
  assert.equal(c('there is more than one blue wire', ['blue', 'blue', 'red']), true);
  assert.equal(c('there are at least two red wires', ['blue', 'red']), false);
  assert.equal(c('the last wire is white or red', ['blue', 'red']), true);
  assert.equal(c('the first wire is not red', ['blue', 'red']), true);
  assert.equal(c('the last digit of the serial number is odd', ['red'], 'AB3C7'), true);
  assert.equal(c('the last digit of the serial number is odd', ['red'], ''), null);
  assert.ok(compileWireClause('the moon is full').unknown);
});

test('wires: the picture — caps find the wires, colours vote (board crops, PNG)', () => {
  const six = readWiresPixels(readPng(new URL('./fixtures/wires6_boardcrop.png', import.meta.url).pathname));
  assert.deepEqual(six.wires, ['yellow', 'black', 'blue', 'red', 'black', 'white']);
  assert.equal(six.sure, true);
  const five = readWiresPixels(readPng(new URL('./fixtures/wires5_boardcrop.png', import.meta.url).pathname));
  assert.deepEqual(five.wires, ['yellow', 'yellow', 'yellow', 'yellow', 'red']);
  assert.ok(readWiresPixels(readPng(new URL('./fixtures/memory_boardcrop.png', import.meta.url).pathname)).reason);
});
