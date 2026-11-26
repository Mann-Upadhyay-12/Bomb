// The Word Search default list: the game's 628-word bank (2026-11-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveWordSearch } from '../src/modules/search/searchSolver.js';
import { MASTER_SEARCH_WORDS } from '../src/modules/search/searchWords.js';

const words = MASTER_SEARCH_WORDS.split(' ');
const src = readFileSync(new URL('../src/modules/search/index.jsx', import.meta.url), 'utf8');

test('the default Word Search list is the 628-word bank', () => {
  assert.equal(words.length, 628);
  assert.equal(new Set(words).size, 628, 'no repeats');
  assert.deepEqual(words, [...words].sort(), 'alphabetical, as given');
  assert.equal(words[0], 'ABLE');
  assert.equal(words.at(-1), 'ZOOM');
  assert.ok(words.includes('MAPLE'), 'the one 5-letter word');
  for (const w of 'PALM SINK WITH SEND OKAY USER LOSS RAID DIRT LEAF BEST BIRD JOIN'.split(' ')) assert.ok(words.includes(w), `old default word ${w} kept`);
  // the sample grids find the same words as before
  assert.deepEqual(solveWordSearch([['B','E','S','T','X'],['I','X','X','X','X'],['R','X','X','X','X'],['D','X','X','X','X'],['X','X','X','X','X']], words.join(' ')).uniqueWords.sort(), ['BEST', 'BIRD']);
  assert.match(src, /SEARCH_WORDS_KEY = 'bombvision_search_words_v2'/, 'a new key, so an old saved list is replaced');
});
