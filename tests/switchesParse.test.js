import test from 'node:test';
import assert from 'node:assert/strict';
import { swParseForbidden, swMoves, swBFS } from '../src/modules/switches/switchesSolver.js';

test('the forbidden list is read however it was pasted', () => {
  assert.deepEqual(swParseForbidden('Forbidden: UDDUD, DDUUU\n• uuddu\n1. ↑↓↑↓↑'), ['UDDUD', 'DDUUU', 'UUDDU', 'UDUDU']);
  assert.deepEqual(swParseForbidden('Avoid these states. Do not flip twice.'), []);
  assert.deepEqual(swParseForbidden('UDDUDU UDDU'), []); // 6 and 4 letters are not states
});

test('moves are named by the switch that flips', () => {
  const p = swBFS('UUUUU', 'DUUUU', []);
  assert.equal(swMoves(p), 'SW1');
  assert.equal(swMoves(['UUUUU']), '');
});
