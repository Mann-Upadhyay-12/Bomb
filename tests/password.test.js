// Password rows: every 5 letters is a row, separators are optional
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPasswordRows } from '../src/modules/password/passwordSolver.js';

test('password: rows are every 5 letters, with or without separators', () => {
  const want = ['LHLOD', 'LBANE', 'THAIR'];
  assert.deepEqual(splitPasswordRows('LHLODLBANETHAIR'), want);
  assert.deepEqual(splitPasswordRows('lhlod lbane\nthair'), want);
  assert.deepEqual(splitPasswordRows('LHLOD, LBANE;\n\n THAIR '), want);
  assert.deepEqual(splitPasswordRows('LHLODLBANETH'), ['LHLOD', 'LBANE']); // unfinished row left out
  assert.deepEqual(splitPasswordRows(''), []);
});
